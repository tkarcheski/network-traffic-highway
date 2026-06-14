export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-label="Network Highway City logo"
      role="img"
    >
      {/* ground diamond */}
      <path d="M24 30 L42 39 L24 48 L6 39 Z" fill="currentColor" opacity="0.25" />
      {/* tall tower */}
      <path d="M18 8 L26 12 L26 30 L18 26 Z" fill="currentColor" />
      <path d="M26 12 L34 8 L34 26 L26 30 Z" fill="currentColor" opacity="0.7" />
      <path d="M18 8 L26 4 L34 8 L26 12 Z" fill="currentColor" opacity="0.5" />
      {/* highway dash */}
      <path
        d="M6 36 L42 36"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="3 3"
        opacity="0.6"
      />
    </svg>
  );
}
