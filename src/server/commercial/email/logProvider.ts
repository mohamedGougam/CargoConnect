import type {
  EmailDeliveryProvider,
  SendCommercialEmailInput,
  SendCommercialEmailResult,
  SendSystemEmailInput,
} from "./types";

/**
 * Development / test provider — validates and logs, never contacts an external API.
 */
export class LogEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly name = "log";

  async sendCommercialRequest(
    input: SendCommercialEmailInput,
  ): Promise<SendCommercialEmailResult> {
    console.info("[CargoConnect email:log]", {
      purpose: "commercial_request",
      requestId: input.requestId,
      to: input.toAddress,
      subject: input.subject.slice(0, 120),
      replyTo: input.replyTo,
      from: `${input.fromName} <${input.fromAddress}>`,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      ok: true,
      simulated: true,
      provider: this.name,
      providerMessageId: `log_${input.idempotencyKey}`,
    };
  }

  async sendSystemEmail(
    input: SendSystemEmailInput,
  ): Promise<SendCommercialEmailResult> {
    console.info("[CargoConnect email:log]", {
      purpose: input.purpose,
      to: input.toAddress,
      subject: input.subject.slice(0, 120),
      from: `${input.fromName} <${input.fromAddress}>`,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      ok: true,
      simulated: true,
      provider: this.name,
      providerMessageId: `log_${input.idempotencyKey}`,
    };
  }
}
