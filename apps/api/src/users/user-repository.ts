import type { ApiIdentity } from '../auth/api-token.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface User {
  id: string;
  name: string | null;
  imageUrl: string | null;
  createdAt: Date;
}

export interface UserRepository {
  /** Creates the user on first sight; afterwards keeps their profile and last-seen time current. */
  upsert(identity: ApiIdentity): Promise<User>;
  /** Deletes the user and, through foreign keys, all their data. Does nothing if they are already gone. */
  deleteBySubject(authSubject: string): Promise<void>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  upsert({ authSubject, name, email, imageUrl }: ApiIdentity): Promise<User> {
    return this.prisma.user.upsert({
      where: { authSubject },
      create: { authSubject, name, email, imageUrl },
      update: { name, email, imageUrl, lastSeenAt: new Date() },
      select: { id: true, name: true, imageUrl: true, createdAt: true },
    });
  }

  async deleteBySubject(authSubject: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { authSubject } });
  }
}
