export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden className={className}>
      <rect
        x="4.5"
        y="8.5"
        width="31"
        height="27"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M4.5 15.5H35.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10 21H30M10 26H30M10 31H23"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M14 4.5H31.5V8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
