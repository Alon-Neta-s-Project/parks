/** The path motif: a thin route with stops. Used here as the thinking state. */
export function PathLine() {
  return (
    <svg className="thinking__path" viewBox="0 0 74 12" aria-hidden="true">
      <defs>
        <linearGradient id="pw-path" x1="0" y1="0" x2="74" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--pw-way-500)" />
          <stop offset="1" stopColor="var(--pw-magic-500)" />
        </linearGradient>
      </defs>
      <path d="M5 6h64" stroke="url(#pw-path)" strokeWidth="1.5" fill="none" />
      {[5, 26, 47, 69].map((cx) => (
        <circle
          key={cx}
          cx={cx}
          cy="6"
          r="3"
          fill="var(--pw-canvas)"
          stroke="url(#pw-path)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
