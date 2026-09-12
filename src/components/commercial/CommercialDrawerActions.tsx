"use client";

interface CommercialDrawerActionsProps {
  hasActiveSearch: boolean;
  onCheckPrice: () => void;
  onMakeReservation: () => void;
}

/**
 * Primary commercial CTAs inside vessel/port drawers.
 * Click allowed without login — auth gate runs when the workflow proceeds.
 */
export function CommercialDrawerActions({
  hasActiveSearch,
  onCheckPrice,
  onMakeReservation,
}: CommercialDrawerActionsProps) {
  return (
    <div className="mt-6 border-t border-white/[0.08] pt-5">
      <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-teal-300/80 uppercase">
        Commercial
      </p>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
        Commercial availability not confirmed.
        {hasActiveSearch
          ? " Uses your current route search context (origin, destination, cargo)."
          : " No active route search — origin and destination may need confirmation next."}
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onCheckPrice}
          className="w-full rounded-full bg-teal-400/90 px-4 py-2.5 text-[13px] font-semibold text-slate-950 transition hover:bg-teal-300"
        >
          Check Current Price
        </button>
        <button
          type="button"
          onClick={onMakeReservation}
          className="w-full rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-100 transition hover:border-teal-300/30 hover:bg-white/[0.07]"
        >
          Make a Reservation Request
        </button>
      </div>
    </div>
  );
}
