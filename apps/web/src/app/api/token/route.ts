import { auth } from '@/auth';
import { signApiToken } from '@/lib/sign-api-token';

const headers = { 'Cache-Control': 'no-store' };

/** Exchanges the sign-in session for the short-lived token the API accepts (docs/API.md). */
export async function GET() {
  const session = await auth();
  const subject = session?.user.authSubject;
  if (!subject) return Response.json({ error: 'Not signed in' }, { status: 401, headers });

  const secret = process.env.API_JWT_SECRET;
  if (!secret) return Response.json({ error: 'Sign-in is not configured' }, { status: 500, headers });

  const result = await signApiToken(
    {
      subject,
      name: session.user.name,
      email: session.user.email,
      picture: session.user.image,
    },
    secret,
  );
  return Response.json(result, { headers });
}
