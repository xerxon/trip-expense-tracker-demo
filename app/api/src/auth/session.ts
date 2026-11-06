// Session tokens and cookie options for F1 (F1.R6, F1.R7).
// No database import: the session table sits behind SessionStore, which the app supplies.
import { createHash, randomBytes } from "node:crypto";

// The shape matches the session store in prisma-stores.ts. Defined here so this module
// does not import the database layer.
export interface SessionRow {
  id: string;
  userId: string;
}

export interface SessionStoreLike {
  insert(session: SessionRow): Promise<void>;
  findByHash(hash: string): Promise<SessionRow | null>;
  deleteByHash(hash: string): Promise<void>;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  signed: true;
}

// F1.R7: only the SHA-256 hash of the token is stored, so a leaked table cannot be used as a session.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Starts a session for the user and returns the raw token, which goes only into the cookie.
export async function startSession(store: SessionStoreLike, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await store.insert({ id: hashToken(token), userId });
  return token;
}

// Returns the user id for a live session, or null when the token has no session row.
export async function findSessionUser(store: SessionStoreLike, token: string): Promise<string | null> {
  const row = await store.findByHash(hashToken(token));
  return row === null ? null : row.userId;
}

// F1.AC7: ending a session deletes its row, so the token stops working at once.
export async function endSession(store: SessionStoreLike, token: string): Promise<void> {
  await store.deleteByHash(hashToken(token));
}

// F1.R6 and F1.R7: a session cookie. There is no expires or maxAge key, so the browser
// drops it when it closes. secure is passed in so the caller decides from the environment.
export function sessionCookieOptions({ secure }: { secure: boolean }): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    signed: true,
  };
}
