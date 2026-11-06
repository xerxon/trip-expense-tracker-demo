import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  endSession,
  findSessionUser,
  sessionCookieOptions,
  startSession,
  type SessionRow,
  type SessionStoreLike,
} from "./session.js";

// A fake session store: an in-memory map keyed by the hash, like the real table.
function fakeSessionStore(): SessionStoreLike & { rows: Map<string, SessionRow> } {
  const rows = new Map<string, SessionRow>();
  return {
    rows,
    async insert(session) {
      rows.set(session.id, { ...session });
    },
    async findByHash(hash) {
      const row = rows.get(hash);
      return row === undefined ? null : { ...row };
    },
    async deleteByHash(hash) {
      rows.delete(hash);
    },
  };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("F1.AC7 ending a session (F1.R6)", () => {
  it("F1.AC7 ending a session removes it from the store", async () => {
    const store = fakeSessionStore();
    const token = await startSession(store, "user-1");
    expect(await findSessionUser(store, token)).toBe("user-1");
    expect(store.rows.size).toBe(1);

    await endSession(store, token);

    expect(store.rows.size).toBe(0);
    expect(await findSessionUser(store, token)).toBeNull();
  });

  it("F1.AC7 ending one session leaves other sessions alive", async () => {
    const store = fakeSessionStore();
    const first = await startSession(store, "user-1");
    const second = await startSession(store, "user-1");

    await endSession(store, first);

    expect(await findSessionUser(store, first)).toBeNull();
    expect(await findSessionUser(store, second)).toBe("user-1");
  });

  it("F1.AC7 ending a session twice does not throw", async () => {
    const store = fakeSessionStore();
    const token = await startSession(store, "user-1");

    await endSession(store, token);
    await expect(endSession(store, token)).resolves.toBeUndefined();
  });

  it("F1.AC7 an unknown token has no live session", async () => {
    const store = fakeSessionStore();
    expect(await findSessionUser(store, "never-issued-token")).toBeNull();
  });

  it("F1.AC7 stores only the SHA-256 hash of the token, never the token (F1.R7)", async () => {
    const store = fakeSessionStore();
    const token = await startSession(store, "user-1");

    expect(token.length).toBeGreaterThanOrEqual(43); // 32 random bytes in base64url
    expect(store.rows.has(token)).toBe(false);
    expect(store.rows.has(sha256(token))).toBe(true);
    expect([...store.rows.values()][0]).toEqual({ id: sha256(token), userId: "user-1" });
  });

  it("F1.AC7 each session gets a different random token", async () => {
    const store = fakeSessionStore();
    const a = await startSession(store, "user-1");
    const b = await startSession(store, "user-1");
    expect(a).not.toBe(b);
  });
});

describe("F1.AC12 session cookie lifetime (F1.R7)", () => {
  it("F1.AC12 session cookie options have no expiry or max-age", () => {
    const options = sessionCookieOptions({ secure: true });

    expect(options).not.toHaveProperty("expires");
    expect(options).not.toHaveProperty("maxAge");
  });

  it("F1.AC12 session cookie options are httpOnly, lax, path /, and signed", () => {
    expect(sessionCookieOptions({ secure: false })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      signed: true,
    });
  });

  it("F1.AC12 secure comes from the parameter, not the environment", () => {
    expect(sessionCookieOptions({ secure: true }).secure).toBe(true);
    expect(sessionCookieOptions({ secure: false }).secure).toBe(false);
  });
});
