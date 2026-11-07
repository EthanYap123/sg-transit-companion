import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Sign-in problem · SG Transit Companion' };

/** Where Auth.js sends people when sign-in fails or they cancel it on GitHub. */
export default function AuthErrorPage() {
  return (
    <>
      <h1>Sign-in didn’t finish</h1>
      <p className="lede">
        You weren’t signed in. If you cancelled on GitHub, that’s fine. You can still search for stops and see
        live arrivals without an account.
      </p>
      <Link href="/settings">Try signing in again</Link>
    </>
  );
}
