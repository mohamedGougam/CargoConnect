import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await readSessionUser();
  return NextResponse.json({ user });
}
