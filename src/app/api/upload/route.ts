import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const array = await file.arrayBuffer();
  const buffer = Buffer.from(array);

  // Derive extension and content type from the uploaded File/Blob
  const contentType = (file as any).type || "application/octet-stream";
  const originalName = ((file as any).name as string | undefined) || "audio";
  const fromNameExt = originalName.includes(".")
    ? originalName.split(".").pop()!.toLowerCase()
    : undefined;
  const extFromType = (() => {
    if (contentType === "audio/mpeg") return "mp3";
    if (contentType === "audio/mp3") return "mp3";
    if (contentType === "audio/wav") return "wav";
    if (contentType === "audio/x-wav") return "wav";
    if (contentType === "audio/webm") return "webm";
    if (contentType === "audio/ogg") return "ogg";
    if (contentType === "audio/mp4") return "m4a";
    if (contentType === "audio/aac") return "aac";
    return undefined;
  })();
  const ext = (fromNameExt || extFromType || "webm").replace(/[^a-z0-9]/g, "");
  const filename = `briefs/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .upload(filename, buffer, {
      contentType: contentType,
      upsert: false,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: pub } = supabaseAdmin.storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
  // Provide a signed URL so Replicate can fetch even if bucket is private
  const { data: signedData } = await supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(filename, 60 * 60); // 1h
  return NextResponse.json({ publicUrl: pub.publicUrl, signedUrl: signedData?.signedUrl || pub.publicUrl });
}
