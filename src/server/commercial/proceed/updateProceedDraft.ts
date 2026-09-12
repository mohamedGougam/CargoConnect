import type {
  CommercialProceedRequest,
  CommercialRequest,
} from "@/domain/commercial/types";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";

const MAX_SUBJECT = 300;
const MAX_BODY = 12000;

export async function updateProceedDraft(input: {
  requestId: string;
  proceedId: string;
  userId: string;
  subject?: string;
  body?: string;
}): Promise<
  | { ok: true; proceed: CommercialProceedRequest; request: CommercialRequest }
  | { ok: false; error: string; code: string }
> {
  const repos = getRepositories();
  const request = await repos.requests.get(input.requestId);
  if (!request || request.userId !== input.userId) {
    return { ok: false, error: "Request not found", code: "not_found" };
  }

  const proceed = await repos.proceedRequests.get(input.proceedId);
  if (
    !proceed ||
    proceed.commercialRequestId !== request.id ||
    proceed.userId !== input.userId
  ) {
    return { ok: false, error: "Proceed request not found", code: "not_found" };
  }

  if (
    proceed.status === "SENT" ||
    proceed.status === "DELIVERY_SIMULATED" ||
    proceed.status === "SENDING"
  ) {
    return {
      ok: false,
      error: "Proceed message can no longer be edited",
      code: "locked",
    };
  }

  const subject =
    input.subject != null
      ? input.subject.trim().slice(0, MAX_SUBJECT)
      : proceed.subject;
  const body =
    input.body != null ? input.body.trim().slice(0, MAX_BODY) : proceed.body;

  if (!subject || !body) {
    return { ok: false, error: "Subject and message are required", code: "validation" };
  }

  const now = new Date().toISOString();
  const updated: CommercialProceedRequest = {
    ...proceed,
    subject,
    body,
    status: "READY_TO_SEND",
    updatedAt: now,
  };
  await repos.proceedRequests.update(updated);

  const nextRequest: CommercialRequest = {
    ...request,
    status: "PROCEED_READY_TO_SEND",
    updatedAt: now,
  };
  await repos.requests.save(nextRequest);

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: request.id,
    userId: input.userId,
    eventType: "PROCEED_REQUEST_READY",
    metadata: { proceedId: proceed.id, edited: true },
    createdAt: now,
  });

  return { ok: true, proceed: updated, request: nextRequest };
}
