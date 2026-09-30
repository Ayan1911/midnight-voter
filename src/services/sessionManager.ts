/**
 * sessionManager.ts - Manages DApp session state with automatic expiry.
 *
 * Prevents stale session data from interfering with a fresh wallet connection
 * by attaching a TTL to each session entry. Centralises all session-related
 * localStorage keys to avoid key-name collisions.
 */

export interface SessionData {
  walletAddress: string;
  walletId: string;
  network: string;
  contractAddress?: string;
  connectedAt: number;  // ms epoch
  expiresAt: number;    // ms epoch
}

const SESSION_KEY = 'zk_auction_session_v1';
/** Default session TTL: 8 hours */
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

export class SessionManager {
  private ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Persist a new session.
   */
  save(data: Omit<SessionData, 'connectedAt' | 'expiresAt'>): SessionData {
    const now = Date.now();
    const session: SessionData = {
      ...data,
      connectedAt: now,
      expiresAt: now + this.ttlMs,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  /**
   * Load the current session if it exists and hasn't expired.
   * Returns null if absent or expired (and removes the stale entry).
   */
  load(): SessionData | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as SessionData;
      if (Date.now() > session.expiresAt) {
        this.clear();
        return null;
      }
      return session;
    } catch {
      this.clear();
      return null;
    }
  }

  /**
   * Update specific fields in the current session (e.g., contractAddress after deploy).
   */
  patch(updates: Partial<Omit<SessionData, 'connectedAt' | 'expiresAt'>>): void {
    const session = this.load();
    if (!session) return;
    const updated: SessionData = { ...session, ...updates };
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  }

  /**
   * Extend the session TTL from now (call on user activity).
   */
  extend(): void {
    const session = this.load();
    if (!session) return;
    session.expiresAt = Date.now() + this.ttlMs;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  /**
   * Remove the session from storage.
   */
  clear(): void {
    localStorage.removeItem(SESSION_KEY);
  }

  /**
   * Returns true if a valid (non-expired) session exists.
   */
  isActive(): boolean {
    return this.load() !== null;
  }

  /**
   * Returns remaining session lifetime in milliseconds. 0 if expired or absent.
   */
  remainingMs(): number {
    const session = this.load();
    if (!session) return 0;
    return Math.max(0, session.expiresAt - Date.now());
  }
}

export const sessionManager = new SessionManager();
