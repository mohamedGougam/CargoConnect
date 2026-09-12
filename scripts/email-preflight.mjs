/**
 * Validate email configuration without sending mail.
 * npm run email:preflight
 *
 * Loads .env.local then .env (dotenv). Never prints secrets.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

function present(name) {
  return Boolean(process.env[name]?.trim());
}

function mode() {
  return (process.env.EMAIL_DELIVERY_MODE ?? "log").trim().toLowerCase();
}

function issues() {
  const out = [];
  const warnings = [];
  const m = mode();
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  const inboundOn =
    (process.env.EMAIL_INBOUND_ENABLED ?? "").trim().toLowerCase() === "true";
  const appBase = process.env.APP_BASE_URL?.trim();

  if (m !== "log" && m !== "live") {
    out.push(`EMAIL_DELIVERY_MODE must be log|live (got ${m || "(empty)"})`);
  }

  if (m === "live") {
    if (!present("EMAIL_API_KEY")) out.push("EMAIL_API_KEY required when live");
    if (!present("EMAIL_FROM_ADDRESS")) {
      out.push("EMAIL_FROM_ADDRESS required when live");
    }
    if (provider !== "resend") {
      out.push(`Unsupported EMAIL_PROVIDER=${provider} (only resend)`);
    }
  } else {
    warnings.push("EMAIL_DELIVERY_MODE=log — outbound is DELIVERY_SIMULATED only");
  }

  if (appBase) {
    try {
      const u = new URL(appBase);
      if (!u.protocol.startsWith("http")) {
        out.push("APP_BASE_URL must be http(s)");
      }
      if (appBase.endsWith("/")) {
        warnings.push("APP_BASE_URL should not have a trailing slash");
      }
    } catch {
      out.push("APP_BASE_URL is not a valid URL");
    }
  } else if (m === "live" || inboundOn) {
    warnings.push("APP_BASE_URL unset — verification links / webhook docs need it");
  }

  if (inboundOn) {
    const domain =
      process.env.EMAIL_INBOUND_DOMAIN?.trim() ||
      process.env.EMAIL_REPLY_DOMAIN?.trim();
    if (!domain) {
      out.push(
        "EMAIL_INBOUND_DOMAIN (or EMAIL_REPLY_DOMAIN) required when inbound enabled",
      );
    }
    const wh =
      present("EMAIL_WEBHOOK_SECRET") || present("RESEND_WEBHOOK_SECRET");
    if (!wh) {
      out.push(
        "EMAIL_WEBHOOK_SECRET (or RESEND_WEBHOOK_SECRET) required when inbound enabled",
      );
    }
    if (m === "live" && !present("EMAIL_API_KEY")) {
      out.push("EMAIL_API_KEY required to fetch inbound message bodies");
    }
  }

  return { out, warnings, m, provider, inboundOn };
}

const { out, warnings, m, provider, inboundOn } = issues();

const report = {
  ok: out.length === 0,
  providerSelected: provider,
  deliveryMode: m,
  apiKeyPresent: present("EMAIL_API_KEY"),
  fromAddressPresent: present("EMAIL_FROM_ADDRESS"),
  fromName: process.env.EMAIL_FROM_NAME?.trim() || "CargoConnect (default)",
  replyToOverridePresent: present("EMAIL_REPLY_TO_OVERRIDE"),
  appBaseUrlPresent: present("APP_BASE_URL"),
  inboundEnabled: inboundOn,
  inboundDomainPresent: Boolean(
    process.env.EMAIL_INBOUND_DOMAIN?.trim() ||
      process.env.EMAIL_REPLY_DOMAIN?.trim(),
  ),
  webhookSecretPresent:
    present("EMAIL_WEBHOOK_SECRET") || present("RESEND_WEBHOOK_SECRET"),
  warnings,
  errors: out,
};

console.log(JSON.stringify(report, null, 2));
process.exit(out.length === 0 ? 0 : 1);
