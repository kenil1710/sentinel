/**
 * The guardian. A shield whose scan ring sweeps the five chains whose
 * transactions validators can judge (four of them through a real browser,
 * because their explorers sit behind a Cloudflare check; see README).
 */
export function HeroVisual() {
  const chains = [
    { label: "ETH", angle: -90 }, { label: "BASE", angle: -18 }, { label: "ARB", angle: 54 },
    { label: "POL", angle: 126 }, { label: "RH", angle: 198 },
  ];
  const R = 118;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]">
      <div className="absolute inset-0 grid-field rounded-full" />
      <svg viewBox="0 0 320 320" className="relative size-full" role="img" aria-label="A shield watching five chains: Ethereum, Base, Arbitrum, Polygon and Robinhood">
        <defs>
          <radialGradient id="glow" cx="50%" cy="45%">
            <stop offset="0%" stopColor="var(--color-signal-bright)" stopOpacity="0.14" />
            <stop offset="70%" stopColor="var(--color-signal-bright)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="152" r="120" fill="url(#glow)" />
        <circle cx="160" cy="152" r={R} fill="none" stroke="var(--color-line-2)" strokeWidth="1" strokeDasharray="3 7" />
        <circle cx="160" cy="152" r={R - 34} fill="none" stroke="var(--color-line)" strokeWidth="1" />

        {/* the sweep */}
        <g style={{ transformOrigin: "160px 152px", animation: "spin 9s linear infinite" }}>
          <path d={`M160 152 L160 ${152 - R} A ${R} ${R} 0 0 1 ${160 + R * Math.sin(0.9)} ${152 - R * Math.cos(0.9)} Z`}
            fill="var(--color-signal-bright)" opacity="0.10" />
          <line x1="160" y1="152" x2="160" y2={152 - R} stroke="var(--color-signal-bright)" strokeWidth="1.5" opacity="0.55" />
        </g>

        {/* the shield */}
        <g transform="translate(160,152)">
          <path d="M0 -46 -33 -33 v26.5C-33 13 -19 27.5 0 31.5 19 27.5 33 13 33 -6.5V-33L0 -46Z"
            fill="var(--color-panel)" stroke="var(--color-signal)" strokeWidth="2" strokeLinejoin="round" />
          <path d="M-18 -6h36" stroke="var(--color-signal)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
          <circle cx="0" cy="-6" r="7.5" fill="none" stroke="var(--color-signal)" strokeWidth="2" />
          <circle cx="0" cy="-6" r="2.5" fill="var(--color-signal)" />
        </g>

        {chains.map((c) => {
          const rad = (c.angle * Math.PI) / 180;
          const x = 160 + R * Math.cos(rad);
          const y = 152 + R * Math.sin(rad);
          return (
            <g key={c.label}>
              <circle cx={x} cy={y} r="17" fill="var(--color-panel)" stroke="var(--color-line-2)" strokeWidth="1" />
              <text x={x} y={y + 3.5} textAnchor="middle" className="mono"
                fill="var(--color-ink-2)" fontSize="9" fontWeight="600">{c.label}</text>
            </g>
          );
        })}
      </svg>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
