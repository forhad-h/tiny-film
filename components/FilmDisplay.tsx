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
        body: JSON.stringify({
          shots: state.shots,
          filmSlug: state.filmSlug,
          script: state.script,
          concept: state.concept,
        }),
      })

      const videoData = await videoResponse.json()

      if (!videoResponse.ok || videoData.error) {
        throw new Error(videoData.error || "Failed to generate videos")
      }

      // Get Supabase URLs - videos already uploaded to Supabase
      const supabaseVideoUrls = videoData.videos

      // Step 2: Download all videos from Supabase (parallel downloads)
      setProgress(
        `Downloading ${supabaseVideoUrls.length} videos from storage...`
      )

      let downloadedCount = 0
      const videoBlobs = await Promise.all(
        supabaseVideoUrls.map(async (url: string) => {
          const blob = await downloadVideo(url)
          downloadedCount++
          setProgress(
            `Downloaded ${downloadedCount}/${supabaseVideoUrls.length} videos...`
          )
          return blob
        })
      )

      // Step 3: Stitch videos together using FFmpeg.wasm
      setProgress("Stitching videos together...")
      const finalVideo = await stitchVideos(videoBlobs, (prog) => {
        setProgress(`Stitching videos: ${Math.round(prog)}%`)
      })

      // Step 4: Create blob URL for the final stitched video
      const videoUrl = URL.createObjectURL(finalVideo)

      setProgress("Complete!")

      // Update state with final video
      setState({
        ...state,
        videoUrl: videoUrl,
        videoUrls: supabaseVideoUrls,
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
        <div className="flex justify-center items-center min-h-[600px]">
          <div className="w-full max-w-[320px] aspect-[9/16] bg-gray-900 rounded-[2.5rem] border-[8px] border-gray-800 shadow-2xl flex items-center justify-center p-4 relative overflow-hidden">
            {/* Phone notch */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-3xl z-10"></div>

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
        </div>
      )
    }

    // Show idle/empty state
    if (!state.videoUrl && !isGeneratingVideo) {
      return (
        <div className="flex justify-center items-center min-h-[600px]">
          <div className="w-full max-w-[320px] aspect-[9/16] bg-gradient-to-br from-gray-900 to-gray-800 rounded-[2.5rem] border-[8px] border-gray-800 shadow-2xl flex items-center justify-center p-4 relative overflow-hidden">
            {/* Phone notch */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-3xl z-10"></div>

            {/* Dashed border inside */}
            <div className="absolute inset-4 border-2 border-dashed border-gray-700 rounded-[2rem]"></div>

            <div className="text-center z-20">
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
              <p className="text-gray-400 text-lg font-medium">
                No film generated yet
              </p>
              <p className="text-gray-600 text-sm mt-2 px-4">
                Use the chat to describe your film idea
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <>
        {/* Video Player */}
        {state.videoUrl && (
          <div className="flex flex-col items-center">
            {/* Mobile Phone Mockup */}
            <div className="relative mb-6">
              {/* Phone Frame */}
              <div className="w-full max-w-[340px] aspect-[9/16] bg-gray-900 rounded-[2.5rem] border-[8px] border-gray-800 shadow-2xl p-2 relative overflow-hidden">
                {/* Phone notch */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-3xl z-10"></div>

                {/* Video Container */}
                <div className="w-full h-full rounded-[1.75rem] overflow-hidden bg-black relative">
                  <video
                    controls
                    className="w-full h-full object-cover"
                    src={state.videoUrl}
                    loop
                    playsInline
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Home indicator bar (iPhone-style) */}
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-700 rounded-full z-10"></div>
              </div>

              {/* Subtle glow effect */}
              <div className="absolute inset-0 bg-blue-500/5 rounded-[2.5rem] blur-xl -z-10"></div>
            </div>

            {/* Download Section */}
            <div className="w-full max-w-md bg-gray-900/50 rounded-lg border border-gray-800 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-400 flex-1">
                  Right now, there is no gallery where you can download this
                  video later. If you want it, please download it now.
                </p>
                <a
                  href={state.videoUrl}
                  download={`${state.filmSlug || "micro-film"}.mp4`}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-medium transition-all shadow-lg hover:shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900 whitespace-nowrap"
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
          </div>
        )}

        {/* Video Generation Progress */}
        {isGeneratingVideo && (
          <div className="flex justify-center items-center min-h-[600px]">
            <div className="w-full max-w-[340px] aspect-[9/16] bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-[2.5rem] border-[8px] border-blue-800/30 shadow-2xl p-2 relative overflow-hidden">
              {/* Phone notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-blue-800/50 rounded-b-3xl z-10"></div>

              {/* Progress content */}
              <div className="w-full h-full rounded-[1.75rem] bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="flex justify-center mb-6">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
                  </div>
                  <p className="text-blue-300 font-semibold text-lg mb-2">
                    Generating your film...
                  </p>
                  <p className="text-blue-400 text-sm px-4">
                    {progress || "This may take a few minutes."}
                  </p>
                </div>
              </div>

              {/* Home indicator bar */}
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-blue-700/50 rounded-full z-10"></div>

              {/* Animated glow */}
              <div className="absolute inset-0 bg-blue-500/10 rounded-[2.5rem] blur-xl -z-10 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Video Error */}
        {videoError && (
          <div className="flex justify-center items-center min-h-[600px]">
            <div className="w-full max-w-[340px] aspect-[9/16] bg-gradient-to-br from-red-900/20 to-orange-900/20 rounded-[2.5rem] border-[8px] border-red-800/30 shadow-2xl p-2 relative overflow-hidden">
              {/* Phone notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-red-800/50 rounded-b-3xl z-10"></div>

              {/* Error content */}
              <div className="w-full h-full rounded-[1.75rem] bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-6">
                <div className="text-center">
                  <svg
                    className="mx-auto h-16 w-16 text-red-500 mb-4"
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
                  <p className="text-red-300 font-semibold text-lg mb-2">
                    Video generation failed
                  </p>
                  <p className="text-red-400 text-sm mb-4 px-4">{videoError}</p>
                  <button
                    onClick={generateVideo}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-all shadow-lg hover:shadow-red-500/20"
                  >
                    Retry
                  </button>
                </div>
              </div>

              {/* Home indicator bar */}
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-red-700/50 rounded-full z-10"></div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Film Display Area (no header) */}
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <div className="w-full max-w-4xl mx-auto">{renderContent()}</div>
      </div>
    </div>
  )
}
