import { Resend } from "resend";
import type {
  EmailDeliveryProvider,
  SendCommercialEmailInput,
  SendCommercialEmailResult,
  SendSystemEmailInput,
} from "./types";

export class ResendEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly name = "resend";
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async sendCommercialRequest(
    input: SendCommercialEmailInput,
  ): Promise<SendCommercialEmailResult> {
    return this.dispatch({
      to: input.toAddress,
      subject: input.subject,
      text: input.textBody,
      html: input.htmlBody,
      from: `${input.fromName} <${input.fromAddress}>`,
      replyTo: input.replyTo,
      idempotencyKey: input.idempotencyKey,
      headers: input.headers,
    });
  }

  async sendSystemEmail(
    input: SendSystemEmailInput,
  ): Promise<SendCommercialEmailResult> {
    return this.dispatch({
      to: input.toAddress,
      subject: input.subject,
      text: input.textBody,
      html: input.htmlBody,
      from: `${input.fromName} <${input.fromAddress}>`,
      replyTo: input.replyTo,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private async dispatch(input: {
    to: string;
    subject: string;
    text: string;
    html: string;
    from: string;
    replyTo?: string;
    idempotencyKey: string;
    headers?: Record<string, string>;
  }): Promise<SendCommercialEmailResult> {
    try {
      const result = await this.client.emails.send({
        from: input.from,
        to: [input.to],
        replyTo: input.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers: {
          "Idempotency-Key": input.idempotencyKey,
          ...(input.headers ?? {}),
        },
      });

      if (result.error) {
        console.error("[CargoConnect email:resend]", result.error.message);
        return {
          ok: false,
          provider: this.name,
          error: "provider_rejected",
        };
      }

      return {
        ok: true,
        provider: this.name,
        providerMessageId: result.data?.id,
      };
    } catch (err) {
      console.error(
        "[CargoConnect email:resend]",
        err instanceof Error ? err.message : "unknown",
      );
      return {
        ok: false,
        provider: this.name,
        error: "provider_error",
      };
    }
  }
}
