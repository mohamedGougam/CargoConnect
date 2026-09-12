import { NextResponse } from "next/server";
import { COMMERCIAL_CONTACTS } from "@/data/commercial/contacts";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const repos = getRepositories();
  let contacts = await repos.contacts.listAll();
  if (contacts.length === 0) {
    await repos.contacts.upsertMany(COMMERCIAL_CONTACTS);
    contacts = await repos.contacts.listAll();
  }

  const url = new URL(request.url);
  const portId = url.searchParams.get("portId") ?? undefined;
  const id = url.searchParams.get("id") ?? undefined;

  if (id) {
    const contact = await repos.contacts.getById(id);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ contact });
  }

  if (portId) {
    const forPort = contacts.filter((c) => c.portId === portId);
    const withEmail = forPort.filter((c) => Boolean(c.email));
    return NextResponse.json({
      contacts: forPort,
      suggested: withEmail[0] ?? forPort[0],
      missingEmail: withEmail.length === 0,
    });
  }

  return NextResponse.json({ contacts });
}
