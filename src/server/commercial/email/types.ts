export interface SendCommercialEmailInput {
  requestId: string;
  toAddress: string;
  toOrganization: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  replyTo: string;
  fromAddress: string;
  fromName: string;
  idempotencyKey: string;
  /** Optional SMTP-style headers (e.g. Message-ID for threading). */
  headers?: Record<string, string>;
}

export interface SendCommercialEmailResult {
  ok: boolean;
  simulated?: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
}

export interface SendSystemEmailInput {
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  idempotencyKey: string;
  /** Safe log label — never include secrets/tokens. */
  purpose: string;
}

export interface EmailDeliveryProvider {
  readonly name: string;
  sendCommercialRequest(
    input: SendCommercialEmailInput,
  ): Promise<SendCommercialEmailResult>;
  sendSystemEmail(input: SendSystemEmailInput): Promise<SendCommercialEmailResult>;
}
