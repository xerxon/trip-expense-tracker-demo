import { describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { requireLogin } from "./guard.js";
import { sessionCookieOptions, startSession, type SessionRow, type SessionStoreLike } from "./session.js";
import { SESSION_COOKIE } from "../routes/auth.js";

const SECRET = "test-session-secret";

// Fake session store: an in-memory map keyed by the hash, like the real table.
function fakeSessionStore() {
  const rows = new Map<string, SessionRow>();
  const findByHash = vi.fn(async (hash: string) => {
    const row = rows.get(hash);
    return row === undefined ? null : { ...row };
  });
  const store: SessionStoreLike = {
    async insert(session) {
      rows.set(session.id, { ...session });
    },
    findByHash,
    async deleteByHash(hash) {
      rows.delete(hash);
    },
  };
  return { store, findByHash };
}

// Builds a small app with one dummy protected trip route and a test-only login route
// that sets a real signed session cookie. The handler is a spy so a test can see whether it ran.
function buildGuardedApp(sessions: SessionStoreLike) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.register(cookie, { secret: SECRET });

  app.post("/test/login/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const token = await startSession(sessions, userId);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions({ secure: false }));
    return reply.status(204).send();
  });

  const handler = vi.fn(async (request: { userId?: string }) => ({ trips: [], userId: request.userId }));
  app.get("/trips", { preHandler: requireLogin(sessions) }, async (request) => handler(request));

  return { app, handler };
}

describe("requireLogin", () => {
  it("F1.AC10 guard rejects a trip request with no session before any lookup", async () => {
    const { store, findByHash } = fakeSessionStore();
    const { app, handler } = buildGuardedApp(store);

    const res = await app.inject({ method: "GET", url: "/trips" });

    expect(handler).not.toHaveBeenCalled();
    expect(findByHash).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("F1.AC17 API request with no session gets 401 JSON", async () => {
    const { store } = fakeSessionStore();
    const { app, handler } = buildGuardedApp(store);

    const res = await app.inject({ method: "GET", url: "/trips", headers: { accept: "application/json" } });

    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.json()).toEqual({ error: "Log in required" });
    expect(handler).not.toHaveBeenCalled();
    await app.close();
  });

  it("F1.AC10 a request with an invalid cookie signature is rejected before the session store is queried", async () => {
    const { store, findByHash } = fakeSessionStore();
    const { app, handler } = buildGuardedApp(store);

    const res = await app.inject({
      method: "GET",
      url: "/trips",
      headers: { cookie: `${SESSION_COOKIE}=forged-token-value` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Log in required" });
    expect(findByHash).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    await app.close();
  });

  it("F1.AC10 a live session reaches the handler with request.userId set", async () => {
    const { store } = fakeSessionStore();
    const { app, handler } = buildGuardedApp(store);

    const login = await app.inject({ method: "POST", url: "/test/login/user-42" });
    const setCookie = login.headers["set-cookie"];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toBeDefined();
    const cookiePair = (header as string).split(";")[0];

    const res = await app.inject({ method: "GET", url: "/trips", headers: { cookie: cookiePair } });

    expect(res.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.json()).toEqual({ trips: [], userId: "user-42" });
    await app.close();
  });
});
