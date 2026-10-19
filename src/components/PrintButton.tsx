"use client";

export function PrintButton({ label = "Export PDF" }: { label?: string }) {
  return (
    <button className="btn no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
