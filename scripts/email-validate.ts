/**
 * Operator email validation — optional live send to an explicit recipient only.
 * Never uses customer records. Never prints API keys.
 *
 * Usage:
 *   npx tsx scripts/email-validate.ts --dry-run
 *   EMAIL_VALIDATE_SEND=true npx tsx scripts/email-validate.ts --to you@example.com
 *
 * Requires EMAIL_DELIVERY_MODE=live + EMAIL_API_KEY + EMAIL_FROM_ADDRESS for real send.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = hasFlag("--dry-run") || process.env.EMAIL_VALIDATE_SEND !== "true";
  const to =
    arg("--to")?.trim() ||
    process.env.EMAIL_VALIDATE_TO?.trim() ||
    "";

  const mode = (process.env.EMAIL_DELIVERY_MODE ?? "log").trim().toLowerCase();
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || "";
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "CargoConnect";
  const apiKeyPresent = Boolean(process.env.EMAIL_API_KEY?.trim());

  console.log(
    JSON.stringify({
      step: "config",
      dryRun,
      deliveryMode: mode,
      apiKeyPresent,
      fromAddressPresent: Boolean(fromAddress),
      recipientProvided: Boolean(to),
      note: dryRun
        ? "Dry-run only — set EMAIL_VALIDATE_SEND=true and --to <addr> to send"
        : "Live send requested",
    }),
  );

  if (dryRun) {
    console.log(JSON.stringify({ step: "result", status: "DRY_RUN", sent: false }));
    process.exit(0);
  }

  if (!to || !to.includes("@")) {
    console.log(
      JSON.stringify({
        step: "fatal",
        error: "Recipient required: --to operator@example.com",
      }),
    );
    process.exit(1);
  }

  if (mode !== "live") {
    console.log(
      JSON.stringify({
        step: "fatal",
        error: "EMAIL_DELIVERY_MODE must be live for real send",
      }),
    );
    process.exit(1);
  }

  if (!apiKeyPresent || !fromAddress) {
    console.log(
      JSON.stringify({
        step: "fatal",
        error: "EMAIL_API_KEY and EMAIL_FROM_ADDRESS required",
      }),
    );
    process.exit(1);
  }

  const { getEmailDeliveryProvider } = await import(
    "../src/server/commercial/email"
  );
  const provider = getEmailDeliveryProvider();
  const result = await provider.sendSystemEmail({
    toAddress: to,
    fromAddress,
    fromName,
    subject: "CargoConnect Demo Email Validation",
    textBody:
      "This is a CargoConnect operator validation message. Safe to ignore.",
    htmlBody:
      "<p>This is a CargoConnect operator validation message. Safe to ignore.</p>",
    idempotencyKey: `cc-email-validate-${Date.now()}`,
    purpose: "operator_demo_email_validation",
  });

  console.log(
    JSON.stringify({
      step: "result",
      status: result.ok ? "SENT" : "FAILED",
      provider: result.provider,
      providerMessageIdPresent: Boolean(
        "providerMessageId" in result && result.providerMessageId,
      ),
      error: result.ok ? undefined : result.error,
    }),
  );
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      step: "fatal",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
