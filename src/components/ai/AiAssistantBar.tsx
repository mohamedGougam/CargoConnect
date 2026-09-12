"use client";

import { useEffect, useState, type FormEvent } from "react";

const EXAMPLE_PROMPTS = [
  "2,000 MT steel from Rotterdam to Alexandria",
  "General cargo from Piraeus to Alexandria",
  "Find vessels between Rotterdam and Egypt",
];

const SUGGESTIONS = [
  "2,000 MT steel from Rotterdam to Alexandria",
  "General cargo from Piraeus to Alexandria",
  "Find vessels between Rotterdam and Egypt",
];

interface AiAssistantBarProps {
  onSubmit?: (query: string) => void;
  isSearching?: boolean;
}

/**
 * Compact floating AI search — map remains the hero.
 */
export function AiAssistantBar({
  onSubmit,
  isSearching = false,
}: AiAssistantBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [typedExample, setTypedExample] = useState("");

  const showPlaceholderAnimation = !focused && value.length === 0 && !isSearching;

  useEffect(() => {
    if (!showPlaceholderAnimation) return;

    const full = EXAMPLE_PROMPTS[exampleIndex];
    let char = 0;
    let typeTimer = 0;

    const startId = window.setTimeout(() => {
      setTypedExample("");
      typeTimer = window.setInterval(() => {
        char += 1;
        setTypedExample(full.slice(0, char));
        if (char >= full.length) {
          window.clearInterval(typeTimer);
        }
      }, 26);
    }, 0);

    const advanceTimer = window.setTimeout(
      () => {
        setExampleIndex((i) => (i + 1) % EXAMPLE_PROMPTS.length);
      },
      full.length * 26 + 2800,
    );

    return () => {
      window.clearTimeout(startId);
      window.clearInterval(typeTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [exampleIndex, showPlaceholderAnimation]);

  function submitQuery(query: string) {
    const trimmed = query.trim();
    if (!trimmed || isSearching) return;
    setValue(trimmed);
    onSubmit?.(trimmed);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitQuery(value);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-4 sm:pt-5">
      <div className="pointer-events-auto w-full max-w-xl">
        <div className="mb-1.5 flex items-center justify-center gap-2">
          <span className="font-[family-name:var(--font-fraunces)] text-[13px] tracking-tight text-white/90 sm:text-sm">
            CargoConnect
          </span>
          <span className="rounded bg-teal-400/15 px-1.5 py-px text-[9px] font-semibold tracking-[0.14em] text-teal-200/90 uppercase">
            AI
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`flex items-center gap-2 rounded-full border bg-[rgba(10,18,28,0.78)] px-2.5 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.32)] backdrop-blur-md transition ${
            focused || isSearching ? "border-teal-300/35" : "border-white/12"
          }`}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-300/25 to-sky-500/15 ring-1 ring-teal-200/25"
            aria-hidden
          >
            <span
              className={`h-1.5 w-1.5 rounded-full bg-teal-300 ${isSearching ? "animate-pulse" : ""}`}
            />
          </span>

          <label htmlFor="cc-ai-query" className="sr-only">
            What are you looking to transport?
          </label>

          <div className="relative min-h-[1.35rem] min-w-0 flex-1">
            {showPlaceholderAnimation ? (
              <p
                className="pointer-events-none absolute inset-0 truncate text-[13px] text-slate-400"
                aria-hidden
              >
                {typedExample || "What are you looking to transport?"}
                <span className="cc-cursor ml-0.5 inline-block h-3.5 w-[1.5px] translate-y-[2px] bg-teal-300 align-middle" />
              </p>
            ) : null}
            <input
              id="cc-ai-query"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                focused || value || isSearching
                  ? "What are you looking to transport?"
                  : ""
              }
              disabled={isSearching}
              className="relative w-full bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500 disabled:opacity-70"
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={isSearching || !value.trim()}
            className="shrink-0 rounded-full bg-teal-400/90 px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSearching ? "…" : "Search"}
          </button>
        </form>

        <div className="mt-2 flex justify-center gap-1.5 overflow-hidden px-1">
          {SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isSearching}
              onClick={() => submitQuery(prompt)}
              className="max-w-[42%] truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-300/80 transition hover:border-teal-300/30 hover:text-white disabled:opacity-50"
              title={prompt}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
