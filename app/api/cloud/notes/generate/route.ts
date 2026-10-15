import { NextResponse } from "next/server";
import { MAX_GENERATION_FILE_BYTES, MAX_GENERATION_REQUEST_BYTES, MAX_GENERATION_SOURCE_CHARS } from "@/lib/ai/generation-limits";

export const runtime = "nodejs";
export const maxDuration = 300;

// Generation can outlast the CDN's external-rewrite timeout. Proxy this one
// long-running operation through a function, keeping authentication at the Worker.
export async function POST(request: Request) {
  const upstream = process.env.NOTES_UPSTREAM_URL?.trim().replace(/\/+$/, "");
  if (!upstream) return NextResponse.json({ success: false, error: "Generation service is unavailable." }, { status: 503 });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ success: false, error: "Sign in to generate notes." }, { status: 401 });
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) return NextResponse.json({ success: false, error: "Upload source material using multipart/form-data." }, { status: 400 });
  if (Number(request.headers.get("content-length")) > MAX_GENERATION_REQUEST_BYTES) return NextResponse.json({ success: false, error: "The request is too large." }, { status: 413 });
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_GENERATION_REQUEST_BYTES) return NextResponse.json({ success: false, error: "The request is too large." }, { status: 413 });
    const form = await new Response(body, { headers: { "Content-Type": contentType } }).formData().catch(() => null);
    if (!form) return NextResponse.json({ success: false, error: "Invalid upload." }, { status: 400 });
    const file = form.get("sourceFile");
    const text = String(form.get("sourceText") || "").trim();
    if (file instanceof File && file.size > MAX_GENERATION_FILE_BYTES) return NextResponse.json({ success: false, error: "File exceeds 4 MB." }, { status: 413 });
    if (text.length > MAX_GENERATION_SOURCE_CHARS) return NextResponse.json({ success: false, error: "Source material exceeds 35,000 characters. Split it before generating." }, { status: 400 });
    if (!text && !(file instanceof File && file.size)) return NextResponse.json({ success: false, error: "Source material is empty." }, { status: 400 });
    const timeout = AbortSignal.timeout(290_000);
    try {
      const response = await fetch(`${upstream}/notes/generate`, {
        method: "POST", headers: { Authorization: authorization, "Content-Type": contentType },
        body, signal: AbortSignal.any([request.signal, timeout]), cache: "no-store",
      });
      return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
    } catch (error) {
      if (timeout.aborted) return NextResponse.json({ success: false, error: "Generation timed out. Check your library before retrying." }, { status: 504 });
      throw error;
    }
  } catch {
    return NextResponse.json({ success: false, error: "The connection was interrupted. Check your library before retrying." }, { status: 502 });
  }
}
