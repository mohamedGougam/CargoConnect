import { LogEmailDeliveryProvider } from "./logProvider";
import { ResendEmailDeliveryProvider } from "./resendProvider";
import type { EmailDeliveryProvider } from "./types";

/**
 * EMAIL_DELIVERY_MODE=log|live
 * Default: log (safe for tests/dev — never emails real brokers).
 */
export function getEmailDeliveryProvider(): EmailDeliveryProvider {
  const mode = (process.env.EMAIL_DELIVERY_MODE ?? "log").trim().toLowerCase();
  if (mode === "live") {
    const key = process.env.EMAIL_API_KEY?.trim();
    if (!key) {
      throw new Error("EMAIL_API_KEY is required when EMAIL_DELIVERY_MODE=live");
    }
    const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
    if (provider !== "resend") {
      throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
    }
    return new ResendEmailDeliveryProvider(key);
  }
  return new LogEmailDeliveryProvider();
}

export function getEmailFromConfig(): { address: string; name: string } {
  return {
    address:
      process.env.EMAIL_FROM_ADDRESS?.trim() || "requests@localhost.local",
    name: process.env.EMAIL_FROM_NAME?.trim() || "CargoConnect",
  };
}

export type { EmailDeliveryProvider } from "./types";
