type CounterMap = Map<string, number>;

const counters: CounterMap = new Map();

export function incrMetric(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function getMetric(name: string): number {
  return counters.get(name) ?? 0;
}

export function snapshotMetrics(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetMetricsForTests(): void {
  counters.clear();
}

/** Lightweight named counters for ops signals. */
export const metrics = {
  authLoginFailure: () => incrMetric("auth.login_failure"),
  authLoginSuccess: () => incrMetric("auth.login_success"),
  authSignup: () => incrMetric("auth.signup"),
  verificationSend: () => incrMetric("email.verification_send"),
  emailSendSuccess: () => incrMetric("email.outbound_success"),
  emailSendFailure: () => incrMetric("email.outbound_failure"),
  inboundProcessed: () => incrMetric("email.inbound_processed"),
  inboundDuplicate: () => incrMetric("email.inbound_duplicate"),
  inboundRejected: () => incrMetric("email.inbound_rejected"),
  uploadSuccess: () => incrMetric("storage.upload_success"),
  uploadFailure: () => incrMetric("storage.upload_failure"),
  downloadFailure: () => incrMetric("storage.download_failure"),
  scanClean: () => incrMetric("malware.clean"),
  scanInfected: () => incrMetric("malware.infected"),
  scanFailed: () => incrMetric("malware.failed"),
  aisJobRun: () => incrMetric("ais.job_run"),
  aisProviderUnavailable: () => incrMetric("ais.provider_unavailable"),
  aisIngested: (n: number) => incrMetric("ais.ingested", n),
  aisSkipped: (n: number) => incrMetric("ais.skipped", n),
  dbFailure: () => incrMetric("database.failure"),
  claimPdfSuccess: () => incrMetric("pdf.claim_success"),
  claimPdfFailure: () => incrMetric("pdf.claim_failure"),
  handoffPdfSuccess: () => incrMetric("pdf.handoff_success"),
  handoffPdfFailure: () => incrMetric("pdf.handoff_failure"),
  rateLimited: () => incrMetric("rate_limit.hit"),
};
