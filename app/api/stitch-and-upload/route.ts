import { NextRequest, NextResponse } from "next/server";
import { uploadVideoToSupabase } from "@/lib/supabase";

/**
 * Upload a video blob to Supabase storage
 * This endpoint accepts FormData with a video file
 *
 * NOTE: Video stitching now happens in the browser using FFmpeg.wasm
 * This endpoint only handles the final upload to Supabase
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get("video") as File;
    const filmId = formData.get("filmId") as string;

    if (!videoFile) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    // Convert File to Blob
    const videoBlob = new Blob([await videoFile.arrayBuffer()], {
      type: videoFile.type || "video/mp4",
    });

    // Upload to Supabase
    const filename = `${filmId || Date.now()}_final.mp4`;
    const publicUrl = await uploadVideoToSupabase(videoBlob, filename);

    return NextResponse.json({
      success: true,
      videoUrl: publicUrl,
    });
  } catch (error) {
    console.error("Error uploading video:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload video",
      },
      { status: 500 }
    );
  }
}
