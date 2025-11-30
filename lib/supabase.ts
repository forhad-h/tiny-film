import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function uploadVideoToSupabase(
  videoBlob: Blob,
  filename: string
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("tiny-films")
    .upload(`videos/${filename}`, videoBlob, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload video: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("tiny-films").getPublicUrl(data.path);

  return publicUrl;
}
