/**
 * Optional FX abstraction — never fabricates rates.
 *
 * Enable with FX_ENABLED=true and provide rates via FX_RATES_JSON, e.g.:
 * {"EUR":0.92,"GBP":0.79} meaning 1 USD = 0.92 EUR (rates expressed as USD→currency)
 * OR rates as currency→USD multipliers: we use currency→USD for normalization.
 *
 * Format: FX_RATES_JSON={"EUR":1.08,"GBP":1.27,"USD":1} meaning 1 EUR = 1.08 USD.
 * FX_RATES_AS_OF=2026-09-10T00:00:00.000Z
 * FX_SOURCE=manual_config
 */

export interface FxConversion {
  ok: true;
  amountUsd: number;
  rate: number;
  source: string;
  timestamp: string;
}

export interface FxUnavailable {
  ok: false;
  reason: string;
}

export function isFxEnabled(): boolean {
  return (process.env.FX_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function convertToUsd(
  amount: number,
  currency: string,
): FxConversion | FxUnavailable {
  if (!isFxEnabled()) {
    return { ok: false, reason: "fx_disabled" };
  }
  const code = currency.trim().toUpperCase();
  if (!code) return { ok: false, reason: "missing_currency" };

  let rates: Record<string, number> = {};
  try {
    rates = JSON.parse(process.env.FX_RATES_JSON ?? "{}") as Record<string, number>;
  } catch {
    return { ok: false, reason: "invalid_fx_config" };
  }

  if (code === "USD") {
    return {
      ok: true,
      amountUsd: amount,
      rate: 1,
      source: process.env.FX_SOURCE?.trim() || "identity",
      timestamp: process.env.FX_RATES_AS_OF?.trim() || new Date().toISOString(),
    };
  }

  const rate = rates[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: "rate_unavailable" };
  }

  return {
    ok: true,
    amountUsd: amount * rate,
    rate,
    source: process.env.FX_SOURCE?.trim() || "manual_config",
    timestamp: process.env.FX_RATES_AS_OF?.trim() || new Date().toISOString(),
  };
}
