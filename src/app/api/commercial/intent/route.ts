import { NextResponse } from "next/server";
import type { PendingCommercialIntent } from "@/domain/commercial/types";
import { getIntent, saveIntent } from "@/server/commercial/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let intent: PendingCommercialIntent;
  try {
    intent = (await request.json()) as PendingCommercialIntent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!intent?.id || !intent.workflow || !intent.search) {
    return NextResponse.json({ error: "Invalid intent" }, { status: 400 });
  }
  await saveIntent(intent);
  return NextResponse.json({ id: intent.id });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const intent = await getIntent(id);
  if (!intent) {
    return NextResponse.json({ error: "Intent not found" }, { status: 404 });
  }
  return NextResponse.json({ intent });
}
