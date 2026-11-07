'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

/** Reads the session in the browser, so pages stay static and signed-out visits use no server time. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
