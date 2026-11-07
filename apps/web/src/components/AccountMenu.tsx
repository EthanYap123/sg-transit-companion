'use client';

import Image from 'next/image';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';

/** Header: a sign-in button, or the user's picture linking to their settings. */
export function AccountMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <span className="account-placeholder" aria-hidden="true" />;

  if (!session) {
    return (
      <button type="button" className="header-button" onClick={() => void signIn('google')}>
        Sign in
      </button>
    );
  }

  const { name, image } = session.user;
  return (
    <Link href="/settings" className="account-link" aria-label="Account settings" title="Account settings">
      {image ? (
        <Image src={image} alt="" width={32} height={32} className="avatar" unoptimized />
      ) : (
        <span className="avatar avatar-initial" aria-hidden="true">
          {(name ?? '?').charAt(0).toUpperCase()}
        </span>
      )}
    </Link>
  );
}
