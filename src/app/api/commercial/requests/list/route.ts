import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/requests/list — my requests */
export async function GET() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const requests = await getRepositories().requests.listForUser(user.id);
  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      origin: r.origin?.name,
      destination: r.destination?.name,
      recipient: r.recipient?.organizationName,
      createdAt: r.createdAt,
      sentAt: r.sentAt ?? null,
    })),
  });
}
