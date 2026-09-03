/** The mark. A shield with a scan slit — a guard that is actively looking. */
export function Shield({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M16 2.5 4.5 7v9.2c0 6.9 4.8 11.9 11.5 13.3 6.7-1.4 11.5-6.4 11.5-13.3V7L16 2.5Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 15.2h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
      <circle cx="16" cy="15.2" r="2.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
