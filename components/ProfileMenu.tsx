import Link from 'next/link';
import { Settings, ShieldCheck } from 'lucide-react';
import { initials } from '@/lib/initials';
import { LogoutButton } from './LogoutButton';

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
