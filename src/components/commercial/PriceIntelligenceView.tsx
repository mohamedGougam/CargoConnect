"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  CommercialRequest,
  PendingCommercialIntent,
} from "@/domain/commercial/types";
import type { Vessel } from "@/domain/models";
import { formatVesselType } from "@/lib/format";
import { loadPendingIntentLocal } from "@/lib/commercial/intent";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";
import { useMaritimeData } from "@/hooks/useMaritimeData";

export function PriceIntelligenceView({ intentId }: { intentId?: string }) {
  const { vessels } = useMaritimeData();
  const [intent, setIntent] = useState<PendingCommercialIntent | null>(null);
  const [request, setRequest] = useState<CommercialRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let pending = loadPendingIntentLocal();
        if (intentId && (!pending || pending.id !== intentId)) {
          const res = await fetch(
            `/api/commercial/intent?id=${encodeURIComponent(intentId)}`,
          );
          if (res.ok) {
            const data = (await res.json()) as { intent: PendingCommercialIntent };
            pending = data.intent;
            if (pending) {
              sessionStorage.setItem(
                "cc_pending_commercial_intent",
                JSON.stringify(pending),
              );
            }
          }
        }
        if (!pending) {
          if (!cancelled) {
            setError(
              "No preserved search context found. Return to the map and start from an active route search.",
            );
          }
          return;
        }
        if (!cancelled) setIntent(pending);

        const createRes = await fetch("/api/commercial/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_from_intent",
            intentId: pending.id,
            type: "QUOTE",
            search: pending.search,
            selectedVessel: pending.selectedVessel,
            selectedPort: pending.selectedPort,
          }),
        });
        const createData = (await createRes.json()) as {
          request?: CommercialRequest;
          error?: string;
        };
        if (!createRes.ok || !createData.request) {
          throw new Error(createData.error ?? "Could not open price view");
        }
        if (!cancelled) setRequest(createData.request);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [intentId]);

  const relevantVessels = useMemo(() => {
    const ids = new Set(intent?.search.relevantVesselIds ?? []);
    return vessels.filter((v) => ids.has(v.id));
  }, [vessels, intent]);

  const typeBreakdown = useMemo(() => {
    const counts = intent?.search.vesselTypeCounts ?? {};
    return Object.entries(counts)
      .filter(([, n]) => (n ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  }, [intent]);

  const quoteHref = useMemo(() => {
    if (!intent) return "/commercial/quote";
    return `/commercial/quote?intent=${encodeURIComponent(intent.id)}&fromPrice=1`;
  }, [intent]);

  if (loading) {
    return (
      <CommercialShell title="Price Intelligence">
        <p className="text-sm text-slate-400">Loading route intelligence…</p>
      </CommercialShell>
    );
  }

  if (error || !intent || !request) {
    return (
      <CommercialShell title="Price Intelligence">
        <p className="rounded-xl border border-amber-300/25 bg-amber-950/30 px-4 py-3 text-sm text-amber-50">
          {error ?? "Missing context"}
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-teal-300">
          Return to map
        </Link>
      </CommercialShell>
    );
  }

  const origin = intent.search.origin;
  const destination = intent.search.destination;

  return (
    <CommercialShell
      title="Price Intelligence"
      subtitle="CargoConnect structures the commercial process — it does not invent freight rates."
    >
      <CommercialSection title="Route">
        <p className="font-[family-name:var(--font-fraunces)] text-2xl text-white sm:text-3xl">
          <span className="text-emerald-200">{origin?.name ?? "Origin"}</span>
          <span className="mx-3 text-teal-400/70">→</span>
          <span className="text-sky-200">{destination?.name ?? "Destination"}</span>
        </p>
      </CommercialSection>

      <CommercialSection title="Shipment context">
        <Dl
          rows={[
            ["Original request", intent.search.originalQuery || "—"],
            ["Cargo", intent.search.cargo?.description ?? "Not specified"],
            [
              "Quantity",
              intent.search.cargo?.quantityText ??
                (intent.search.cargo?.quantityTons != null
                  ? `${intent.search.cargo.quantityTons} tons`
                  : "Not specified"),
            ],
            [
              "Requested vessel type",
              intent.search.vesselType
                ? formatVesselType(intent.search.vesselType)
                : "Not specified",
            ],
          ]}
        />
      </CommercialSection>

      <CommercialSection title="Route context">
        <Dl
          rows={[
            ["Origin port", origin?.name ?? "—"],
            ["Destination port", destination?.name ?? "—"],
            [
              "Relevant vessels",
              String(intent.search.relevantVesselIds.length),
            ],
            [
              "Type breakdown",
              typeBreakdown.length
                ? typeBreakdown
                    .map(
                      ([t, n]) =>
                        `${formatVesselType(t as Vessel["type"])} (${n})`,
                    )
                    .join(" · ")
                : "—",
            ],
          ]}
        />
      </CommercialSection>

      <CommercialSection title="Current maritime activity">
        <p className="mb-3 text-xs text-slate-400">
          Corridor-relevant detections near the visual search corridor. Not
          commercial availability.
        </p>
        {relevantVessels.length === 0 ? (
          <p className="text-sm text-slate-500">
            No relevant vessels in the current live snapshot.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {relevantVessels.slice(0, 12).map((v) => (
              <VesselCard key={v.id} vessel={v} />
            ))}
          </div>
        )}
      </CommercialSection>

      <CommercialSection title="Origin port">
        <PortFacts
          name={origin?.name}
          country={origin?.country}
          unlocode={origin?.unlocode}
          location={origin?.locationLabel}
          cargo={origin?.capabilities?.cargoTypes?.join(", ")}
        />
      </CommercialSection>

      <CommercialSection title="Destination port">
        <PortFacts
          name={destination?.name}
          country={destination?.country}
          unlocode={destination?.unlocode}
          location={destination?.locationLabel}
          cargo={destination?.capabilities?.cargoTypes?.join(", ")}
        />
      </CommercialSection>

      <CommercialSection title="Price Intelligence">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-4">
          <p className="text-[11px] tracking-wide text-slate-500 uppercase">
            Verified freight rate from connected sources
          </p>
          <p className="mt-2 font-[family-name:var(--font-fraunces)] text-xl text-white">
            Not available — broker confirmation required
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {request.freightRateNote}
          </p>
        </div>
        <Link
          href={quoteHref}
          onClick={() => {
            // Keep intent for quote form
            if (intent) {
              sessionStorage.setItem(
                "cc_pending_commercial_intent",
                JSON.stringify({ ...intent, workflow: "quote" }),
              );
            }
          }}
          className="mt-5 inline-flex rounded-full bg-teal-400/90 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
        >
          Request Up-to-Date Quote
        </Link>
      </CommercialSection>
    </CommercialShell>
  );
}

function VesselCard({ vessel }: { vessel: Vessel }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3.5 py-3">
      <p className="text-sm font-medium text-white">{vessel.name}</p>
      <p className="mt-1 text-[11px] text-slate-400">
        {formatVesselType(vessel.type)}
        {vessel.meta?.freshness ? ` · ${vessel.meta.freshness}` : ""}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        {vessel.position.latitude.toFixed(2)}°, {vessel.position.longitude.toFixed(2)}°
      </p>
      {vessel.destinationRaw ? (
        <p className="mt-1 truncate text-[11px] text-slate-500">
          AIS dest: {vessel.destinationRaw}
        </p>
      ) : null}
    </div>
  );
}

function PortFacts(props: {
  name?: string;
  country?: string;
  unlocode?: string;
  location?: string;
  cargo?: string;
}) {
  return (
    <Dl
      rows={[
        ["Name", props.name ?? "—"],
        ["Country", props.country ?? "—"],
        ["UN/LOCODE", props.unlocode ?? "—"],
        ["Location", props.location ?? "—"],
        ["Cargo types", props.cargo ?? "—"],
      ]}
    />
  );
}

function Dl({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="space-y-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,38%)_minmax(0,62%)] gap-3 text-sm"
        >
          <dt className="text-slate-500">{label}</dt>
          <dd className="text-right text-slate-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
