import { NextRequest, NextResponse } from "next/server"
import { uploadVideoToSupabase } from "@/lib/supabase"

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
    const { shots, filmSlug } = body

    if (!shots) {
      return NextResponse.json(
        { error: "Invalid shots format" },
        { status: 400 }
      )
    }

    // Parse the shots into individual prompts
    const shotPrompts = normalizeShotsToPrompts(shots)

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

    // Generate videos for each shot concurrently
    const uploadedUrls: string[] = await Promise.all(
      shotPrompts.map(async (prompt, idx) => {
        // Submit to Fal AI queue
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
          throw new Error(`Failed to submit shot ${idx + 1} to Fal AI`)
        }

        const queueData: FalAIQueueResponse = await queueResponse.json()
        const requestId = queueData.request_id

        // Poll for completion and retrieve Fal video URL
        const falVideoUrl = await pollForCompletion(requestId)

        // Fetch the video and upload to Supabase Storage
        const videoFetch = await fetch(falVideoUrl)
        if (!videoFetch.ok) {
          throw new Error(
            `Failed to download generated video for shot ${idx + 1}`
          )
        }
        const arrayBuffer = await videoFetch.arrayBuffer()
        const videoBlob = new Blob([arrayBuffer], { type: "video/mp4" })

        const filename = `${requestId}_${idx + 1}.mp4`
        const publicUrl = await uploadVideoToSupabase(
          videoBlob,
          filename,
          typeof filmSlug === "string" && filmSlug.trim().length > 0
            ? filmSlug
            : undefined
        )

        return publicUrl
      })
    )

    return NextResponse.json({
      success: true,
      videos: uploadedUrls,
      count: uploadedUrls.length,
    })
  } catch (error) {
    console.error("Error generating videos:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate videos",
      },
      { status: 500 }
    )
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
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (s) => typeof s === "string" && s.trim().length > 0
          )
        }
        if (parsed && Array.isArray(parsed.shots)) {
          return parsed.shots.filter(
            (s: unknown) =>
              typeof s === "string" && (s as string).trim().length > 0
          )
        }
      }
      // Fallback: split by blank lines to approximate shots
      return trimmed
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }
  } catch {
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
  const maxAttempts = 60 // 5 minutes max (5 second intervals)
  let attempts = 0

  while (attempts < maxAttempts) {
    const statusResponse = await fetch(
      `https://queue.fal.run/fal-ai/ovi/requests/${requestId}/status`,
      {
        headers: {
          Authorization: `Key ${FAL_KEY}`,
        },
      }
    )

    if (!statusResponse.ok) {
      throw new Error("Failed to check video generation status")
    }

    const statusData: FalAIStatusResponse = await statusResponse.json()

    if (statusData.status === "COMPLETED") {
      // Fetch the actual result from response_url
      const resultResponse = await fetch(statusData.response_url, {
        headers: {
          Authorization: `Key ${FAL_KEY}`,
        },
      })

      if (!resultResponse.ok) {
        throw new Error("Failed to fetch video result")
      }

      const resultData: FalAIResultResponse = await resultResponse.json()

      if (resultData.video?.url) {
        return resultData.video.url
      }

      throw new Error("Video completed but no URL returned")
    }

    if (statusData.status === "FAILED") {
      throw new Error("Video generation failed")
    }

    // Wait 5 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 5000))
    attempts++
  }

  throw new Error("Video generation timed out")
}
