import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy · SG Transit Companion',
  description: 'What SG Transit Companion stores about you, and how to delete it.',
};

const ISSUES_URL = 'https://github.com/EthanYap123/sg-transit-companion/issues';

/** Plain-language privacy policy, linked from the footer, Settings and Google's consent screen. */
export default function PrivacyPage() {
  return (
    <article className="prose">
      <h1>Privacy</h1>
      <p className="lede">
        SG Transit Companion is a personal, non-commercial project. You can search for stops and see live
        arrivals without an account, and the app keeps nothing about you when you do.
      </p>

      <h2>If you sign in</h2>
      <p>
        Signing in uses your Google account. The app asks Google for your name and profile picture only. It
        never asks for your email address. It stores:
      </p>
      <ul>
        <li>Google’s permanent ID for your account, so it can recognise you next time</li>
        <li>your name and the address of your profile picture, as Google shares them</li>
        <li>the stops you save, the names you give them and their order</li>
        <li>when you created your account and when you last used it</li>
      </ul>

      <h2>Your location</h2>
      <p>
        “Stops near you” asks your browser for your location only after you tap “Use my location”. The
        position is sent once to find nearby stops, rounded to about a metre, and is never stored, logged or
        shared. You can block location access at any time in your browser’s settings.
      </p>

      <h2>Cookies and storage on your device</h2>
      <ul>
        <li>a sign-in cookie, only while you are signed in</li>
        <li>your light or dark theme choice, saved in your browser</li>
      </ul>
      <p>There are no ads, analytics or tracking cookies.</p>

      <h2>Where it is kept</h2>
      <p>
        Your account and saved stops are stored in a database in Singapore and used only to run this app. They
        are never sold or shared. The app is hosted by Vercel (web pages) and Render (server). Bus data comes
        from LTA DataMall.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Go to <Link href="/settings">Settings</Link> and choose “Delete my account”. Your account and saved
        stops are removed straight away. You can also remove the app’s access in your Google account’s
        security settings.
      </p>

      <h2>Questions</h2>
      <p>
        Open an issue on <a href={ISSUES_URL}>the project’s GitHub page</a>.
      </p>

      <p className="muted">Last updated 15 November 2026.</p>
    </article>
  );
}
