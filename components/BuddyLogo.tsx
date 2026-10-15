/** The My Buddy logo, drawn the same way as the phone app (same shapes and colours). */
export function BuddyLogo({ size = 40, ring = false }: { size?: number; ring?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="My Buddy logo" style={{ flex: 'none' }}>
      <rect width="48" height="48" rx="13" fill="var(--accent)" stroke={ring ? '#FFFFFF' : 'none'} strokeWidth={ring ? 2 : 0} />
      <circle cx="24" cy="24" r="15" fill="#FFC93C" />
      <circle cx="18.5" cy="20" r="2" fill="#3A2A00" />
      <circle cx="29.5" cy="20" r="2" fill="#3A2A00" />
      <path d="M17.5 26.5 L22.3 31.2 L30.5 23.8" fill="none" stroke="#3A2A00" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Logo, name and tag, used at the top left of the app and on the login page. */
export function BrandLockup({ size = 36, large = false, onDark = false }: { size?: number; large?: boolean; onDark?: boolean }) {
  return (
    <div className="brand-lockup" style={{ display: 'flex', alignItems: 'center', gap: large ? 16 : 10 }}>
      <BuddyLogo size={size} ring={onDark} />
      <div>
        <div className="brand-word" style={large ? { fontSize: 30 } : undefined}>My <span style={onDark ? { color: '#FFFFFF' } : undefined}>Buddy</span></div>
        <div className="brand-tag" style={onDark ? { color: 'rgba(255,255,255,0.85)' } : undefined}>Daily Planner</div>
      </div>
    </div>
  );
}
