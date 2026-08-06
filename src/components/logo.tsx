// The brand mark: an apple bobbing in a steaming bowl of applesauce.
// Keep in sync with public/favicon.svg (same art, JSX attributes).
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32 36c-5-6 5-9 0-16"
        stroke="#a3a3a3"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M96 36c-5-6 5-9 0-16"
        stroke="#a3a3a3"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M64 28c-1-7 3-12 9-14"
        stroke="#92400e"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M73 14c9-6 17-3 19 3-7 5-15 3-19-3z" fill="#22c55e" />
      <circle cx="64" cy="50" r="24" fill="#ef4444" />
      <circle cx="55" cy="42" r="6" fill="#fca5a5" opacity="0.9" />
      <path d="M16 72a48 48 0 0 0 96 0z" fill="#525252" />
      <rect x="50" y="116" width="28" height="7" rx="3.5" fill="#525252" />
      <path
        d="M14 66c6-8 12-8 18 0s12 8 18 0 12-8 18 0 12 8 18 0 12-8 18 0v8H14z"
        fill="#f59e0b"
      />
      <path d="M34 72v9a5 5 0 0 0 10 0v-9z" fill="#f59e0b" />
      <path d="M84 72v14a5 5 0 0 0 10 0V72z" fill="#f59e0b" />
    </svg>
  );
}
