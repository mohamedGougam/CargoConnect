"use client";

/**
 * Subtle animated sea-wave veil for Day View.
 * Presentation-only — does not affect map hit-testing or search logic.
 */
export function MapSeaWaveOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      className="cc-sea-waves pointer-events-none absolute inset-0 z-[1]"
      aria-hidden
    >
      <div className="cc-sea-waves__sheet cc-sea-waves__sheet--a" />
      <div className="cc-sea-waves__sheet cc-sea-waves__sheet--b" />
      <div className="cc-sea-waves__caustic" />
    </div>
  );
}
