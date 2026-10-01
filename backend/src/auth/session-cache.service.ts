import { Injectable } from '@nestjs/common';
import type { AuthUser } from './jwt.strategy';

const TTL_MS = 60_000;

/**
 * Remembers recently checked accounts so each API request doesn't re-read
 * the user row. Disabling a user clears their entry immediately.
 */
@Injectable()
export class SessionCache {
  private readonly users = new Map<number, { user: AuthUser | null; at: number }>();

  get(id: number): AuthUser | null | undefined {
    const hit = this.users.get(id);
    if (!hit || Date.now() - hit.at > TTL_MS) return undefined;
    return hit.user;
  }

  set(id: number, user: AuthUser | null) {
    this.users.set(id, { user, at: Date.now() });
  }

  invalidate(id: number) {
    this.users.delete(id);
  }
}
