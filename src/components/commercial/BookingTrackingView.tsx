"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Port, Vessel } from "@/domain/models";
import type { MaritimeCorridor } from "@/domain/search/types";
import {
  CommercialSection,
  CommercialShell,
} from "@/components/commercial/CommercialShell";

const TrackingMap = dynamic(
  () =>
    import("@/components/commercial/TrackingMap").then((m) => m.TrackingMap),
  { ssr: false, loading: () => <div className="h-72 rounded-xl bg-black/30" /> },
);

interface TrackingPayload {
  booking: {
    id: string;
    bookingReference: string;
    status: string;
    origin?: string | null;
    destination?: string | null;
  };
  handoff: { id: string; status: string; handoffReference: string } | null;
  execution: {
    id: string;
    status: string;
    vesselName?: string | null;
    vesselMmsi?: string | null;
    vesselImo?: string | null;
    actualLoadedAt?: string | null;
    actualDepartedAt?: string | null;
    actualArrivedAt?: string | null;
    actualDischargedAt?: string | null;
    actualDeliveredAt?: string | null;
    completedAt?: string | null;
    closeoutSummary?: string | null;
    plannedEta?: string | null;
    latestObservedEta?: string | null;
  } | null;
  milestones?: Array<{
    id: string;
    type: string;
    status: string;
    source: string;
    occurredAt?: string | null;
    notes?: string | null;
  }>;
  candidates?: Array<{
    id: string;
    proposedType: string;
    evidenceText?: string | null;
    proposedOccurredAt?: string | null;
    confidence: number;
    conflictWarning?: string | null;
    corroborationNote?: string | null;
    fromAddress?: string | null;
  }>;
  openExceptions?: Array<{
    id: string;
    type: string;
    severity: string;
    status: string;
    title: string;
    explanation: string;
    evidence: Array<{ label: string; value: string; reference?: string | null }>;
    recommendedActions: Array<{ id: string; label: string }>;
    detectedAt: string;
    acknowledgedAt?: string | null;
    resolvedAt?: string | null;
    dismissedAt?: string | null;
  }>;
  exceptions?: Array<{
    id: string;
    type: string;
    severity: string;
    status: string;
    title: string;
    explanation: string;
    evidence: Array<{ label: string; value: string; reference?: string | null }>;
    recommendedActions: Array<{ id: string; label: string }>;
    detectedAt: string;
    acknowledgedAt?: string | null;
    resolvedAt?: string | null;
    dismissedAt?: string | null;
    autoResolved?: boolean;
  }>;
  observations?: Array<{
    id: string;
    kind: string;
    latitude: number;
    longitude: number;
    sog?: number | null;
    cog?: number | null;
    observedAt: string;
    freshnessLabel: string;
    aisDestination?: string | null;
    aisEta?: string | null;
  }>;
  latestObservation?: {
    kind: string;
    sog?: number | null;
    cog?: number | null;
    observedAt: string;
    freshnessLabel: string;
    aisDestination?: string | null;
    latitude: number;
    longitude: number;
  } | null;
  freshness?: string | null;
  confirmedEta?: string | null;
  aisReportedEta?: string | null;
  originPort?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  } | null;
  destinationPort?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  } | null;
  corridor?: MaritimeCorridor | null;
  fixtureVessel?: Vessel | null;
  warnings?: string[];
  canStart?: boolean;
  liveTrackingSource?: string;
  aisLicensingNote?: string;
  disclaimer?: string;
  error?: string;
}

