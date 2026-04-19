import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "接口已升级为通用笔记生成，请改用 /api/note-generator。",
    },
    { status: 410 },
  );
}
