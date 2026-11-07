'use client';

import Image from 'next/image';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { deleteMe, getMe, type Me } from '@/lib/api';
import { clearApiToken, getApiToken } from '@/lib/api-token';
import { callWhileWaking } from '@/lib/wake';

type LoadStatus = 'loading' | 'waking' | 'ready' | 'error';

const memberSince = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Singapore',
});

/** The signed-in user's account: who they are, signing out, and deleting everything (PRD US-07). */
export function SettingsView() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <p role="status">Loading…</p>;

  if (!session) {
    return (
      <>
        <h1>Settings</h1>
        <p className="lede">Sign in to manage your account. You don’t need one to search for stops.</p>
        <button type="button" className="button" onClick={() => void signIn('google')}>
          Sign in with Google
        </button>
      </>
    );
  }

  return <AccountSettings />;
}

function AccountSettings() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    callWhileWaking(
      async () => {
        const token = await getApiToken();
        if (!token) throw new Error('Not signed in');
        return getMe(token, controller.signal);
      },
      { signal: controller.signal, onWaking: () => setLoadStatus('waking') },
    ).then(
      (user) => {
        setMe(user);
        setLoadStatus('ready');
      },
      () => {
        if (!controller.signal.aborted) setLoadStatus('error');
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setLoadStatus('loading');
    setAttempt((n) => n + 1);
  }

  function onSignOut() {
    clearApiToken();
    void signOut({ redirectTo: '/' });
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      const token = await getApiToken();
      if (!token) throw new Error('Not signed in');
      await deleteMe(token);
      clearApiToken();
      await signOut({ redirectTo: '/' });
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
    }
  }

  return (
    <>
      <h1>Settings</h1>

      {loadStatus === 'loading' && <p role="status">Loading your account…</p>}
      {loadStatus === 'waking' && <p role="status">Waking up the server, this can take up to a minute…</p>}
      {loadStatus === 'error' && (
        <div className="notice notice-error" role="alert">
          <p>Your account isn’t available right now.</p>
          <button type="button" className="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {me && (
        <section className="account-card" aria-label="Your account">
          {me.imageUrl && (
            <Image src={me.imageUrl} alt="" width={56} height={56} className="avatar" unoptimized />
          )}
          <div>
            <strong>{me.name ?? 'Your account'}</strong>
            <p>Member since {memberSince.format(new Date(me.createdAt))}</p>
          </div>
        </section>
      )}

      <button type="button" className="button button-quiet" onClick={onSignOut}>
        Sign out
      </button>

      {me && (
        <section className="danger-zone" aria-label="Delete account">
          <h2>Delete account</h2>
          <p>Permanently removes your account and everything saved with it. This can’t be undone.</p>
          {deleteFailed && (
            <p className="notice notice-error" role="alert">
              Your account couldn’t be deleted. Nothing was removed. Please try again.
            </p>
          )}
          {confirming ? (
            <div className="button-row">
              <button
                type="button"
                className="button button-danger"
                onClick={() => void onDelete()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Keep my account
              </button>
            </div>
          ) : (
            <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>
              Delete my account
            </button>
          )}
        </section>
      )}
    </>
  );
}
