import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

/** Sign-in (docs/adr/0005-sign-in-with-google.md). Sessions are encrypted cookies, no database. */
export const { handlers, auth } = NextAuth({
  providers: [
    // Name and picture only: leaving out the email scope means the app never holds an address (PRD US-07).
    Google({ authorization: { params: { scope: 'openid profile' } } }),
  ],
  session: { strategy: 'jwt' },
  pages: { error: '/auth-error' },
  callbacks: {
    jwt({ token, profile }) {
      // `profile` is only present at sign-in. Google's `sub` is the account's permanent id.
      if (profile?.sub) token.authSubject = `google:${profile.sub}`;
      return token;
    },
    session({ session, token }) {
      if (typeof token.authSubject === 'string') session.user.authSubject = token.authSubject;
      return session;
    },
  },
});
