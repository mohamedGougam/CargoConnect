import type { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
}

export function GlassPanel({ children, className = "" }: GlassPanelProps) {
  return (
    <div
      className={`rounded-2xl border border-white/15 bg-[rgba(12,22,34,0.82)] shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}
