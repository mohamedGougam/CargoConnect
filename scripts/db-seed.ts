import "dotenv/config";
import postgres from "postgres";
import { COMMERCIAL_CONTACTS } from "../src/data/commercial/contacts";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required for seeding");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const now = new Date();
  try {
    for (const c of COMMERCIAL_CONTACTS) {
      await sql`
        INSERT INTO commercial_contacts (
          id, organization_name, contact_type, port_id, port_name,
          email, phone, website, source_url, verified_at, notes,
          created_at, updated_at
        ) VALUES (
          ${c.id}, ${c.organizationName}, ${c.contactType}, ${c.portId}, ${c.portName},
          ${c.email ?? null}, ${c.phone ?? null}, ${c.website ?? null},
          ${c.sourceUrl}, ${c.verifiedAt}, ${c.notes ?? null},
          ${now}, ${now}
        )
        ON CONFLICT (id) DO UPDATE SET
          organization_name = EXCLUDED.organization_name,
          contact_type = EXCLUDED.contact_type,
          port_id = EXCLUDED.port_id,
          port_name = EXCLUDED.port_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          website = EXCLUDED.website,
          source_url = EXCLUDED.source_url,
          verified_at = EXCLUDED.verified_at,
          notes = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at
      `;
    }
    console.log(`Seeded ${COMMERCIAL_CONTACTS.length} commercial contacts (no fabricated emails).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
