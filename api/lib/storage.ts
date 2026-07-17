import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabase";
import { sanitizeFilename } from "@/lib/http";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export async function uploadImage(file: File, prefix: string): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only JPG, PNG, and WEBP images are allowed.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image must be 10MB or smaller.");
  }

  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const objectPath = `${prefix}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function deleteImageByUrl(imageUrl: string): Promise<void> {
  const bucket = getStorageBucket();
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) {
    return;
  }

  const objectPath = imageUrl.slice(index + marker.length);
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(bucket).remove([objectPath]);
}
