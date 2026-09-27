import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './atlas-errors.js';
import type { AccessSnapshot } from '../shared/access-model.js';

export interface AtlasSession {
  auth: string;
  info: any;
  csrf: string;
  issued: number;
  touched: number;
  activity: any[];
  capture?: Promise<AccessSnapshot>;
  lastCapture?: number;
}

/** The vault owns authentication lifetimes; routes never manufacture identities. */
export class AtlasSessionVault {
  private accounts = new Map<string, AtlasSession>();
  private signIns = new Map<string, { deadline: number; remaining: number }>();
  constructor(private clock: () => number) {}
  budget(address: string) {
    const now = this.clock();
    for (const [key, window] of this.signIns) if (window.deadline < now) this.signIns.delete(key);
    const window = this.signIns.get(address) ?? { deadline: now + 60000, remaining: 10 };
    this.signIns.set(address, window);
    if (window.remaining <= 0)
      throw new ApiError(429, 'Wait one minute before another sign-in attempt.');
    window.remaining--;
  }
  private expired(session: AtlasSession) {
    return this.clock() - session.touched > 1800000 || this.clock() - session.issued > 28800000;
  }
  replacementGuard(id?: string) {
    const previous = id ? this.accounts.get(id) : undefined;
    if (!previous || this.expired(previous)) return () => {};
    return () => {
      if (this.accounts.get(id!) !== previous || this.expired(previous))
        throw new ApiError(409, 'The session changed during sign-in. Sign in again.');
    };
  }
  create(auth: string, info: any, replaces?: string) {
    for (const [id, session] of this.accounts) if (this.expired(session)) this.accounts.delete(id);
    if (replaces) this.accounts.delete(replaces);
    if (this.accounts.size >= 100)
      throw new ApiError(503, 'Atlas session capacity has been reached.');
    const id = randomBytes(32).toString('hex');
    const session: AtlasSession = {
      auth,
      info,
      issued: this.clock(),
      touched: this.clock(),
      csrf: randomBytes(32).toString('hex'),
      activity: [],
    };
    this.accounts.set(id, session);
    return { id, session };
  }
  access(id: string, csrf?: string) {
    const session = this.accounts.get(id);
    if (!session || this.expired(session)) {
      this.accounts.delete(id);
      throw new ApiError(401, 'Your Atlas session has ended. Sign in again.');
    }
    if (csrf !== undefined) {
      const received = Buffer.from(csrf),
        expected = Buffer.from(session.csrf);
      if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected))
        throw new ApiError(403, 'The request token is invalid. Refresh this workspace.');
    }
    session.touched = this.clock();
    return session;
  }
  forget(id: string) {
    this.accounts.delete(id);
  }
}
