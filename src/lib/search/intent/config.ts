/**
 * Server-only OpenAI search interpretation config.
 * Never expose OPENAI_API_KEY via NEXT_PUBLIC_*.
 */

export const DEFAULT_OPENAI_SEARCH_MODEL = "gpt-5.6-luna";
export const OPENAI_SEARCH_TIMEOUT_MS = 6_000;

export function isOpenAiSearchEnabled(): boolean {
  const flag = (process.env.OPENAI_SEARCH_ENABLED ?? "false").toLowerCase();
  if (flag !== "true" && flag !== "1" && flag !== "yes") return false;
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key);
}

export function getOpenAiSearchModel(): string {
  return process.env.OPENAI_SEARCH_MODEL?.trim() || DEFAULT_OPENAI_SEARCH_MODEL;
}

export function getOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}
