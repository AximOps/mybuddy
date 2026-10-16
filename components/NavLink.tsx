'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';

/** Small spinner that appears on the link you just clicked, while the next page loads. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span className={`nav-pending${pending ? ' on' : ''}`} aria-hidden="true" />;
}

export function NavLink({ href, active, className, children }: { href: string; active: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={className} prefetch>
      {children}
      <Pending />
    </Link>
  );
}
