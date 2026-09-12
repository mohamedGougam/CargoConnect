import { createHash, randomBytes } from "crypto";
import {
  getEmailDeliveryProvider,
  getEmailFromConfig,
} from "@/server/commercial/email";
import { getRepositories } from "@/server/commercial/repos";
import { newId } from "@/server/commercial/repos/memory";
import type { StoredUser } from "@/server/commercial/repos/types";

const DEFAULT_TTL_MINUTES = 60;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
const RESEND_MAX_PER_HOUR = 5;

function getResendCooldownMs(): number {
  const n = Number(
    process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS ??
      DEFAULT_RESEND_COOLDOWN_SECONDS,
  );
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RESEND_COOLDOWN_SECONDS * 1000;
  return n * 1000;
}

export function getAppBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function getVerificationTtlMinutes(): number {
  const n = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES ?? DEFAULT_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MINUTES;
}

export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateRawVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isEmailVerified(user: StoredUser | { emailVerifiedAt?: string | null }): boolean {
  return Boolean(user.emailVerifiedAt);
}

export function isLiveEmailMode(): boolean {
  return (process.env.EMAIL_DELIVERY_MODE ?? "log").trim().toLowerCase() === "live";
}

function buildVerificationBodies(input: {
  fullName: string;
  verifyUrl: string;
  ttlMinutes: number;
}): { text: string; html: string } {
  const text = [
    "CargoConnect",
    "",
    "Verify your email",
    "",
    `Hi ${input.fullName},`,
    "",
    "Please verify your email address to enable commercial requests on CargoConnect.",
    "",
    `Verify email: ${input.verifyUrl}`,
    "",
    `This verification link expires in ${input.ttlMinutes} minutes.`,
    "",
    "If you did not create this account, you can ignore this message.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:20px 24px;background:#0b1520;color:#e2e8f0;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5eead4;">CargoConnect</div>
          <div style="margin-top:6px;font-size:20px;font-weight:600;">Verify your email</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(input.fullName)},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#475569;">
            Please verify your email address to enable commercial requests on CargoConnect.
          </p>
          <p style="margin:0 0 20px;">
            <a href="${escapeHtml(input.verifyUrl)}" style="display:inline-block;background:#2dd4bf;color:#042f2e;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:999px;">
              Verify email
            </a>
          </p>
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
            This verification link expires in ${input.ttlMinutes} minutes.<br/>
            If you did not create this account, you can ignore this message.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type IssueVerificationResult =
  | { ok: true; simulated: boolean; cooldownSeconds?: number }
  | { ok: false; error: string; code: string; cooldownSeconds?: number };

/**
 * Creates a single-use hashed token and sends verification email.
 * Raw token is never persisted or logged.
 */
export async function issueEmailVerification(
  user: StoredUser,
  options?: { force?: boolean },
): Promise<IssueVerificationResult> {
  if (isEmailVerified(user) && !options?.force) {
    return { ok: false, error: "Email is already verified", code: "already_verified" };
  }

  const repos = getRepositories();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await repos.verificationTokens.countRecentForUser(user.id, since);
  if (recent >= RESEND_MAX_PER_HOUR) {
    return {
      ok: false,
      error: "Too many verification emails. Try again later.",
      code: "rate_limited",
    };
  }

  const cooldownMs = getResendCooldownMs();
  if (cooldownMs > 0) {
    const sinceCooldown = new Date(Date.now() - cooldownMs).toISOString();
    const veryRecent = await repos.verificationTokens.countRecentForUser(
      user.id,
      sinceCooldown,
    );
    if (veryRecent > 0) {
      return {
        ok: false,
        error: "Please wait a moment before requesting another verification email.",
        code: "cooldown",
        cooldownSeconds: Math.ceil(cooldownMs / 1000),
      };
    }
  }

  await repos.verificationTokens.invalidateActiveForUser(user.id);

  const rawToken = generateRawVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const now = new Date();
  const ttlMinutes = getVerificationTtlMinutes();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

  await repos.verificationTokens.create({
    id: newId("evt"),
    userId: user.id,
    tokenHash,
    expiresAt,
    usedAt: null,
    createdAt: now.toISOString(),
  });

  const verifyUrl = `${getAppBaseUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  const bodies = buildVerificationBodies({
    fullName: user.fullName,
    verifyUrl,
    ttlMinutes,
  });
  const from = getEmailFromConfig();

  let provider;
  try {
    provider = getEmailDeliveryProvider();
  } catch {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: null,
      userId: user.id,
      eventType: "USER_EMAIL_VERIFICATION_FAILED",
      metadata: { reason: "provider_config" },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: false,
      error: "Could not send verification email. Try again later.",
      code: "provider_config",
    };
  }

  const result = await provider.sendSystemEmail({
    toAddress: user.email,
    subject: "Verify your CargoConnect email",
    textBody: bodies.text,
    htmlBody: bodies.html,
    fromAddress: from.address,
    fromName: from.name,
    idempotencyKey: `cc-verify-${tokenHash.slice(0, 24)}`,
    purpose: "email_verification",
  });

  if (!result.ok) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: null,
      userId: user.id,
      eventType: "USER_EMAIL_VERIFICATION_FAILED",
      metadata: { reason: "send_failed", provider: result.provider },
      createdAt: new Date().toISOString(),
    });
    return {
      ok: false,
      error: "Could not send verification email. Try again later.",
      code: "send_failed",
    };
  }

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: null,
    userId: user.id,
    eventType: "USER_EMAIL_VERIFICATION_SENT",
    metadata: {
      provider: result.provider,
      simulated: Boolean(result.simulated),
      // never include raw token
    },
    createdAt: new Date().toISOString(),
  });

  return { ok: true, simulated: Boolean(result.simulated) };
}

export type ConsumeVerificationResult =
  | { ok: true; user: StoredUser }
  | { ok: false; error: string; code: string };

export async function consumeEmailVerificationToken(
  rawToken: string,
): Promise<ConsumeVerificationResult> {
  const token = rawToken?.trim();
  if (!token || token.length < 20) {
    return { ok: false, error: "Invalid or expired verification link.", code: "invalid" };
  }

  const repos = getRepositories();
  const tokenHash = hashVerificationToken(token);
  const record = await repos.verificationTokens.findValidByHash(tokenHash);
  if (!record) {
    await repos.audits.append({
      id: newId("audit"),
      commercialRequestId: null,
      userId: null,
      eventType: "USER_EMAIL_VERIFICATION_FAILED",
      metadata: { reason: "invalid_or_expired" },
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: "Invalid or expired verification link.", code: "invalid" };
  }

  const user = await repos.users.findById(record.userId);
  if (!user) {
    return { ok: false, error: "Invalid or expired verification link.", code: "invalid" };
  }

  const now = new Date().toISOString();
  await repos.verificationTokens.markUsed(record.id, now);
  await repos.verificationTokens.invalidateActiveForUser(user.id);
  const verified = await repos.users.markEmailVerified(user.id, now);
  if (!verified) {
    return { ok: false, error: "Invalid or expired verification link.", code: "invalid" };
  }

  await repos.audits.append({
    id: newId("audit"),
    commercialRequestId: null,
    userId: user.id,
    eventType: "USER_EMAIL_VERIFIED",
    metadata: {},
    createdAt: now,
  });

  return { ok: true, user: verified };
}

/** Test helper */
export function resetVerificationRateLimitsForTests(): void {
  // Rate limits are derived from token creation timestamps in the store.
}
