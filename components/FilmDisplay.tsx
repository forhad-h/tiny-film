"use client"

import { useEffect, useState } from "react"
import { useFilm } from "@/lib/FilmContext"
import { stitchVideos, downloadVideo } from "@/lib/ffmpeg-browser"

export default function FilmDisplay() {
  const { state, setState } = useFilm()
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>("")

  useEffect(() => {
    // Automatically start video generation when shots are completed
    if (
      state.step === "completed" &&
      state.shots &&
      !state.videoUrl &&
      !isGeneratingVideo &&
      !videoError
    ) {
      generateVideo()
    }
  }, [state.step, state.shots, state.videoUrl])

  const generateVideo = async () => {
    if (!state.shots) return

    setIsGeneratingVideo(true)
    setVideoError(null)
    setProgress("Starting video generation...")
    setState({ ...state, step: "generating-video" })

    try {
      // Step 1: Generate videos for each shot (returns fal.ai URLs immediately)
      setProgress("Generating videos from shots...")
      const videoResponse = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shots: state.shots, filmSlug: state.filmSlug }),
      })

      const videoData = await videoResponse.json()

      if (!videoResponse.ok || videoData.error) {
        throw new Error(videoData.error || "Failed to generate videos")
      }

      // Get fal.ai URLs - available immediately after generation
      const falVideoUrls = videoData.videos

      // Step 2: Download all videos from fal.ai URLs
      setProgress(`Downloading ${falVideoUrls.length} videos...`)
      const videoBlobs = await Promise.all(
        falVideoUrls.map((url: string) => downloadVideo(url))
      )

      // Step 3: Stitch videos together using FFmpeg.wasm
      setProgress("Stitching videos together...")
      const finalVideo = await stitchVideos(videoBlobs, (prog) => {
        setProgress(`Stitching videos: ${Math.round(prog)}%`)
      })

      // Step 4: Create blob URL for the final stitched video
      const videoUrl = URL.createObjectURL(finalVideo)

      setProgress("Complete!")

      // Update state with final video (Supabase upload happens in background)
      setState({
        ...state,
        videoUrl: videoUrl,
        videoUrls: falVideoUrls,
        step: "completed",
      })
      setIsGeneratingVideo(false)
    } catch (error) {
      console.error("Error generating video:", error)
      setVideoError(
        error instanceof Error ? error.message : "Failed to generate video"
      )
      setState({ ...state, step: "completed" })
      setIsGeneratingVideo(false)
    }
  }

  const renderContent = () => {
    // Show loading state during initial processing steps (but not idle)
    if (
      state.step !== "idle" &&
      state.step !== "completed" &&
      state.step !== "generating-video"
    ) {
      return (
        <div className="aspect-video bg-gray-900 rounded-lg border-2 border-gray-700 flex items-center justify-center">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
            <p className="text-gray-400 text-lg font-medium">
              {typeof state.step === "string"
                ? state.step.replace(/-/g, " ").toUpperCase()
                : "LOADING"}
              ...
            </p>
          </div>
        </div>
      )
    }

    // Show idle/empty state
    if (!state.videoUrl && !isGeneratingVideo) {
      return (
        <>
          <div className="aspect-video bg-gray-900 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center">
            <div className="text-center">
              <svg
                className="mx-auto h-16 w-16 text-gray-600 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                />
              </svg>
              <p className="text-gray-500 text-lg font-medium">
                No film generated yet
              </p>
              <p className="text-gray-600 text-sm mt-2">
                Use the chat to describe your film idea
              </p>
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        {/* Video Player */}
        {state.videoUrl && (
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 mb-4">
            <video
              controls
              className="w-full max-h-[80vh] rounded-lg bg-black object-contain"
              src={state.videoUrl}
              style={{ display: "block", margin: "0 auto" }}
            >
              Your browser does not support the video tag.
            </video>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-400 max-w-sm">
                We do not store your video on our servers. Please download and
                save it locally if you want to keep it.
              </p>
              <a
                href={state.videoUrl}
                download={`${state.filmSlug || "micro-film"}.mp4`}
                className="inline-flex items-center justify-center rounded bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium transition-colors shadow focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M8 12l4 4m0 0l4-4m-4 4V4"
                  />
                </svg>
                Download Video
              </a>
            </div>
          </div>
        )}

        {/* Video Generation Progress */}
        {isGeneratingVideo && (
          <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
              <div>
                <p className="text-blue-300 font-medium">
                  Generating your film...
                </p>
                <p className="text-blue-400 text-sm">
                  {progress || "This may take a few minutes."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Video Error */}
        {videoError && (
          <div className="bg-red-900 bg-opacity-20 border border-red-700 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <svg
                className="w-6 h-6 text-red-500 mr-3 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-red-300 font-medium">
                  Video generation failed
                </p>
                <p className="text-red-400 text-sm">{videoError}</p>
                <button
                  onClick={generateVideo}
                  className="mt-2 bg-red-600 hover:bg-red-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Film Display Area (no header) */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-4xl mx-auto">{renderContent()}</div>
      </div>
    </div>
  )
}
