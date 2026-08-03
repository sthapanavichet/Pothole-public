import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabase";
import { sanitizeFilename } from "@/lib/http";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function declaredMatchesSniffed(declared: string, sniffed: string): boolean {
  if (declared === "image/jpg") {
    return sniffed === "image/jpeg";
  }
  return declared === sniffed;
}

export async function uploadImage(file: File, prefix: string): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only JPG, PNG, and WEBP images are allowed.");
  }

  if (file.size <= 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image must be 10MB or smaller.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(new Uint8Array(buffer.subarray(0, 16)));
  if (!sniffed || !declaredMatchesSniffed(file.type, sniffed)) {
    throw new Error(
      "File content does not match a supported image type (or declared Content-Type)."
    );
  }

  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const objectPath = `${prefix}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: sniffed,
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
