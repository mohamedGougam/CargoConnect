"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  BookingDocument,
  BookingDocumentRequirement,
  BookingDocumentType,
} from "@/domain/commercial/types";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";

interface DocsPayload {
  booking: {
    id: string;
    bookingReference: string;
    status: string;
    origin?: string | null;
    destination?: string | null;
  };
  checklistNote: string;
  malwareNote: string;
  requirements: BookingDocumentRequirement[];
  documents: BookingDocument[];
  completeness: {
    requiredTotal: number;
    requiredUploaded: number;
    percent: number;
    missingRequired: string[];
    unresolvedCritical: string[];
    canMarkReady: boolean;
  };
}

async function fetchDocuments(bookingId: string): Promise<DocsPayload> {
  const res = await fetch(`/api/commercial/bookings/${bookingId}/documents`);
  const json = (await res.json()) as DocsPayload & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to load documents");
  return json;
}

export function BookingDocumentsView({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<DocsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [ackReview, setAckReview] = useState(false);
  const [ackReady, setAckReady] = useState(false);
  const [busyReady, setBusyReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchDocuments(bookingId)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function reload() {
    setData(await fetchDocuments(bookingId));
  }

  async function onUpload(
    requirement: BookingDocumentRequirement,
    file: File | null,
  ) {
    if (!file) return;
    setUploadingType(requirement.documentType);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("documentType", requirement.documentType);
      form.set("requirementId", requirement.id);
      const res = await fetch(
        `/api/commercial/bookings/${bookingId}/documents/upload`,
        { method: "POST", body: form },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setMessage(`${requirement.label} uploaded`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  async function markReviewed(docId: string) {
    setError(null);
    const res = await fetch(
      `/api/commercial/bookings/${bookingId}/documents/${docId}/review`,
      { method: "POST" },
    );
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Review failed");
      return;
    }
    setMessage("Document warning marked reviewed");
    await reload();
  }

  async function markReady() {
    setBusyReady(true);
    setError(null);
    try {
      const res = await fetch(`/api/commercial/bookings/${bookingId}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acknowledgedReview: ackReview,
          acknowledgedReady: ackReady,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not mark ready");
      setMessage(json.message ?? "Ready for operations");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark ready");
    } finally {
      setBusyReady(false);
    }
  }

  if (error && !data) {
    return (
      <CommercialShell title="Documents">
        <p className="text-sm text-rose-200">{error}</p>
      </CommercialShell>
    );
  }

  if (!data) {
    return (
      <CommercialShell title="Documents">
        <p className="text-sm text-slate-400">Loading…</p>
      </CommercialShell>
    );
  }

  const currentByType = new Map<string, BookingDocument>();
  for (const d of data.documents) {
    if (d.isCurrent) currentByType.set(d.documentType, d);
  }

  return (
    <CommercialShell
      title="Shipment documents"
      subtitle={`${data.booking.bookingReference} · CargoConnect document checklist`}
    >
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-400/25 bg-rose-950/40 px-4 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-xl border border-teal-400/25 bg-teal-950/40 px-4 py-2 text-xs text-teal-50">
          {message}
        </p>
      ) : null}

      <p className="mb-4 text-xs text-slate-500">{data.checklistNote}</p>
      <p className="mb-6 text-[11px] text-slate-500">{data.malwareNote}</p>

      <CommercialSection title="Completeness">
        <p className="text-sm text-slate-200">
          {data.completeness.requiredUploaded} of{" "}
          {data.completeness.requiredTotal} required documents uploaded ·{" "}
          {data.completeness.percent}% complete
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Status: {statusLabel(data.booking.status)}
        </p>
        {data.completeness.missingRequired.length ? (
          <p className="mt-2 text-xs text-amber-100/80">
            Missing: {data.completeness.missingRequired.join(", ")}
          </p>
        ) : null}
        {data.completeness.unresolvedCritical.length ? (
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-100/80">
            {data.completeness.unresolvedCritical.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        ) : null}
      </CommercialSection>

      <CommercialSection title="Documents required">
        <ul className="space-y-3">
          {data.requirements.map((req) => {
            const current = currentByType.get(req.documentType);
            return (
              <li
                key={req.id}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {req.label}
                      {req.required ? "" : " (optional)"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {reqStatusLabel(req, current)}
                      {req.source === "BROKER_REQUEST"
                        ? " · Requested by broker"
                        : ""}
                    </p>
                    {current ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {current.filename} · v{current.version} ·{" "}
                        {current.validationStatus}
                      </p>
                    ) : null}
                    {current?.validationStatus === "WARNING" &&
                    !current.reviewedAt ? (
                      <p className="mt-1 text-xs text-amber-100/80">
                        Review required before readiness.
                        <button
                          type="button"
                          className="ml-2 underline"
                          onClick={() => void markReviewed(current.id)}
                        >
                          Mark Reviewed
                        </button>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {current ? (
                      <a
                        href={`/api/commercial/bookings/${bookingId}/documents/${current.id}/download`}
                        className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-slate-300"
                      >
                        View
                      </a>
                    ) : null}
                    <label className="cursor-pointer rounded-full bg-teal-400/90 px-3 py-1 text-[11px] font-semibold text-slate-950">
                      {uploadingType === req.documentType
                        ? "Uploading…"
                        : current
                          ? "Replace"
                          : "Upload"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingType === req.documentType}
                        onChange={(e) =>
                          void onUpload(req, e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CommercialSection>

      {data.booking.status !== "READY_FOR_OPERATIONS" ? (
        <CommercialSection title="Operational readiness">
          {data.completeness.canMarkReady ? (
            <p className="mb-3 text-sm text-teal-100">
              Document package appears complete.
            </p>
          ) : (
            <p className="mb-3 text-sm text-slate-400">
              Upload required documents and resolve warnings before marking
              ready. Completeness alone does not auto-ready.
            </p>
          )}
          <label className="mb-2 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackReview}
              onChange={(e) => setAckReview(e.target.checked)}
              className="mt-0.5"
            />
            I have reviewed the uploaded shipment documents.
          </label>
          <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={ackReady}
              onChange={(e) => setAckReady(e.target.checked)}
              className="mt-0.5"
            />
            I confirm this package is ready for operational handoff.
          </label>
          <button
            type="button"
            disabled={
              !data.completeness.canMarkReady ||
              !ackReview ||
              !ackReady ||
              busyReady
            }
            onClick={() => void markReady()}
            className="rounded-full bg-teal-400/90 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {busyReady ? "Marking…" : "Mark Ready for Operations"}
          </button>
        </CommercialSection>
      ) : (
        <CommercialSection title="Operational readiness">
          <p className="text-sm text-teal-100">READY_FOR_OPERATIONS</p>
          <p className="mt-1 text-xs text-slate-500">
            Internal CargoConnect workflow state — not carrier/customs
            acceptance.
          </p>
        </CommercialSection>
      )}

      <Link
        href={`/commercial/bookings/${bookingId}`}
        className="text-sm text-teal-300"
      >
        ← Booking detail
      </Link>
    </CommercialShell>
  );
}

function statusLabel(status: string): string {
  if (status === "READY_FOR_OPERATIONS") return "Ready for Operations";
  if (status === "DOCUMENTS_PENDING") return "Documents Pending";
  if (status === "COMMERCIALLY_CONFIRMED") return "Commercially Confirmed";
  return status;
}

function reqStatusLabel(
  req: BookingDocumentRequirement,
  current?: BookingDocument,
): string {
  if (!current) return "Missing";
  if (current.validationStatus === "WARNING" && !current.reviewedAt) {
    return "Review required";
  }
  if (req.status === "UPLOADED" || current.isCurrent) return "Uploaded";
  return req.status;
}

export type { BookingDocumentType };