export function BookingTrackingView({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<TrackingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmType, setConfirmType] = useState<string | null>(null);
  const [confirmCandidateId, setConfirmCandidateId] = useState<string | null>(
    null,
  );
  const [ackComplete, setAckComplete] = useState(false);
  const [reviewExceptionId, setReviewExceptionId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return new URLSearchParams(window.location.search).get("exceptionId");
    },
  );
  const [dismissNote, setDismissNote] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  async function reload() {
    const res = await fetch(`/api/commercial/bookings/${bookingId}/tracking`);
    const json = (await res.json()) as TrackingPayload;
    if (!res.ok) throw new Error(json.error ?? "Failed to load");
    setData(json);
  }

  useEffect(() => {
    void fetch("/api/demo/status")
      .then((r) => r.json())
      .then((d: { demoMode?: boolean }) => setDemoMode(Boolean(d.demoMode)))
      .catch(() => setDemoMode(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/commercial/bookings/${bookingId}/tracking`)
      .then(async (r) => {
        const json = (await r.json()) as TrackingPayload;
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const ports: Port[] = useMemo(() => {
    if (!data) return [];
    const list: Port[] = [];
    if (data.originPort) {
      list.push({
        id: data.originPort.id,
        name: data.originPort.name,
        country: "",
        locationLabel: data.originPort.name,
        type: "multipurpose",
        position: {
          latitude: data.originPort.latitude,
          longitude: data.originPort.longitude,
        },
        capabilities: { cargoTypes: [], canLoad: true, canUnload: true },
      });
    }
    if (data.destinationPort) {
      list.push({
        id: data.destinationPort.id,
        name: data.destinationPort.name,
        country: "",
        locationLabel: data.destinationPort.name,
        type: "multipurpose",
        position: {
          latitude: data.destinationPort.latitude,
          longitude: data.destinationPort.longitude,
        },
        capabilities: { cargoTypes: [], canLoad: true, canUnload: true },
      });
    }
    return list;
  }, [data]);

  const vessels: Vessel[] = useMemo(() => {
    if (data?.fixtureVessel) return [data.fixtureVessel];
    if (!data?.latestObservation || !data.execution) return [];
    return [
      {
        id: data.execution.vesselMmsi
          ? `mmsi:${data.execution.vesselMmsi}`
          : "tracked-vessel",
        name: data.execution.vesselName ?? "Associated vessel",
        mmsi: data.execution.vesselMmsi ?? undefined,
        imo: data.execution.vesselImo ?? undefined,
        type: "bulk_carrier",
        cargoCategory: "Bulk",
        position: {
          latitude: data.latestObservation.latitude,
          longitude: data.latestObservation.longitude,
        },
        speed: data.latestObservation.sog ?? undefined,
        course: data.latestObservation.cog ?? undefined,
        status: "underway",
        destinationRaw: data.latestObservation.aisDestination ?? undefined,
      },
    ];
  }, [data]);

  async function startTracking() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/tracking/start`,
        { method: "POST" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not start");
      setMessage("Shipment tracking started");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  async function applyFixture(scenario: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/tracking/observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        messages?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? "Fixture failed");
      setMessage((json.messages ?? []).join(" · ") || "Observation recorded");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fixture failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMilestone(type: string, candidateId?: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/tracking/milestones/${type}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acknowledged: true,
            candidateId: candidateId ?? undefined,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Confirm failed");
      setMessage(`${type} confirmed`);
      setConfirmType(null);
      setConfirmCandidateId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  async function dismissCandidate(candidateId: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/tracking/candidates/${candidateId}/dismiss`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Dismiss failed");
      }
      setMessage("Candidate dismissed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dismiss failed");
    } finally {
      setBusy(false);
    }
  }

  async function completeShipment() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/tracking/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acknowledgedComplete: true }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Complete failed");
      setMessage("Shipment completed");
      setAckComplete(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Complete failed");
    } finally {
      setBusy(false);
    }
  }

  async function exceptionAction(
    exceptionId: string,
    action: "acknowledge" | "dismiss" | "resolve",
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/exceptions/${exceptionId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "dismiss" || action === "resolve"
              ? { note: dismissNote || undefined }
              : {},
          ),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setMessage(`Exception ${action}d`);
      setReviewExceptionId(null);
      setDismissNote("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <CommercialShell title="Shipment Tracking">
        <p className="text-sm text-rose-200">{error}</p>
      </CommercialShell>
    );
  }

  if (!data) {
    return (
      <CommercialShell title="Shipment Tracking">
        <p className="text-sm text-slate-400">Loading…</p>
      </CommercialShell>
    );
  }

  const exec = data.execution;
  const trail = (data.observations ?? [])
    .slice(0, 24)
    .map((o) => ({ latitude: o.latitude, longitude: o.longitude }));

  return (
    <CommercialShell
      title="Shipment Tracking"
      subtitle={`${data.booking.bookingReference} · ${data.booking.origin ?? "—"} → ${data.booking.destination ?? "—"}`}
    >
      <p className="mb-3 text-xs text-slate-500">{data.disclaimer}</p>
      <p className="mb-1 text-xs text-slate-500">
        Live tracking source: {data.liveTrackingSource ?? "Development AIS feed"}
      </p>
      <p className="mb-4 text-xs text-amber-100/70">{data.aisLicensingNote}</p>
      {error ? <p className="mb-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="mb-2 text-sm text-teal-200">{message}</p> : null}

      {!exec ? (
        <CommercialSection title="Start tracking">
          <p className="text-sm text-slate-400">
            Initializes shipment execution. Does not mean the vessel has
            departed.
          </p>
          <button
            type="button"
            disabled={busy || !data.canStart}
            onClick={() => void startTracking()}
            className="mt-4 rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
          >
            Start Shipment Tracking
          </button>
          {!data.canStart ? (
            <p className="mt-2 text-xs text-amber-100/80">
              Requires READY_FOR_OPERATIONS and a finalized operational handoff.
            </p>
          ) : null}
        </CommercialSection>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-h-[18rem] overflow-hidden rounded-xl border border-white/10">
              <TrackingMap
                vessels={vessels}
                ports={ports}
                corridor={data.corridor ?? null}
                originPortId={data.originPort?.id}
                destinationPortId={data.destinationPort?.id}
                relevantVesselIds={vessels.map((v) => v.id)}
                trail={trail}
              />
            </div>

            <CommercialSection title="Status">
              <p className="text-lg text-teal-100">{exec.status.replace(/_/g, " ")}</p>
              <p className="mt-2 text-sm text-white">
                {exec.vesselName ?? "Vessel pending"}
                {exec.vesselMmsi ? ` · MMSI ${exec.vesselMmsi}` : ""}
              </p>
              {data.latestObservation ? (
                <dl className="mt-3 space-y-1 text-xs text-slate-400">
                  <div>
                    Last observed{" "}
                    {new Date(data.latestObservation.observedAt).toLocaleString()}
                  </div>
                  <div>
                    Speed {data.latestObservation.sog ?? "—"} kn · AIS{" "}
                    {data.freshness ?? data.latestObservation.freshnessLabel}
                  </div>
                  <div>
                    AIS destination{" "}
                    {data.latestObservation.aisDestination ?? "—"}
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No AIS observation yet</p>
              )}
              <dl className="mt-3 space-y-1 text-xs text-slate-400">
                <div>Confirmed ETA: {data.confirmedEta ?? "—"}</div>
                <div>AIS-reported ETA: {data.aisReportedEta ?? "—"}</div>
                <div>
                  Confirmed departure:{" "}
                  {exec.actualDepartedAt
                    ? new Date(exec.actualDepartedAt).toLocaleString()
                    : "—"}
                </div>
              </dl>
              {(data.warnings ?? []).map((w) => (
                <p key={w} className="mt-2 text-xs text-amber-100">
                  {w}
                </p>
              ))}
            </CommercialSection>
          </div>

          <CommercialSection title="Operational milestones">
            <Timeline milestones={data.milestones ?? []} execution={exec} />
            <div className="mt-4 flex flex-wrap gap-2">
              <MilestoneButton
                label="Confirm Loaded"
                disabled={busy || Boolean(exec.actualLoadedAt)}
                onClick={() => setConfirmType("LOADED")}
              />
              <MilestoneButton
                label="Confirm Departure"
                disabled={busy || Boolean(exec.actualDepartedAt)}
                onClick={() => setConfirmType("DEPARTED")}
              />
              <MilestoneButton
                label="Confirm Arrival"
                disabled={busy || Boolean(exec.actualArrivedAt)}
                onClick={() => setConfirmType("ARRIVED")}
              />
              <MilestoneButton
                label="Confirm Discharge"
                disabled={
                  busy ||
                  !exec.actualArrivedAt ||
                  Boolean(exec.actualDischargedAt)
                }
                onClick={() => setConfirmType("DISCHARGED")}
              />
              <MilestoneButton
                label="Confirm Delivery"
                disabled={
                  busy ||
                  !exec.actualDischargedAt ||
                  Boolean(exec.actualDeliveredAt)
                }
                onClick={() => setConfirmType("DELIVERED")}
              />
            </div>
          </CommercialSection>

          {(data.openExceptions ?? []).length > 0 ? (
            <CommercialSection title="Attention">
              <ul className="space-y-2">
                {(data.openExceptions ?? []).map((ex) => (
                  <li
                    key={ex.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-amber-50">
                        {ex.severity === "HIGH" ? "⚠ " : ""}
                        {ex.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {ex.severity} · {ex.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-teal-100"
                      onClick={() => setReviewExceptionId(ex.id)}
                    >
                      Review
                    </button>
                  </li>
                ))}
              </ul>
            </CommercialSection>
          ) : null}

          {(data.candidates ?? []).length > 0 ? (
            <CommercialSection title="Broker updates">
              <ul className="space-y-3">
                {(data.candidates ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm"
                  >
                    <p className="text-teal-100">
                      Suggested: {c.proposedType.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-slate-300">
                      “{c.evidenceText ?? "Broker update"}”
                    </p>
                    {c.corroborationNote ? (
                      <p className="mt-1 text-xs text-teal-200/80">
                        {c.corroborationNote}
                      </p>
                    ) : null}
                    {c.conflictWarning ? (
                      <p className="mt-1 text-xs text-amber-100">
                        {c.conflictWarning}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-full bg-teal-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950"
                        onClick={() => {
                          setConfirmCandidateId(c.id);
                          setConfirmType(c.proposedType);
                        }}
                      >
                        Confirm {c.proposedType.replace(/_/g, " ")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-300"
                        onClick={() => void dismissCandidate(c.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </CommercialSection>
          ) : null}

          {exec.status === "DELIVERED" ? (
            <CommercialSection title="Complete shipment">
              <label className="flex items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ackComplete}
                  onChange={(e) => setAckComplete(e.target.checked)}
                />
                I confirm that the shipment execution is complete.
              </label>
              <button
                type="button"
                disabled={busy || !ackComplete}
                onClick={() => void completeShipment()}
                className="mt-3 rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
              >
                Complete Shipment
              </button>
            </CommercialSection>
          ) : null}

          {exec.status === "COMPLETED" && exec.closeoutSummary ? (
            <CommercialSection title="Closeout">
              <pre className="whitespace-pre-wrap text-xs text-slate-400">
                {exec.closeoutSummary}
              </pre>
            </CommercialSection>
          ) : null}

          {demoMode ? (
            <CommercialSection title="AIS observation fixtures">
              <p className="mb-2 text-[10px] text-slate-500">
                Operator only — observational AIS positions for the walkthrough.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "NEAR_ROTTERDAM",
                    "LEFT_ROTTERDAM",
                    "UNDERWAY_MED",
                    "NEAR_ALEXANDRIA",
                    "STALE",
                  ] as const
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => void applyFixture(s)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-slate-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </CommercialSection>
          ) : null}

          {confirmType ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-5">
                <h3 className="text-sm font-semibold text-white">
                  Confirm {confirmType.toLowerCase()}?
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Vessel: {exec.vesselName ?? "—"}
                  <br />
                  Origin: {data.booking.origin ?? "—"}
                  <br />
                  This is an operational milestone confirmation — not an AIS
                  auto-decision.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-white/20 px-4 py-2 text-xs text-slate-300"
                    onClick={() => setConfirmType(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full bg-teal-400/90 px-4 py-2 text-xs font-semibold text-slate-950"
                    onClick={() =>
                      void confirmMilestone(confirmType, confirmCandidateId)
                    }
                  >
                    Confirm {confirmType}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {reviewExceptionId ? (
            <ExceptionReviewPanel
              bookingId={bookingId}
              exception={
                (data.exceptions ?? data.openExceptions ?? []).find(
                  (e) => e.id === reviewExceptionId,
                ) ?? null
              }
              busy={busy}
              dismissNote={dismissNote}
              onDismissNote={setDismissNote}
              onClose={() => {
                setReviewExceptionId(null);
                setDismissNote("");
              }}
              onAction={(action) =>
                void exceptionAction(reviewExceptionId, action)
              }
            />
          ) : null}
        </>
      )}

      <Link
        href={`/commercial/bookings/${bookingId}`}
        className="mt-4 inline-block text-sm text-teal-300"
      >
        ← Booking
      </Link>
      <Link
        href="/commercial/shipments"
        className="mt-4 ml-4 inline-block text-sm text-teal-300"
      >
        My Shipments
      </Link>
    </CommercialShell>
  );
}

function MilestoneButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-teal-100 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function Timeline({
  milestones,
  execution,
}: {
  milestones: NonNullable<TrackingPayload["milestones"]>;
  execution: NonNullable<TrackingPayload["execution"]>;
}) {
  const steps = [
    { key: "handoff", label: "Operational Handoff", done: true },
    {
      key: "LOADED",
      label: "Loaded",
      done: Boolean(execution.actualLoadedAt),
    },
    {
      key: "DEPARTED",
      label: "Departed",
      done: Boolean(execution.actualDepartedAt),
    },
    {
      key: "IN_TRANSIT",
      label: "In Transit",
      done:
        execution.status === "IN_TRANSIT" ||
        Boolean(execution.actualArrivedAt) ||
        Boolean(execution.actualDeliveredAt) ||
        execution.status === "COMPLETED",
      current: execution.status === "IN_TRANSIT",
    },
    {
      key: "ARRIVED",
      label: "Arrived",
      done: Boolean(execution.actualArrivedAt),
    },
    {
      key: "DISCHARGED",
      label: "Discharged",
      done: Boolean(execution.actualDischargedAt),
    },
    {
      key: "DELIVERED",
      label: "Delivered",
      done: Boolean(execution.actualDeliveredAt),
    },
    {
      key: "COMPLETED",
      label: "Completed",
      done: Boolean(execution.completedAt),
    },
  ];

  return (
    <ol className="space-y-2 text-sm text-slate-300">
      {steps.map((s) => (
        <li key={s.key}>
          {s.done ? "✓" : s.current ? "●" : "○"} {s.label}
          {milestones
            .filter((m) => m.type === s.key && m.status === "CONFIRMED")
            .map((m) => (
              <span key={m.id} className="ml-2 text-xs text-slate-500">
                {m.occurredAt
                  ? new Date(m.occurredAt).toLocaleString()
                  : ""}{" "}
                · {sourceLabel(m.source)}
              </span>
            ))}
        </li>
      ))}
    </ol>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case "USER":
      return "User confirmed";
    case "BROKER_EMAIL":
      return "Broker email";
    case "AIS_OBSERVATION":
      return "AIS observation";
    default:
      return "System";
  }
}

function ExceptionReviewPanel({
  bookingId,
  exception,
  busy,
  dismissNote,
  onDismissNote,
  onClose,
  onAction,
}: {
  bookingId: string;
  exception: {
    id: string;
    type: string;
    severity: string;
    status: string;
    title: string;
    explanation: string;
    evidence: Array<{ label: string; value: string; reference?: string | null }>;
    recommendedActions: Array<{ id: string; label: string }>;
    detectedAt: string;
    acknowledgedAt?: string | null;
    resolvedAt?: string | null;
    dismissedAt?: string | null;
  } | null;
  busy: boolean;
  dismissNote: string;
  onDismissNote: (v: string) => void;
  onClose: () => void;
  onAction: (action: "acknowledge" | "dismiss" | "resolve") => void;
}) {
  const router = useRouter();
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  if (!exception) return null;
  const closed =
    exception.status === "RESOLVED" || exception.status === "DISMISSED";
  const claimEligible =
    exception.severity !== "INFO" &&
    [
      "ETA_SLIPPAGE",
      "SOURCE_CONFLICT",
      "ORIGIN_DWELL",
      "DESTINATION_DWELL",
      "VESSEL_SUBSTITUTION",
      "DOCUMENT_REGRESSION",
      "MILESTONE_OVERDUE",
      "ROUTE_DEVIATION",
    ].includes(exception.type);

  async function prepareClaim() {
    setClaimBusy(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/commercial/claims/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          exceptionId: exception!.id,
        }),
      });
      const json = (await res.json()) as {
        claim?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not create claim");
      if (json.claim?.id) {
        router.push(`/commercial/claims/${json.claim.id}`);
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setClaimBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {exception.severity} ·{" "}
          {exception.type === "ETA_SLIPPAGE"
            ? "Observed arrival difference"
            : exception.type.replace(/_/g, " ")}
        </p>
        <h3 className="mt-1 text-base font-semibold text-white">
          {exception.title}
        </h3>
        <p className="mt-2 text-sm text-slate-300">{exception.explanation}</p>

        <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">
          Evidence
        </h4>
        <dl className="mt-2 space-y-1 text-xs text-slate-400">
          {exception.evidence.map((e) => (
            <div key={`${e.label}-${e.value}`}>
              <dt className="text-slate-500">{e.label}</dt>
              <dd className="text-slate-200">{e.value}</dd>
            </div>
          ))}
        </dl>

        <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">
          Suggested next actions
        </h4>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
          {exception.recommendedActions.map((a) => (
            <li key={a.id}>{a.label}</li>
          ))}
        </ul>

        <h4 className="mt-4 text-xs font-semibold uppercase text-slate-500">
          History
        </h4>
        <ul className="mt-2 space-y-1 text-xs text-slate-400">
          <li>Detected {new Date(exception.detectedAt).toLocaleString()}</li>
          {exception.acknowledgedAt ? (
            <li>
              Acknowledged{" "}
              {new Date(exception.acknowledgedAt).toLocaleString()}
            </li>
          ) : null}
          {exception.resolvedAt ? (
            <li>Resolved {new Date(exception.resolvedAt).toLocaleString()}</li>
          ) : null}
          {exception.dismissedAt ? (
            <li>
              Dismissed {new Date(exception.dismissedAt).toLocaleString()}
            </li>
          ) : null}
        </ul>

        {!closed ? (
          <>
            <label className="mt-4 block text-xs text-slate-500">
              Note (required to dismiss HIGH)
              <textarea
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
                rows={2}
                value={dismissNote}
                onChange={(e) => onDismissNote(e.target.value)}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-300"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-teal-100"
                onClick={() => onAction("acknowledge")}
              >
                Acknowledge
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-300"
                onClick={() => onAction("dismiss")}
              >
                Dismiss
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-full bg-teal-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950"
                onClick={() => onAction("resolve")}
              >
                Mark Resolved
              </button>
              {claimEligible ? (
                <button
                  type="button"
                  disabled={busy || claimBusy}
                  className="rounded-full border border-amber-300/40 px-3 py-1.5 text-xs text-amber-100"
                  onClick={() => void prepareClaim()}
                >
                  Prepare Claim Evidence
                </button>
              ) : null}
            </div>
            {claimError ? (
              <p className="mt-2 text-xs text-rose-200">{claimError}</p>
            ) : null}
          </>
        ) : (
          <>
            {claimEligible ? (
              <button
                type="button"
                disabled={busy || claimBusy}
                className="mt-4 rounded-full border border-amber-300/40 px-3 py-1.5 text-xs text-amber-100"
                onClick={() => void prepareClaim()}
              >
                Prepare Claim Evidence
              </button>
            ) : null}
            {claimError ? (
              <p className="mt-2 text-xs text-rose-200">{claimError}</p>
            ) : null}
            <button
              type="button"
              className="mt-4 ml-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-300"
              onClick={onClose}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
