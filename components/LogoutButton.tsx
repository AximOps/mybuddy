'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`btn ghost ${compact ? 'sm' : 'block'}`}
      onClick={async () => { await authClient.signOut(); router.push('/login'); }}
    >
      <LogOut size={16} strokeWidth={1.9} aria-hidden="true" /> Log out
    </button>
  );
}
