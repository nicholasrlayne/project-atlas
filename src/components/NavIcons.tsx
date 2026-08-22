interface NavGlyphProps {
  size?: number;
  className?: string;
}

export function HomeGlyph({ size = 16, className }: NavGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="miter"
      strokeLinecap="square"
      className={className}
      aria-hidden
    >
      <path d="M4 11L12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </svg>
  );
}

export function CustomersGlyph({ size = 16, className }: NavGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="miter"
      className={className}
      aria-hidden
    >
      <rect x="5" y="4" width="14" height="17" />
      <g fill="currentColor" stroke="none">
        <rect x="7.8" y="7" width="2.1" height="2.1" />
        <rect x="13.9" y="7" width="2.1" height="2.1" />
        <rect x="7.8" y="11.3" width="2.1" height="2.1" />
        <rect x="13.9" y="11.3" width="2.1" height="2.1" />
        <rect x="10" y="16.3" width="4" height="4.7" />
      </g>
    </svg>
  );
}

export function TasksGlyph({ size = 16, className }: NavGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="miter"
      strokeLinecap="square"
      className={className}
      aria-hidden
    >
      <rect x="4" y="4" width="16" height="16" />
      <path d="M7.5 12.5l2.7 2.7 6-6.4" />
    </svg>
  );
}