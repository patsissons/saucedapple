// The brand mark: a red apple with sauce dripping down over it.
// Keep in sync with public/favicon.svg (same art, JSX attributes).
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="logo-apple-clip">
          <circle cx="64" cy="74" r="42" />
        </clipPath>
      </defs>
      <circle cx="64" cy="74" r="42" fill="#ef4444" />
      <circle cx="46" cy="88" r="7" fill="#fca5a5" opacity="0.85" />
      <g clipPath="url(#logo-apple-clip)">
        <path
          fill="#f59e0b"
          d="M22 30h84v19H22z
            M30 49v9a4.5 4.5 0 0 0 9 0v-9z
            M50 49v22a5 5 0 0 0 10 0v-22z
            M74 49v14a5 5 0 0 0 10 0v-14z
            M92 49v6a4 4 0 0 0 8 0v-6z"
        />
        <circle cx="46" cy="42" r="6" fill="#fbbf24" opacity="0.9" />
      </g>
      <path
        d="M64 36c-1-9 3-14 10-16"
        stroke="#92400e"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M74 18c9-7 18-4 20 3-7 5-16 4-20-3z" fill="#22c55e" />
    </svg>
  );
}
