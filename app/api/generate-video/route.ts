import { NextRequest, NextResponse } from "next/server"

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
  output?: {
    video?: {
      url: string
    }
  }
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
    const { shots } = body

    if (!shots || typeof shots !== "string") {
      return NextResponse.json(
        { error: "Invalid shots format" },
        { status: 400 }
      )
    }

    // Parse the shots into individual prompts
    const shotPrompts = extractShotPrompts(shots)

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

    // Generate videos for each shot
    const videoUrls: string[] = []

    for (let i = 0; i < shotPrompts.length; i++) {
      const prompt = shotPrompts[i]

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
          resolution: "992x512",
        } as FalAIRequest),
      })

      if (!queueResponse.ok) {
        throw new Error(`Failed to submit shot ${i + 1} to Fal AI`)
      }

      const queueData: FalAIQueueResponse = await queueResponse.json()
      const requestId = queueData.request_id

      // Poll for completion
      const videoUrl = await pollForCompletion(requestId)
      videoUrls.push(videoUrl)
    }

    return NextResponse.json({
      success: true,
      videos: videoUrls,
      count: videoUrls.length,
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

function extractShotPrompts(shots: string): string[] {
  // Parse the shots string to extract individual prompts
  // This will depend on your shot format - adjust as needed
  const shotLines = shots.split("\n").filter((line) => line.trim())
  const prompts: string[] = []

  let currentPrompt = ""
  for (const line of shotLines) {
    // Look for shot markers or prompts
    if (line.match(/^(Shot|SHOT|\d+\.)/i)) {
      if (currentPrompt) {
        prompts.push(currentPrompt.trim())
      }
      currentPrompt = line
    } else if (currentPrompt) {
      currentPrompt += " " + line
    } else {
      currentPrompt = line
    }
  }

  if (currentPrompt) {
    prompts.push(currentPrompt.trim())
  }

  return prompts.filter((p) => p.length > 0)
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
      if (statusData.output?.video?.url) {
        return statusData.output.video.url
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
