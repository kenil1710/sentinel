/**
 * The guardian. A shield whose scan ring sweeps four orbiting chains — the
 * whole product in one figure: one watcher, four chains, agents under watch.
 */
export function HeroVisual() {
  const chains = [
    { label: "ETH", angle: -60 }, { label: "BASE", angle: 20 },
    { label: "ARB", angle: 110 }, { label: "POL", angle: 195 },
  ];
  const R = 118;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]">
      <div className="absolute inset-0 grid-field rounded-full" />
      <svg viewBox="0 0 320 320" className="relative size-full">
        <defs>
          <radialGradient id="glow" cx="50%" cy="45%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.30" />
            <stop offset="70%" stopColor="#06B6D4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="152" r="120" fill="url(#glow)" />
        <circle cx="160" cy="152" r={R} fill="none" stroke="var(--color-line-2)" strokeWidth="1" strokeDasharray="3 7" />
        <circle cx="160" cy="152" r={R - 34} fill="none" stroke="var(--color-line)" strokeWidth="1" />

        {/* the sweep */}
        <g style={{ transformOrigin: "160px 152px", animation: "spin 9s linear infinite" }}>
          <path d={`M160 152 L160 ${152 - R} A ${R} ${R} 0 0 1 ${160 + R * Math.sin(0.9)} ${152 - R * Math.cos(0.9)} Z`}
            fill="#06B6D4" opacity="0.10" />
          <line x1="160" y1="152" x2="160" y2={152 - R} stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
        </g>

        {/* the shield */}
        <g transform="translate(160,152)">
          <path d="M0 -46 -33 -33 v26.5C-33 13 -19 27.5 0 31.5 19 27.5 33 13 33 -6.5V-33L0 -46Z"
            fill="var(--color-panel)" stroke="#06B6D4" strokeWidth="2" strokeLinejoin="round" />
          <path d="M-18 -6h36" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <circle cx="0" cy="-6" r="7.5" fill="none" stroke="#06B6D4" strokeWidth="2" />
          <circle cx="0" cy="-6" r="2.5" fill="#06B6D4" />
        </g>

        {chains.map((c) => {
          const rad = (c.angle * Math.PI) / 180;
          const x = 160 + R * Math.cos(rad);
          const y = 152 + R * Math.sin(rad);
          return (
            <g key={c.label}>
              <circle cx={x} cy={y} r="17" fill="var(--color-panel-2)" stroke="var(--color-line-2)" strokeWidth="1" />
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
