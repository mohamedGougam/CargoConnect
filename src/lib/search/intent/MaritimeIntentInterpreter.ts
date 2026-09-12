import type { MaritimeSearchIntent } from "@/domain/search/intent";

export interface InterpretQueryInput {
  query: string;
}

export interface InterpretQueryResult {
  intent: MaritimeSearchIntent;
  /** Interpreter implementation that produced the result. */
  source: "deterministic" | "openai";
  latencyMs: number;
  /** True when OpenAI was attempted but failed and deterministic was used. */
  fallbackUsed?: boolean;
  errorCode?: string;
}

/**
 * Interprets natural-language maritime search queries into structured intent.
 * Implementations must NOT invent final ports, vessels, prices, or availability.
 */
export interface MaritimeIntentInterpreter {
  interpret(input: InterpretQueryInput): Promise<InterpretQueryResult>;
}
