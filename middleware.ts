import { NextResponse, type NextRequest } from "next/server";

// Local filesystem mutation and browser automation are workstation features.
// Deployed users use the authenticated cloud Worker through /api/cloud instead.
export function middleware(request: NextRequest) {
  if (process.env.VERCEL && process.env.NEXT_PUBLIC_NOTES_API_BASE && !request.nextUrl.pathname.startsWith("/api/cloud/")) {
    return NextResponse.json({ error: "部署环境请使用登录后的云端笔记工具。", success: false }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/note-generator", "/api/week-note-generator", "/api/chatgpt-web-automation", "/api/notes", "/api/notes-assistant"] };
