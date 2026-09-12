import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/commercial/claims */
export async function GET(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const repos = getRepositories();
  let claims = await repos.claimPreparations.listForUser(user.id);
  if (status === "DRAFT") {
    claims = claims.filter(
      (c) => c.status === "DRAFT" || c.status === "READY_FOR_REVIEW",
    );
  } else if (status === "FINALIZED") {
    claims = claims.filter((c) => c.status === "FINALIZED");
  } else if (status === "CLOSED") {
    claims = claims.filter((c) => c.status === "CLOSED");
  }

  const rows = await Promise.all(
    claims.map(async (c) => {
      const booking = await repos.bookings.get(c.bookingId);
      return {
        id: c.id,
        reference: c.reference,
        bookingId: c.bookingId,
        bookingReference: booking?.bookingReference ?? c.bookingId,
        origin: booking?.origin ?? null,
        destination: booking?.destination ?? null,
        claimType: c.claimType,
        status: c.status,
        version: c.version,
        claimedAmount: c.claimedAmount,
        claimedCurrency: c.claimedCurrency,
        updatedAt: c.updatedAt,
        title: c.title,
      };
    }),
  );

  return NextResponse.json({ claims: rows });
}
