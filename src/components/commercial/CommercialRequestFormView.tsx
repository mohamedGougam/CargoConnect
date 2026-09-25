"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type {
  CommercialContact,
  CommercialRequest,
  CommercialRequestType,
  PendingCommercialIntent,
} from "@/domain/commercial/types";
import { generateCommercialMessageDraft } from "@/lib/commercial/generateMessage";
import { loadPendingIntentLocal } from "@/lib/commercial/intent";
import { formatVesselType } from "@/lib/format";
import { CommercialSection, CommercialShell } from "@/components/commercial/CommercialShell";

const inputClass =
  "w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-300/40";

export function CommercialRequestFormView({
  type,
  intentId,
}: {
  type: CommercialRequestType;
  intentId?: string;
}) {
  const title =
    type === "QUOTE" ? "Request Up-to-Date Quote" : "Make a Reservation Request";
  const subtitle =
    type === "QUOTE"
      ? "RFQ pre-filled from your route search. Review the commercial draft, then send or simulate."
      : "Reservation request only — not a confirmed booking. Prefill from your route search.";

  const [request, setRequest] = useState<CommercialRequest | null>(null);
  const [contacts, setContacts] = useState<CommercialContact[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | undefined>();
  const [missingEmail, setMissingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [sendResult, setSendResult] = useState<{
    status: string;
    simulated?: boolean;
    message?: string;
  } | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [noVesselPreference, setNoVesselPreference] = useState(false);

  // Form fields
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [weightTons, setWeightTons] = useState("");
  const [volumeCbm, setVolumeCbm] = useState("");
  const [unitsPackages, setUnitsPackages] = useState("");
  const [requestedDeparture, setRequestedDeparture] = useState("");
  const [requestedArrival, setRequestedArrival] = useState("");
  const [preferredVesselType, setPreferredVesselType] = useState("");
  const [handlingRequirements, setHandlingRequirements] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [dangerousGoods, setDangerousGoods] = useState(false);
  const [oversized, setOversized] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [recipientManual, setRecipientManual] = useState(false);
  const [recipientOrg, setRecipientOrg] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const applyRequestToForm = (req: CommercialRequest) => {
    setContactName(req.contactName ?? "");
    setCompanyName(req.companyName ?? "");
    setContactEmail(req.contactEmail ?? "");
    setContactPhone(req.contactPhone ?? "");
    setCargoDescription(req.cargo.description ?? "");
    setCargoType(req.cargo.type ?? "");
    setWeightTons(
      req.cargo.weightTons != null ? String(req.cargo.weightTons) : "",
    );
    setVolumeCbm(req.cargo.volumeCbm != null ? String(req.cargo.volumeCbm) : "");
    setUnitsPackages(req.cargo.unitsPackages ?? "");
    setRequestedDeparture(req.requestedDeparture ?? "");
    setRequestedArrival(req.requestedArrival ?? "");
    setPreferredVesselType(req.preferredVesselType ?? "");
    setNoVesselPreference(!req.selectedVessel);
    const draft = generateCommercialMessageDraft({
      type: req.type,
      contactName: req.contactName ?? "",
      companyName: req.companyName,
      originName: req.origin?.name,
      destinationName: req.destination?.name,
      cargoDescription: req.cargo.description,
      cargoType: req.cargo.type,
      weightTons: req.cargo.weightTons,
      volumeCbm: req.cargo.volumeCbm,
      unitsPackages: req.cargo.unitsPackages,
      requestedDeparture: req.requestedDeparture,
      preferredVesselType: req.preferredVesselType,
      selectedVesselName: req.selectedVessel?.name,
      noVesselPreference: !req.selectedVessel,
      recipientOrganization: undefined,
      additionalNotes: req.additionalNotes,
    });
    setSubject(draft.subject);
    setBody(draft.body);
  };

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then(
        (data: {
          user?: { email?: string; emailVerifiedAt?: string | null } | null;
        }) => {
          setSessionEmail(data.user?.email ?? null);
          if (data.user && !data.user.emailVerifiedAt) {
            setVerificationRequired(true);
          }
        },
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/demo/status")
      .then((r) => r.json())
      .then((d: { demoMode?: boolean }) => setDemoMode(Boolean(d.demoMode)))
      .catch(() => setDemoMode(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
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
        if (!pending?.search) {
          throw new Error(
            "No preserved search context. Return to the map and start from a route search.",
          );
        }

        const createRes = await fetch("/api/commercial/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_from_intent",
            intentId: pending.id,
            type,
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
          throw new Error(createData.error ?? "Could not create request");
        }
        const req = createData.request;
        if (cancelled) return;
        setRequest(req);
        applyRequestToForm(req);

        const portId = req.destination?.id;
        if (portId) {
          const cRes = await fetch(
            `/api/commercial/contacts?portId=${encodeURIComponent(portId)}`,
          );
          const cData = (await cRes.json()) as {
            contacts?: CommercialContact[];
            suggested?: CommercialContact;
            missingEmail?: boolean;
          };
          if (!cancelled) {
            const list = cData.contacts ?? [];
            setContacts(list);
            setSuggestedId(cData.suggested?.id);
            setMissingEmail(Boolean(cData.missingEmail));

            if (req.recipient?.manual || (!req.recipient?.contactId && req.recipient?.email)) {
              setRecipientManual(true);
              setRecipientId("");
              setRecipientOrg(req.recipient.organizationName ?? "");
              setRecipientEmail(req.recipient.email ?? "");
            } else if (list.length === 0) {
              setRecipientManual(true);
              setRecipientId("");
              setRecipientOrg(req.recipient?.organizationName ?? "");
              setRecipientEmail(req.recipient?.email ?? "");
            } else {
              setRecipientManual(false);
              setRecipientId(
                req.recipient?.contactId ?? cData.suggested?.id ?? "",
              );
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load form");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [intentId, type]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === recipientId),
    [contacts, recipientId],
  );

  function recipientPayload() {
    if (!recipientManual && recipientId) {
      return { contactId: recipientId };
    }
    if (recipientEmail.trim()) {
      return {
        manual: true as const,
        organizationName: recipientOrg.trim() || undefined,
        email: recipientEmail.trim(),
      };
    }
    return undefined;
  }

  function regenerateDraft(nextRecipient?: CommercialContact | { organizationName?: string }) {
    if (!request) return;
    const draft = generateCommercialMessageDraft({
      type: request.type,
      contactName,
      companyName,
      originName: request.origin?.name,
      destinationName: request.destination?.name,
      cargoDescription,
      cargoType,
      weightTons: weightTons ? Number(weightTons) : undefined,
      volumeCbm: volumeCbm ? Number(volumeCbm) : undefined,
      unitsPackages,
      requestedDeparture,
      preferredVesselType: preferredVesselType || undefined,
      selectedVesselName: noVesselPreference
        ? undefined
        : request.selectedVessel?.name,
      noVesselPreference,
      additionalNotes,
      recipientOrganization:
        nextRecipient?.organizationName ??
        (recipientManual
          ? recipientOrg || undefined
          : selectedContact?.organizationName),
      dangerousGoods,
      oversizedProjectCargo: oversized,
      handlingRequirements,
    });
    setSubject(draft.subject);
    setBody(draft.body);
  }

  async function onSubmit(event: FormEvent, markReady: boolean) {
    event.preventDefault();
    if (!request) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/commercial/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          requestId: request.id,
          markReady,
          patch: {
            cargo: {
              description: cargoDescription || undefined,
              type: cargoType || undefined,
              weightTons: weightTons ? Number(weightTons) : undefined,
              volumeCbm: volumeCbm ? Number(volumeCbm) : undefined,
              unitsPackages: unitsPackages || undefined,
            },
            preferredVesselType: preferredVesselType || undefined,
            requestedDeparture: requestedDeparture || undefined,
            requestedArrival: requestedArrival || undefined,
            dangerousGoods,
            oversizedProjectCargo: oversized,
            handlingRequirements: handlingRequirements || undefined,
            additionalNotes: additionalNotes || undefined,
            contactName,
            companyName,
            contactEmail,
            contactPhone,
            recipient: recipientPayload(),
            aiDraft: {
              subject,
              body,
              generator: "deterministic_template",
              generatedAt: new Date().toISOString(),
            },
            selectedVessel: noVesselPreference ? null : request.selectedVessel,
          },
        }),
      });
      const data = (await res.json()) as {
        request?: CommercialRequest;
        error?: string;
      };
      if (!res.ok || !data.request) {
        throw new Error(data.error ?? "Save failed");
      }
      setRequest(data.request);
      setReady(data.request.status === "READY_TO_SEND");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    setResendBusy(true);
    setResendMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        cooldownSeconds?: number;
      };
      if (!res.ok) {
        setResendMsg(
          data.error ??
            (typeof data.cooldownSeconds === "number"
              ? `Please wait ${data.cooldownSeconds}s before trying again.`
              : "Could not resend verification email."),
        );
        return;
      }
      setResendMsg(data.message ?? "Verification email sent.");
    } catch {
      setResendMsg("Network error — try again.");
    } finally {
      setResendBusy(false);
    }
  }

  async function onSendConfirmed() {
    if (!request) return;
    setSending(true);
    setError(null);
    try {
      const saveRes = await fetch("/api/commercial/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          requestId: request.id,
          markReady: true,
          patch: {
            cargo: {
              description: cargoDescription || undefined,
              type: cargoType || undefined,
              weightTons: weightTons ? Number(weightTons) : undefined,
              volumeCbm: volumeCbm ? Number(volumeCbm) : undefined,
              unitsPackages: unitsPackages || undefined,
            },
            preferredVesselType: preferredVesselType || undefined,
            requestedDeparture: requestedDeparture || undefined,
            requestedArrival: requestedArrival || undefined,
            dangerousGoods,
            oversizedProjectCargo: oversized,
            handlingRequirements: handlingRequirements || undefined,
            additionalNotes: additionalNotes || undefined,
            contactName,
            companyName,
            contactEmail,
            contactPhone,
            recipient: recipientPayload(),
            aiDraft: {
              subject,
              body,
              generator: "deterministic_template",
              generatedAt: new Date().toISOString(),
            },
          },
        }),
      });
      const saveData = (await saveRes.json()) as {
        request?: CommercialRequest;
        error?: string;
      };
      if (!saveRes.ok || !saveData.request) {
        throw new Error(saveData.error ?? "Could not save before send");
      }
      setRequest(saveData.request);
      setReady(saveData.request.status === "READY_TO_SEND");

      const res = await fetch(
        `/api/commercial/requests/${saveData.request.id}/send`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        request?: CommercialRequest;
        simulated?: boolean;
        message?: string;
      };
      if (data.code === "EMAIL_VERIFICATION_REQUIRED") {
        if (data.request) setRequest(data.request);
        setVerificationRequired(true);
        setConfirmSend(false);
        setReady(true);
        return;
      }
      if (!res.ok || !data.request) {
        if (data.request) setRequest(data.request);
        throw new Error(
          data.error ??
            "CargoConnect could not send this request. Your request has been saved and can be retried.",
        );
      }
      setRequest(data.request);
      setReady(false);
      setConfirmSend(false);
      setVerificationRequired(false);
      setSendResult({
        status: data.request.status,
        simulated: data.simulated,
        message: data.message,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "CargoConnect could not send this request. Your request has been saved and can be retried.",
      );
      setConfirmSend(false);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <CommercialShell title={title}>
        <p className="text-sm text-slate-400">Preparing request…</p>
      </CommercialShell>
    );
  }

  if (error && !request) {
    return (
      <CommercialShell title={title}>
        <p className="rounded-xl border border-amber-300/25 bg-amber-950/30 px-4 py-3 text-sm text-amber-50">
          {error}
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-teal-300">
          Return to map
        </Link>
      </CommercialShell>
    );
  }

  if (!request) return null;

  return (
    <CommercialShell title={title} subtitle={subtitle}>
      <form onSubmit={(e) => void onSubmit(e, false)}>
        <CommercialSection title="Shipment">
          <div className="mb-4 rounded-xl border border-white/8 bg-black/20 px-4 py-3">
            <p className="font-[family-name:var(--font-fraunces)] text-xl text-white">
              {request.origin?.name ?? "Origin"} → {request.destination?.name ?? "Destination"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              From search: {request.searchContext.originalQuery || "—"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Cargo description">
              <input
                className={inputClass}
                value={cargoDescription}
                onChange={(e) => setCargoDescription(e.target.value)}
              />
            </Labeled>
            <Labeled label="Cargo type">
              <input
                className={inputClass}
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
              />
            </Labeled>
            <Labeled label="Weight (tons)">
              <input
                className={inputClass}
                value={weightTons}
                onChange={(e) => setWeightTons(e.target.value)}
                inputMode="decimal"
              />
            </Labeled>
            <Labeled label="Volume (m³)">
              <input
                className={inputClass}
                value={volumeCbm}
                onChange={(e) => setVolumeCbm(e.target.value)}
                inputMode="decimal"
              />
            </Labeled>
            <Labeled label="Units / packages">
              <input
                className={inputClass}
                value={unitsPackages}
                onChange={(e) => setUnitsPackages(e.target.value)}
              />
            </Labeled>
            <Labeled label="Desired departure">
              <input
                type="date"
                className={inputClass}
                value={requestedDeparture}
                onChange={(e) => setRequestedDeparture(e.target.value)}
              />
            </Labeled>
            {type === "RESERVATION" ? (
              <Labeled label="Requested arrival (optional)">
                <input
                  type="date"
                  className={inputClass}
                  value={requestedArrival}
                  onChange={(e) => setRequestedArrival(e.target.value)}
                />
              </Labeled>
            ) : null}
            <Labeled label="Preferred vessel type">
              <input
                className={inputClass}
                value={preferredVesselType}
                onChange={(e) => setPreferredVesselType(e.target.value)}
                placeholder="e.g. general_cargo"
              />
            </Labeled>
          </div>
        </CommercialSection>

        <CommercialSection title="Vessel">
          {request.selectedVessel && !noVesselPreference ? (
            <p className="mb-2 text-sm text-slate-200">
              Selected: {request.selectedVessel.name} (
              {formatVesselType(request.selectedVessel.type)})
            </p>
          ) : (
            <p className="mb-2 text-sm text-slate-400">No vessel selected</p>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={noVesselPreference}
              onChange={(e) => setNoVesselPreference(e.target.checked)}
            />
            No vessel preference
          </label>
          <p className="mt-2 text-[11px] text-slate-500">
            Highlighted vessels are corridor-relevant detections — not confirmed
            commercial availability.
          </p>
        </CommercialSection>

        <CommercialSection title="Contact">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Full name">
              <input
                className={inputClass}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </Labeled>
            <Labeled label="Company">
              <input
                className={inputClass}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Labeled>
            <Labeled label="Email">
              <input
                type="email"
                className={inputClass}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
              />
            </Labeled>
            <Labeled label="Phone">
              <input
                className={inputClass}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </Labeled>
          </div>
        </CommercialSection>

        {type === "RESERVATION" ? (
          <CommercialSection title="Requirements">
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={dangerousGoods}
                onChange={(e) => setDangerousGoods(e.target.checked)}
              />
              Dangerous goods
            </label>
            <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={oversized}
                onChange={(e) => setOversized(e.target.checked)}
              />
              Oversized / project cargo
            </label>
            <Labeled label="Handling requirements">
              <textarea
                className={`${inputClass} min-h-[72px]`}
                value={handlingRequirements}
                onChange={(e) => setHandlingRequirements(e.target.value)}
              />
            </Labeled>
            <Labeled label="Additional notes">
              <textarea
                className={`${inputClass} min-h-[72px]`}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </Labeled>
          </CommercialSection>
        ) : (
          <CommercialSection title="Commercial request">
            <Labeled label="Additional requirements / notes">
              <textarea
                className={`${inputClass} min-h-[88px]`}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </Labeled>
          </CommercialSection>
        )}

        <CommercialSection title="Recipient">
          <p className="mb-3 text-xs text-slate-400">
            Suggested from destination port commercial directory, or enter a
            destination email manually. You choose who the request is prepared
            for — nothing is sent automatically.
          </p>
          {contacts.length === 0 ? (
            <p className="mb-3 text-sm text-amber-100/80">
              No curated contacts for this destination yet. Enter the
              destination broker or agent below.
            </p>
          ) : (
            <div className="mb-3 space-y-2">
              {contacts.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition ${
                    !recipientManual && recipientId === c.id
                      ? "border-teal-300/35 bg-teal-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="recipient"
                    checked={!recipientManual && recipientId === c.id}
                    onChange={() => {
                      setRecipientManual(false);
                      setRecipientId(c.id);
                      regenerateDraft(c);
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white">
                      {c.organizationName}
                      {suggestedId === c.id ? (
                        <span className="ml-2 text-[10px] font-normal text-teal-300/80">
                          Suggested
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      {c.contactType.replaceAll("_", " ")} · {c.portName}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {c.email ?? "Email unavailable (not fabricated)"}
                    </span>
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[10px] text-sky-300/80 hover:underline"
                    >
                      Source
                    </a>
                  </span>
                </label>
              ))}
              <label
                className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition ${
                  recipientManual
                    ? "border-teal-300/35 bg-teal-400/10"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name="recipient"
                  checked={recipientManual}
                  onChange={() => {
                    setRecipientManual(true);
                    setRecipientId("");
                    regenerateDraft({ organizationName: recipientOrg });
                  }}
                  className="mt-1"
                />
                <span className="text-sm font-medium text-white">
                  Enter destination recipient manually
                </span>
              </label>
            </div>
          )}

          {(recipientManual || contacts.length === 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Destination organization">
                <input
                  className={inputClass}
                  value={recipientOrg}
                  onChange={(e) => {
                    setRecipientManual(true);
                    setRecipientId("");
                    setRecipientOrg(e.target.value);
                  }}
                  onBlur={() =>
                    regenerateDraft({ organizationName: recipientOrg })
                  }
                  placeholder="Broker / agent company"
                  autoComplete="organization"
                />
              </Labeled>
              <Labeled label="Destination email">
                <input
                  type="email"
                  className={inputClass}
                  value={recipientEmail}
                  onChange={(e) => {
                    setRecipientManual(true);
                    setRecipientId("");
                    setRecipientEmail(e.target.value);
                  }}
                  placeholder="quotes@example.com"
                  autoComplete="email"
                  required={contacts.length === 0}
                />
              </Labeled>
            </div>
          )}
          {missingEmail && !recipientManual && contacts.length > 0 ? (
            <p className="mt-3 text-[11px] text-amber-100/70">
              No verified email for this destination — enter a recipient
              manually, or prepare the draft for later.
            </p>
          ) : null}
        </CommercialSection>

        <CommercialSection title="AI commercial message">
          <p className="mb-3 text-xs text-slate-400">
            Deterministic template from your form fields. Edit freely before sending.
          </p>
          <button
            type="button"
            onClick={() => regenerateDraft()}
            className="mb-3 rounded-full border border-white/12 px-3 py-1 text-[11px] text-slate-300 hover:border-teal-300/30 hover:text-white"
          >
            Regenerate from form
          </button>
          <Labeled label="Subject">
            <input
              className={inputClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Labeled>
          <Labeled label="Message">
            <textarea
              className={`${inputClass} min-h-[220px] font-mono text-[12px] leading-relaxed`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Labeled>
        </CommercialSection>

        {error ? (
          <p className="mb-4 rounded-lg border border-rose-400/25 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
            {error}
          </p>
        ) : null}

        {sendResult ? (
          <div className="mb-4 rounded-xl border border-teal-300/25 bg-teal-950/30 px-4 py-4 text-sm text-teal-50">
            <p className="font-medium">
              {sendResult.simulated
                ? "Request simulated (demo email)"
                : "Request sent"}
            </p>
            <p className="mt-1 text-xs text-teal-100/80">
              Status:{" "}
              <strong>
                {sendResult.simulated
                  ? "DELIVERY_SIMULATED"
                  : sendResult.status}
              </strong>
              {request.sentAt
                ? ` · ${new Date(request.sentAt).toLocaleString()}`
                : ""}
            </p>
            {sendResult.simulated ? (
              <p className="mt-2 text-[11px] text-teal-100/65">
                No external email was delivered. This is simulated outbound for
                demonstration.
              </p>
            ) : null}
            <p className="mt-1 text-xs text-teal-100/70">
              Reference: {request.id}
            </p>
            {request.recipient ? (
              <p className="mt-1 text-xs text-teal-100/70">
                Recipient: {request.recipient.organizationName}
                {request.recipient.email ? ` · ${request.recipient.email}` : ""}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-teal-100/60">
              CargoConnect does not claim the recipient has read or accepted this
              request.
            </p>
            <Link
              href={`/commercial/requests/${request.id}`}
              className="mt-3 inline-block text-xs text-teal-200 underline"
            >
              View request details
            </Link>
          </div>
        ) : null}

        {ready && !sendResult ? (
          <div className="mb-4 rounded-xl border border-teal-300/25 bg-teal-950/30 px-4 py-3 text-sm text-teal-50">
            <p>
              Request status: <strong>READY_TO_SEND</strong>
            </p>
            <p className="mt-1 text-xs text-teal-100/75">
              Review recipient and message, then send explicitly.
            </p>
          </div>
        ) : null}

        {verificationRequired && ready && !sendResult ? (
          <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-950/40 px-4 py-4 text-sm text-amber-50">
            <p className="font-medium">Email verification required</p>
            <p className="mt-1 text-xs text-amber-100/80">
              Live commercial sending requires a verified email. Your request stays{" "}
              <strong>READY_TO_SEND</strong> until you verify.
            </p>
            {sessionEmail ? (
              <p className="mt-2 text-xs text-amber-100/75">
                We sent a verification link to: {sessionEmail}
              </p>
            ) : null}
            <button
              type="button"
              disabled={resendBusy}
              onClick={() => void resendVerification()}
              className="mt-3 rounded-full border border-amber-200/30 bg-amber-400/10 px-4 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {resendBusy ? "Sending…" : "Resend Email"}
            </button>
            {resendMsg ? (
              <p className="mt-2 text-[11px] text-amber-100/70">{resendMsg}</p>
            ) : null}
          </div>
        ) : null}

        {confirmSend ? (
          <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-950/40 px-4 py-4 text-sm text-amber-50">
            <p className="font-medium">Send request to:</p>
            <p className="mt-1">
              {recipientManual
                ? recipientOrg ||
                  request.recipient?.organizationName ||
                  "Commercial recipient"
                : (selectedContact?.organizationName ??
                  request.recipient?.organizationName)}
            </p>
            <p className="text-xs text-amber-100/75">
              {recipientManual
                ? recipientEmail ||
                  request.recipient?.email ||
                  "No email"
                : (selectedContact?.email ??
                  request.recipient?.email ??
                  "No email")}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmSend(false)}
                className="rounded-full border border-white/20 px-4 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void onSendConfirmed()}
                className="rounded-full bg-teal-400/90 px-4 py-1.5 text-xs font-semibold text-slate-950"
              >
                {sending ? "Sending…" : "Confirm Send"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pb-10">
          <button
            type="submit"
            disabled={saving || sending || Boolean(sendResult)}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 hover:border-white/30 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={saving || sending || Boolean(sendResult)}
            onClick={(e) => void onSubmit(e as unknown as FormEvent, true)}
            className="rounded-full bg-teal-400/90 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-50"
          >
            {type === "QUOTE" ? "Mark quote ready" : "Request Reservation"}
          </button>
          <button
            type="button"
            disabled={
              sending ||
              Boolean(sendResult) ||
              (request.status !== "READY_TO_SEND" &&
                request.status !== "SEND_FAILED" &&
                !ready)
            }
            onClick={() => setConfirmSend(true)}
            className="rounded-full border border-teal-300/40 bg-teal-400/15 px-4 py-2 text-sm font-medium text-teal-100 hover:bg-teal-400/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {demoMode ? "Simulate Request" : "Send Request"}
          </button>
          <Link
            href="/commercial/requests"
            className="text-xs text-slate-400 underline hover:text-slate-200"
          >
            My requests
          </Link>
        </div>
      </form>
    </CommercialShell>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
