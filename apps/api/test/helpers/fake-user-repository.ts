import type { ApiIdentity } from '../../src/auth/api-token.js';
import type { User, UserRepository } from '../../src/users/user-repository.js';

/** In-memory UserRepository for unit tests. */
export class FakeUserRepository implements UserRepository {
  users = new Map<string, User & { email: string | null }>();

  upsert({ authSubject, name, email, imageUrl }: ApiIdentity): Promise<User> {
    const existing = this.users.get(authSubject);
    const user = {
      id: existing?.id ?? `user-${this.users.size + 1}`,
      createdAt: existing?.createdAt ?? new Date('2026-11-07T00:00:00Z'),
      name,
      email,
      imageUrl,
    };
    this.users.set(authSubject, user);
    return Promise.resolve({
      id: user.id,
      name: user.name,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
    });
  }

  deleteBySubject(authSubject: string): Promise<void> {
    this.users.delete(authSubject);
    return Promise.resolve();
  }
}
