import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

let ffmpeg: FFmpeg | null = null
let isLoaded = false

/**
 * Initialize FFmpeg.wasm in the browser
 * This only needs to be called once
 */
export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && isLoaded) {
    return ffmpeg
  }

  ffmpeg = new FFmpeg()

  // Load FFmpeg core from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })

  isLoaded = true
  console.log("FFmpeg.wasm loaded successfully")

  return ffmpeg
}

/**
 * Stitch multiple video blobs into a single video
 * @param videoBlobs Array of video blobs to concatenate
 * @param onProgress Optional callback for progress updates
 * @returns Final stitched video as a Blob
 */
export async function stitchVideos(
  videoBlobs: Blob[],
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpegInstance = await loadFFmpeg()

  // If only one video, return it directly
  if (videoBlobs.length === 1) {
    return videoBlobs[0]
  }

  try {
    // Write all input videos to FFmpeg virtual filesystem
    const inputFiles: string[] = []
    for (let i = 0; i < videoBlobs.length; i++) {
      const filename = `input${i}.mp4`
      inputFiles.push(filename)
      await ffmpegInstance.writeFile(filename, await fetchFile(videoBlobs[i]))

      if (onProgress) {
        // Progress: 0-30% for writing files
        onProgress((i / videoBlobs.length) * 30)
      }
    }

    // Create concat list file
    const concatList = inputFiles.map((file) => `file '${file}'`).join("\n")
    await ffmpegInstance.writeFile("concat.txt", concatList)

    // Set up progress listener
    if (onProgress) {
      ffmpegInstance.on("progress", ({ progress }) => {
        // Progress: 30-90% for FFmpeg processing
        onProgress(30 + progress * 60)
      })
    }

    // Run FFmpeg concat command
    await ffmpegInstance.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.txt",
      "-c",
      "copy",
      "output.mp4",
    ])

    // Read the output file
    const data = await ffmpegInstance.readFile("output.mp4")

    if (onProgress) {
      onProgress(95)
    }

    // Clean up virtual filesystem
    for (const file of inputFiles) {
      await ffmpegInstance.deleteFile(file)
    }
    await ffmpegInstance.deleteFile("concat.txt")
    await ffmpegInstance.deleteFile("output.mp4")

    if (onProgress) {
      onProgress(100)
    }

    // Convert returned FileData/Uint8Array to an accepted BlobPart
    // Some bundler/TypeScript configs see FileData as Uint8Array<ArrayBufferLike>
    // BlobParts require ArrayBufferView<ArrayBuffer> or ArrayBuffer, so we copy to a fresh ArrayBuffer.
    const arrayBuffer: ArrayBuffer =
      data instanceof Uint8Array
        ? data.buffer.slice(0) // ensure ArrayBuffer, detach potential SharedArrayBuffer
        : new Uint8Array(data as any).buffer.slice(0)
    return new Blob([arrayBuffer], { type: "video/mp4" })
  } catch (error) {
    console.error("Error stitching videos:", error)
    throw new Error(
      `Failed to stitch videos: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    )
  }
}

/**
 * Download a video from a URL as a Blob
 * Supports both remote URLs (http/https) and local paths (for testing)
 */
export async function downloadVideo(url: string): Promise<Blob> {
  // For local testing paths, fetch from the public folder
  if (url.startsWith("/videos/")) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch local video: ${url}`)
    }
    return response.blob()
  }

  // For remote URLs
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${url}`)
  }
  return response.blob()
}
