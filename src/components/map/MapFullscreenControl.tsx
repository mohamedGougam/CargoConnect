"use client";

interface MapFullscreenControlProps {
  fullscreen: boolean;
  onEnter: () => void;
  onExit: () => void;
}

/**
 * Subtle top-right map chrome control for application-level fullscreen.
 */
export function MapFullscreenControl({
  fullscreen,
  onEnter,
  onExit,
}: MapFullscreenControlProps) {
  if (fullscreen) {
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-40 sm:top-4 sm:right-4">
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit full screen"
          title="Exit full screen"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-[rgba(8,16,28,0.88)] px-3 py-1.5 text-[11px] font-medium text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition hover:border-white/30 hover:text-white"
        >
          <FullscreenExitIcon />
          <span>Exit full screen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-30 sm:top-4 sm:right-4">
      <button
        type="button"
        onClick={onEnter}
        aria-label="Enter full screen"
        title="Full screen"
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cc-chrome-border,rgba(255,255,255,0.12))] bg-[color:var(--cc-glass,rgba(8,16,28,0.82))] text-slate-200 shadow-[var(--cc-chrome-shadow,0_8px_24px_rgba(0,0,0,0.28))] backdrop-blur-[10px] transition hover:border-[color:color-mix(in_srgb,var(--cc-teal,#5eead4)_35%,transparent)] hover:text-white"
      >
        <FullscreenEnterIcon />
      </button>
    </div>
  );
}

function FullscreenEnterIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="text-current"
    >
      <path
        d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FullscreenExitIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="text-current"
    >
      <path
        d="M6 2.5V6H2.5M10 2.5V6h3.5M10 13.5V10h3.5M6 13.5V10H2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
