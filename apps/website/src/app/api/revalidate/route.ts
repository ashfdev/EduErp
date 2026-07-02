import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.secret || !body?.path) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "secret and path are required" } }, { status: 400 });
  }
  if (body.secret !== process.env.WEBSITE_REVALIDATE_SECRET) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid secret" } }, { status: 401 });
  }

  revalidatePath(body.path);
  return NextResponse.json({ success: true, data: { revalidated: true, path: body.path } });
}
