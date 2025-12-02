import { NextRequest, NextResponse } from "next/server"
import { uploadVideoToSupabase, saveFilmMetadata } from "@/lib/supabase"
import { jsonrepair } from "jsonrepair"

const FAL_KEY = process.env.FAL_KEY

interface FalAIRequest {
  prompt: string
  negative_prompt: string
  num_inference_steps: number
  audio_negative_prompt: string
  resolution: string
}

interface FalAIQueueResponse {
  request_id: string
}

interface FalAIStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
  request_id: string
  response_url: string
  status_url: string
  cancel_url: string
}

interface FalAIResultResponse {
  video: {
    url: string
    content_type: string
    file_name: string
    file_size: number
  }
  seed: number
}

const CONSERVATIVE_NEGATIVE_PROMPT = [
  "human face",
  "full body",
  "people",
  "person",
  "animals",
  "romance",
  "intimacy",
  "dancing",
  "alcohol",
  "nudity",
  "sexual content",
  "violence",
  "gore",
  "horror",
  "dating",
  "flirting",
  "suggestive",
  "jitter",
  "bad hands",
  "blur",
  "distortion",
].join(", ")

const CONSERVATIVE_AUDIO_NEGATIVE_PROMPT = [
  "romantic voice",
  "seductive voice",
  "female voice",
  "whispering",
  "soft intimate tone",
  "robotic",
  "muffled",
  "echo",
  "distorted",
].join(", ")

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shots, filmSlug, script, concept } = body

    console.log("Raw shots input type:", typeof shots)
    console.log("Raw shots input:", JSON.stringify(shots).substring(0, 500))

    if (!shots) {
      return NextResponse.json(
        { error: "Invalid shots format" },
        { status: 400 }
      )
    }

    // Parse the shots into individual prompts
    const shotPrompts = normalizeShotsToPrompts(shots)

    console.log(`Parsed ${shotPrompts.length} shot prompts from input`)
    console.log("Shot prompts:", shotPrompts)

    if (shotPrompts.length === 0) {
      return NextResponse.json(
        { error: "No valid shots found" },
        { status: 400 }
      )
    }

    if (!FAL_KEY) {
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500 }
      )
    }

    // Step 1: Submit all videos to fal.ai queue (parallel)
    console.log(`Submitting ${shotPrompts.length} shots to fal.ai...`)
    const queuePromises = shotPrompts.map(async (prompt, idx) => {
      const queueResponse = await fetch("https://queue.fal.run/fal-ai/ovi", {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          negative_prompt: CONSERVATIVE_NEGATIVE_PROMPT,
          num_inference_steps: 30,
          audio_negative_prompt: CONSERVATIVE_AUDIO_NEGATIVE_PROMPT,
          resolution: "512x960",
        } as FalAIRequest),
      })

      if (!queueResponse.ok) {
        const errorText = await queueResponse.text().catch(() => null)
        console.error(`Failed to submit shot ${idx + 1}. Status: ${queueResponse.status}, Response:`, errorText)

        let errorData = null
        if (errorText) {
          try {
            errorData = JSON.parse(errorText)
          } catch {
            // Not JSON
          }
        }

        // Check both 'error' and 'detail' fields (fal.ai uses 'detail')
        const errorMsg = errorData?.error || errorData?.detail || errorText || 'Unknown error'
        const errorMsgStr = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
        const errorMsgLower = errorMsgStr.toLowerCase()

        // Check for credit/quota/balance errors
        if (
          errorMsgLower.includes("credit") ||
          errorMsgLower.includes("quota") ||
          errorMsgLower.includes("insufficient") ||
          errorMsgLower.includes("balance") ||
          errorMsgLower.includes("exhausted") ||
          errorMsgLower.includes("locked")
        ) {
          throw new Error(`CREDIT_EXHAUSTED: The video generation service has run out of credits. Please contact the developer.`)
        }

        // Return the actual error message from fal.ai
        throw new Error(`Failed to submit shot ${idx + 1}: ${errorMsgStr}`)
      }

      const queueData: FalAIQueueResponse = await queueResponse.json()
      return { requestId: queueData.request_id, shotIndex: idx }
    })

    const queueResults = await Promise.all(queuePromises)
    console.log(`All ${queueResults.length} shots submitted to queue`)

    // Step 2: Poll for completion (parallel)
    console.log("Waiting for video generation to complete...")
    const completionPromises = queueResults.map(async ({ requestId, shotIndex }) => {
      try {
        console.log(`Polling for shot ${shotIndex + 1} (request ID: ${requestId})...`)
        const falVideoUrl = await pollForCompletion(requestId)
        console.log(`Shot ${shotIndex + 1} completed: ${falVideoUrl}`)
        return { falVideoUrl, requestId, shotIndex }
      } catch (error) {
        console.error(`Failed to generate shot ${shotIndex + 1}:`, error)
        throw new Error(`Failed to generate shot ${shotIndex + 1}: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    })

    const completedVideos = await Promise.all(completionPromises)
    console.log(`All ${completedVideos.length} videos generated successfully`)

    // Step 3: Download and upload to Supabase (parallel)
    console.log("Uploading videos to Supabase...")
    const uploadPromises = completedVideos.map(async ({ falVideoUrl, requestId, shotIndex }) => {
      try {
        console.log(`Downloading shot ${shotIndex + 1} from fal.ai...`)
        const videoFetch = await fetch(falVideoUrl)
        if (!videoFetch.ok) {
          throw new Error(`Failed to download video for shot ${shotIndex + 1}: ${videoFetch.statusText}`)
        }
        const arrayBuffer = await videoFetch.arrayBuffer()
        const videoBlob = new Blob([arrayBuffer], { type: "video/mp4" })

        console.log(`Uploading shot ${shotIndex + 1} to Supabase...`)
        const filename = `${requestId}_${shotIndex + 1}.mp4`
        const supabaseUrl = await uploadVideoToSupabase(
          videoBlob,
          filename,
          typeof filmSlug === "string" && filmSlug.trim().length > 0
            ? filmSlug
            : undefined
        )

        console.log(`Successfully uploaded shot ${shotIndex + 1} to Supabase: ${supabaseUrl}`)
        return { supabaseUrl, shotIndex }
      } catch (error) {
        console.error(`Failed to upload shot ${shotIndex + 1}:`, error)
        throw new Error(`Failed to upload shot ${shotIndex + 1}: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    })

    const uploadedVideos = await Promise.all(uploadPromises)

    // Sort by shot index to maintain order
    const supabaseVideoUrls = uploadedVideos
      .sort((a, b) => a.shotIndex - b.shotIndex)
      .map(v => v.supabaseUrl)

    console.log(`All ${supabaseVideoUrls.length} videos uploaded to Supabase`)

    // Save metadata in background (don't await)
    if (filmSlug && (script || shots || concept)) {
      saveFilmMetadataInBackground(filmSlug, {
        script,
        shots: typeof shots === "string" ? shots : JSON.stringify(shots),
        concept,
      })
    }

    return NextResponse.json({
      success: true,
      videos: supabaseVideoUrls,
      count: supabaseVideoUrls.length,
    })
  } catch (error) {
    console.error("Error generating videos:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to generate videos"

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}

// Background function to save film metadata
async function saveFilmMetadataInBackground(
  filmSlug: string,
  metadata: {
    script?: string
    shots?: string
    concept?: string
  }
) {
  try {
    await saveFilmMetadata(filmSlug, metadata)
    console.log(`Successfully saved metadata for film: ${filmSlug}`)
  } catch (error) {
    console.error(`Error saving metadata for film ${filmSlug}:`, error)
  }
}

function normalizeShotsToPrompts(shotsInput: unknown): string[] {
  // Supports: JSON string with { shots: string[] }, raw string with line-based shots, or direct string[]
  try {
    if (Array.isArray(shotsInput)) {
      return shotsInput.filter(
        (s) => typeof s === "string" && s.trim().length > 0
      )
    }
    if (typeof shotsInput === "string") {
      const trimmed = shotsInput.trim()

      // Try parsing as JSON first
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          // Use jsonrepair to fix malformed JSON from LLM
          const repairedJson = jsonrepair(trimmed)
          const parsed = JSON.parse(repairedJson)

          // Case 1: Direct array
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (s) => typeof s === "string" && s.trim().length > 0
            )
          }

          // Case 2: Object with shots property
          if (parsed && parsed.shots) {
            // Case 2a: shots is already an array
            if (Array.isArray(parsed.shots)) {
              return parsed.shots.filter(
                (s: unknown) =>
                  typeof s === "string" && (s as string).trim().length > 0
              )
            }

            // Case 2b: shots is a JSON string that needs to be parsed again (double-encoded)
            if (typeof parsed.shots === "string") {
              try {
                let shotsStr = parsed.shots

                // Apply multiple fixes for common LLM errors
                // Fix 1: Remove premature quotes before section markers
                shotsStr = shotsStr.replace(/"\n\[(VISUAL|SPEECH|AUDIO)\]/g, '\n[$1]')
                shotsStr = shotsStr.replace(/"\n<(S|\/S)>/g, '\n<$1>')

                // Fix 2: Escape literal newlines (preserve already-escaped ones)
                shotsStr = shotsStr.replace(/([^\\])\n/g, '$1\\n')
                shotsStr = shotsStr.replace(/^\n/g, '\\n')

                // Try parsing the fixed JSON
                const innerParsed = JSON.parse(shotsStr)
                if (Array.isArray(innerParsed)) {
                  console.log(`Found ${innerParsed.length} shots (double-encoded JSON, custom fix)`)
                  return innerParsed.filter(
                    (s: unknown) =>
                      typeof s === "string" && (s as string).trim().length > 0
                  )
                }
              } catch (innerError) {
                // Strategy 2: Use jsonrepair on the original
                try {
                  const repairedInnerJson = jsonrepair(parsed.shots)
                  const innerParsed = JSON.parse(repairedInnerJson)
                  if (Array.isArray(innerParsed)) {
                    console.log(`Found ${innerParsed.length} shots (double-encoded JSON, jsonrepair)`)
                    return innerParsed.filter(
                      (s: unknown) =>
                        typeof s === "string" && (s as string).trim().length > 0
                    )
                  }
                } catch (repairError) {
                  // Strategy 3: Try jsonrepair on the fixed version
                  try {
                    let shotsStr = parsed.shots
                    shotsStr = shotsStr.replace(/"\n\[(VISUAL|SPEECH|AUDIO)\]/g, '\n[$1]')
                    shotsStr = shotsStr.replace(/"\n<(S|\/S)>/g, '\n<$1>')
                    shotsStr = shotsStr.replace(/([^\\])\n/g, '$1\\n')
                    shotsStr = shotsStr.replace(/^\n/g, '\\n')

                    const repairedInnerJson = jsonrepair(shotsStr)
                    const innerParsed = JSON.parse(repairedInnerJson)
                    if (Array.isArray(innerParsed)) {
                      console.log(`Found ${innerParsed.length} shots (double-encoded JSON, custom fix + jsonrepair)`)
                      return innerParsed.filter(
                        (s: unknown) =>
                          typeof s === "string" && (s as string).trim().length > 0
                      )
                    }
                  } catch (fallbackError) {
                    console.log("Inner JSON parsing failed with all strategies, treating shots as text")
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log("JSON parsing failed (even with repair), falling back to text parsing")
        }
      }

      // Try to detect shot patterns like "Shot 1:", "Scene 1:", etc.
      const shotPattern = /(?:Shot|Scene|shot|scene)\s*\d+[:\.]?\s*/gi
      if (shotPattern.test(trimmed)) {
        const shots = trimmed.split(shotPattern).filter(s => s.trim().length > 0)
        console.log(`Found ${shots.length} shots using pattern matching`)
        return shots.map(s => s.trim())
      }

      // Fallback: split by double newlines
      const shots = trimmed
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      console.log(`Found ${shots.length} shots using newline splitting`)
      return shots
    }
  } catch (error) {
    console.error("Error in normalizeShotsToPrompts:", error)
    // On parse failure, fallback to line-based segmentation
    if (typeof shotsInput === "string") {
      return shotsInput
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }
  }
  return []
}

async function pollForCompletion(requestId: string): Promise<string> {
  const maxAttempts = 120 // 10 minutes max (5 second intervals) - enough for 5 shots
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/ovi/requests/${requestId}/status`,
        {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
          },
        }
      )

      if (!statusResponse.ok) {
        throw new Error(`Failed to check video generation status: ${statusResponse.statusText}`)
      }

      const statusData: FalAIStatusResponse = await statusResponse.json()
      console.log(`Request ${requestId} status: ${statusData.status} (attempt ${attempts + 1}/${maxAttempts})`)

      if (statusData.status === "COMPLETED") {
        console.log(`Request ${requestId} completed, fetching result...`)
        // Fetch the actual result from response_url
        const resultResponse = await fetch(statusData.response_url, {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
          },
        })

        if (!resultResponse.ok) {
          throw new Error(`Failed to fetch video result: ${resultResponse.statusText}`)
        }

        const resultData: FalAIResultResponse = await resultResponse.json()

        if (resultData.video?.url) {
          console.log(`Request ${requestId} video URL retrieved: ${resultData.video.url}`)
          return resultData.video.url
        }

        throw new Error("Video completed but no URL returned")
      }

      if (statusData.status === "FAILED") {
        // Check if it's a credit/quota error
        const errorResponse = await fetch(statusData.response_url, {
          headers: {
            Authorization: `Key ${FAL_KEY}`,
          },
        }).catch(() => null)

        if (errorResponse) {
          const errorData = await errorResponse.json().catch(() => null)
          if (errorData?.error) {
            const errorMsg = errorData.error.toLowerCase()
            if (errorMsg.includes("credit") || errorMsg.includes("quota") || errorMsg.includes("insufficient")) {
              throw new Error("CREDIT_EXHAUSTED: The video generation service has run out of credits. Please contact the developer.")
            }
          }
        }

        throw new Error("Video generation failed at fal.ai")
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000))
      attempts++
    } catch (error) {
      console.error(`Error polling request ${requestId} (attempt ${attempts + 1}):`, error)
      // Re-throw the error to be caught by the caller
      throw error
    }
  }

  throw new Error(`Video generation timed out after ${maxAttempts * 5} seconds`)
}
