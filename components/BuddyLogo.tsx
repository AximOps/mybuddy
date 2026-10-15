/** The My Buddy logo, drawn the same way as the phone app (same shapes and colours). */
export function BuddyLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="My Buddy logo" style={{ flex: 'none' }}>
      <rect width="48" height="48" rx="13" fill="var(--accent)" />
      <circle cx="24" cy="24" r="15" fill="#FFC93C" />
      <circle cx="18.5" cy="20" r="2" fill="#3A2A00" />
      <circle cx="29.5" cy="20" r="2" fill="#3A2A00" />
      <path d="M17.5 26.5 L22.3 31.2 L30.5 23.8" fill="none" stroke="#3A2A00" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
