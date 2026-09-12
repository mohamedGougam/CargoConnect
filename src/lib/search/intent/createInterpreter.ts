import { isOpenAiSearchEnabled } from "./config";
import { DeterministicInterpreter } from "./deterministicInterpreter";
import type {
  InterpretQueryInput,
  InterpretQueryResult,
  MaritimeIntentInterpreter,
} from "./MaritimeIntentInterpreter";

let cached: MaritimeIntentInterpreter | null = null;

class HybridInterpreter implements MaritimeIntentInterpreter {
  async interpret(input: InterpretQueryInput): Promise<InterpretQueryResult> {
    if (!isOpenAiSearchEnabled()) {
      return new DeterministicInterpreter().interpret(input);
    }
    const { OpenAIInterpreter } = await import("./openaiInterpreter");
    return new OpenAIInterpreter().interpret(input);
  }
}

/** Default production interpreter (deterministic when OpenAI disabled). */
export function getDefaultMaritimeIntentInterpreter(): MaritimeIntentInterpreter {
  if (!cached) cached = new HybridInterpreter();
  return cached;
}

/** Test helper — clear singleton cache. */
export function resetMaritimeIntentInterpreterCache(): void {
  cached = null;
}

export async function createMaritimeIntentInterpreter(options?: {
  forceOpenAi?: boolean;
  forceDeterministic?: boolean;
}): Promise<MaritimeIntentInterpreter> {
  if (options?.forceDeterministic) return new DeterministicInterpreter();
  if (options?.forceOpenAi) {
    const { OpenAIInterpreter } = await import("./openaiInterpreter");
    return new OpenAIInterpreter();
  }
  return getDefaultMaritimeIntentInterpreter();
}
