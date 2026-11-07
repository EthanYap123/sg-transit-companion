import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

/** Sign-in (docs/adr/0004-github-sign-in-with-authjs.md). Sessions are encrypted cookies, no database. */
export const { handlers, auth } = NextAuth({
  providers: [
    // Profile only. Without user:email, GitHub does not share private email addresses (PRD US-07).
    GitHub({ authorization: { params: { scope: 'read:user' } } }),
  ],
  session: { strategy: 'jwt' },
  pages: { error: '/auth-error' },
  callbacks: {
    jwt({ token, profile }) {
      // `profile` is only present at sign-in. GitHub's numeric id never changes; a username can.
      if (profile?.id) token.authSubject = `github:${String(profile.id)}`;
      return token;
    },
    session({ session, token }) {
      if (typeof token.authSubject === 'string') session.user.authSubject = token.authSubject;
      return session;
    },
  },
});
