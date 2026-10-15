import Link from 'next/link';
import { Settings, ShieldCheck } from 'lucide-react';
import { LogoutButton } from './LogoutButton';

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Profile button at the top right, with Settings and Log out. */
export function ProfileMenu({ name, email, showAdmin = false }: { name: string; email: string; showAdmin?: boolean }) {
  return (
    <details className="profile">
      <summary aria-label="Profile menu">
        <span className="avatar">{initials(name, email)}</span>
        <span className="profile-name">{name || email}</span>
      </summary>
      <div className="profile-menu">
        <div className="profile-id">
          <strong>{name || 'Signed in'}</strong>
          <span className="small muted">{email}</span>
        </div>
        {showAdmin ? (
          <Link href="/admin" className="profile-item">
            <ShieldCheck size={16} strokeWidth={1.9} aria-hidden="true" /> Admin
          </Link>
        ) : null}
        <Link href="/settings" className="profile-item">
          <Settings size={16} strokeWidth={1.9} aria-hidden="true" /> Settings
        </Link>
        <div className="profile-item"><LogoutButton compact /></div>
      </div>
    </details>
  );
}
