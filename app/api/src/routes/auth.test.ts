import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { hashPassword } from "../auth/password.js";
import { EMAIL_TAKEN_MESSAGE } from "../auth/service.js";
import { PASSWORD_ERROR } from "../auth/rules.js";
import type { SessionRow, SessionStoreLike } from "../auth/session.js";
import { EmailTakenError, type NewUser, type StoredUser, type UserStore } from "../auth/types.js";
import { buildServer, UNEXPECTED_ERROR_MESSAGE } from "../server.js";
import { LOGIN_EMPTY_MESSAGE, LOGIN_FAILED_MESSAGE, LOGIN_REQUIRED_MESSAGE } from "./auth.js";

const SECRET = "test-session-secret";
const PASSWORD = "correct horse battery";
const EMAIL = "sam@example.com";

// Fake user store: an in-memory list that enforces the unique email key like the database does.
function fakeUserStore() {
  const users: StoredUser[] = [];
  const creates: NewUser[] = [];
  const store: UserStore = {
    async findByEmailKey(emailKey) {
      return users.find((u) => u.emailKey === emailKey) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create(newUser) {
      creates.push(newUser);
      if (users.some((u) => u.emailKey === newUser.emailKey)) {
        throw new EmailTakenError();
      }
      const row: StoredUser = {
        id: `user-${users.length + 1}`,
        email: newUser.email,
        emailKey: newUser.emailKey,
        passwordHash: newUser.passwordHash,
      };
      users.push(row);
      return row;
    },
  };
  return { store, users, creates };
}

// Fake session store: an in-memory map keyed by the hash, like the real table.
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

// Log capture: Fastify writes each log line to this stream, so a test can read every line.
function captureLogs() {
  const lines: string[] = [];
  const stream = {
    write(line: string) {
      lines.push(line);
    },
  };
  return { lines, logger: { level: "info", stream } as const };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Seed an account straight into the fake store, as if it were already registered.
async function seedUser(store: UserStore, email: string, password: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await store.create({
    email: normalized,
    emailKey: normalized,
    passwordHash: await hashPassword(password),
  });
}

// Returns the "session=<value>" pair from the Set-Cookie header, or undefined.
function sessionCookieHeader(res: LightMyRequestResponse): string | undefined {
  const header = res.headers["set-cookie"];
  const lines = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return lines.find((line) => line.startsWith("session="));
}

// The cookie pair the browser would send back: "session=<value>".
function cookiePair(res: LightMyRequestResponse): string {
  const line = sessionCookieHeader(res);
  if (line === undefined) throw new Error("No session cookie was set");
  return line.split(";")[0] as string;
}

// The raw token is the part of the signed cookie value before the final ".".
function tokenFromPair(pair: string): string {
  const value = decodeURIComponent(pair.slice("session=".length));
  return value.slice(0, value.lastIndexOf("."));
}

describe("auth routes", () => {
  const apps: ReturnType<typeof buildServer>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function build(options: {
    users?: UserStore;
    sessions?: SessionStoreLike;
    logger?: false | { level: string; stream: { write(line: string): void } };
    secureCookies?: boolean;
  } = {}) {
    const app = buildServer({
      logger: options.logger ?? false,
      auth: {
        users: options.users,
        sessions: options.sessions,
        cookieSecret: SECRET,
        secureCookies: options.secureCookies ?? false,
      },
    });
    apps.push(app);
    return app;
  }

  function post(
    app: ReturnType<typeof buildServer>,
    url: string,
    payload?: Record<string, unknown>,
    cookie?: string,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: "POST",
      url,
      payload,
      headers: cookie === undefined ? undefined : { cookie },
    });
  }

  it("F1.AC1 register returns 201 with the user and sets the session cookie", async () => {
    const users = fakeUserStore();
    const sessions = fakeSessionStore();
    const app = build({ users: users.store, sessions });

    const res = await post(app, "/auth/register", { email: EMAIL, password: PASSWORD });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: "user-1", email: EMAIL });
    expect(sessionCookieHeader(res)).toBeDefined();
    expect(sessions.rows.size).toBe(1);
  });

  it("F1.AC2 register with a short password returns 400 with the message and creates nothing", async () => {
    const users = fakeUserStore();
    const sessions = fakeSessionStore();
    const app = build({ users: users.store, sessions });

    const res = await post(app, "/auth/register", { email: EMAIL, password: "short" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: PASSWORD_ERROR });
    expect(users.creates.length).toBe(0);
    expect(sessionCookieHeader(res)).toBeUndefined();
  });

  it("F1.AC3 a duplicate email returns the same neutral 400 as other failures", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions: fakeSessionStore() });

    const res = await post(app, "/auth/register", { email: "SAM@example.com", password: PASSWORD });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: EMAIL_TAKEN_MESSAGE });
    expect(sessionCookieHeader(res)).toBeUndefined();
  });

  function get(
    app: ReturnType<typeof buildServer>,
    url: string,
    cookie?: string,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: "GET",
      url,
      headers: cookie === undefined ? undefined : { cookie },
    });
  }

  it("F1.AC5 login sets the session cookie and returns the user", async () => {
    const users = fakeUserStore();
    const sessions = fakeSessionStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions });

    const res = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "user-1", email: EMAIL });

    const line = sessionCookieHeader(res) ?? "";
    expect(line).toMatch(/^session=/);
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//);
    expect(line).not.toMatch(/Expires=|Max-Age=/i);

    // Only the hash of the token is stored (F1.R7).
    const token = tokenFromPair(cookiePair(res));
    expect([...sessions.rows.keys()]).toEqual([sha256(token)]);
  });

  it("F1.AC5 login sets the Secure attribute when secure cookies are on", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions: fakeSessionStore(), secureCookies: true });

    const res = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });

    expect(sessionCookieHeader(res)).toMatch(/Secure/);
  });

  it("F1.AC5 login with an empty field returns 400 and creates no session", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const sessions = fakeSessionStore();
    const app = build({ users: users.store, sessions });

    const noPassword = await post(app, "/auth/login", { email: EMAIL, password: "" });
    const noEmail = await post(app, "/auth/login", { email: "   ", password: PASSWORD });

    for (const res of [noPassword, noEmail]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: LOGIN_EMPTY_MESSAGE });
    }
    expect(sessions.rows.size).toBe(0);
  });

  it("F1.AC6 unknown email and wrong password return the same 401 body", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const sessions = fakeSessionStore();
    const app = build({ users: users.store, sessions });

    const wrongPassword = await post(app, "/auth/login", { email: EMAIL, password: "wrong password here" });
    const unknownEmail = await post(app, "/auth/login", { email: "nobody@example.com", password: PASSWORD });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({ error: LOGIN_FAILED_MESSAGE });
    expect(unknownEmail.body).toBe(wrongPassword.body);
    expect(sessionCookieHeader(wrongPassword)).toBeUndefined();
    expect(sessions.rows.size).toBe(0);
  });

  it("F1.AC7 logout returns 204, clears the cookie and ends the session", async () => {
    const users = fakeUserStore();
    const sessions = fakeSessionStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions });

    const login = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    const pair = cookiePair(login);
    expect(sessions.rows.size).toBe(1);

    const res = await post(app, "/auth/logout", undefined, pair);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    const cleared = sessionCookieHeader(res) ?? "";
    expect(cleared).toMatch(/^session=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(sessions.rows.size).toBe(0);
  });

  it("F1.AC7 logout with no cookie still returns 204 and clears the cookie", async () => {
    const app = build({ users: fakeUserStore().store, sessions: fakeSessionStore() });

    const res = await post(app, "/auth/logout");

    expect(res.statusCode).toBe(204);
    expect(sessionCookieHeader(res)).toMatch(/^session=;/);
  });

  it("F1.AC7 logout with a tampered cookie does not end another session", async () => {
    const users = fakeUserStore();
    const sessions = fakeSessionStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions });

    const login = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    const pair = cookiePair(login);
    const tampered = `${pair}x`;

    const res = await post(app, "/auth/logout", undefined, tampered);

    expect(res.statusCode).toBe(204);
    expect(sessions.rows.size).toBe(1);
  });

  it("F1.AC7 logout returns 204 and the next /auth/me is 401", async () => {
    const users = fakeUserStore();
    const sessions = fakeSessionStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions });

    const login = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    const pair = cookiePair(login);
    const before = await get(app, "/auth/me", pair);
    expect(before.statusCode).toBe(200);

    const logout = await post(app, "/auth/logout", undefined, pair);
    expect(logout.statusCode).toBe(204);

    // Send the old cookie value again: its session row is gone, so it must not work.
    const after = await get(app, "/auth/me", pair);
    expect(after.statusCode).toBe(401);
    expect(after.json()).toEqual({ error: LOGIN_REQUIRED_MESSAGE });
  });

  it("F1.AC5 /auth/me returns the user for a live session without the password hash", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions: fakeSessionStore() });

    const login = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    const res = await get(app, "/auth/me", cookiePair(login));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "user-1", email: EMAIL });
    const hash = users.users[0]?.passwordHash ?? "";
    expect(hash).not.toBe("");
    expect(res.body).not.toContain(hash);
  });

  it("F1.AC7 /auth/me with no cookie returns 401 Log in required", async () => {
    const app = build({ users: fakeUserStore().store, sessions: fakeSessionStore() });

    const res = await get(app, "/auth/me");

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: LOGIN_REQUIRED_MESSAGE });
  });

  it("F1.AC7 /auth/me with a tampered cookie returns 401 Log in required", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions: fakeSessionStore() });

    const login = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    const res = await get(app, "/auth/me", `${cookiePair(login)}x`);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: LOGIN_REQUIRED_MESSAGE });
  });

  it("F1.AC7 /auth/me returns 401 when the session's user no longer exists", async () => {
    const users = fakeUserStore();
    await seedUser(users.store, EMAIL, PASSWORD);
    const app = build({ users: users.store, sessions: fakeSessionStore() });

    const login = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    users.users.length = 0;
    const res = await get(app, "/auth/me", cookiePair(login));

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: LOGIN_REQUIRED_MESSAGE });
  });

  it("F1.AC14 no register or login response body contains the password or the hash", async () => {
    const users = fakeUserStore();
    const app = build({ users: users.store, sessions: fakeSessionStore() });

    const registered = await post(app, "/auth/register", { email: EMAIL, password: PASSWORD });
    const hash = users.users[0]?.passwordHash ?? "";
    const loggedIn = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    const failed = await post(app, "/auth/login", { email: EMAIL, password: "wrong password here" });

    expect(hash).not.toBe("");
    for (const res of [registered, loggedIn, failed]) {
      expect(res.body).not.toContain(PASSWORD);
      expect(res.body).not.toContain(hash);
    }
  });

  it("F1.AC14 no log line on register or login contains the password, the hash, the email or the token", async () => {
    const users = fakeUserStore();
    const logs = captureLogs();
    const app = build({ users: users.store, sessions: fakeSessionStore(), logger: logs.logger });

    const registered = await post(app, "/auth/register", { email: EMAIL, password: PASSWORD });
    const loggedIn = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });
    await post(app, "/auth/login", { email: EMAIL, password: "wrong password here" });
    await post(app, "/auth/login", { email: "nobody@example.com", password: PASSWORD });

    const hash = users.users[0]?.passwordHash ?? "";
    const token = tokenFromPair(cookiePair(loggedIn));
    const registeredToken = tokenFromPair(cookiePair(registered));
    const output = logs.lines.join("\n");

    // The capture must have recorded the service events, or this test proves nothing.
    expect(output).toContain("auth.register.created");
    expect(output).toContain("auth.login.succeeded");
    expect(output).toContain("auth.login.failed");

    for (const secret of [PASSWORD, "wrong password here", hash, EMAIL, token, registeredToken]) {
      expect(output).not.toContain(secret);
    }
  });

  it("F1.AC14 an unexpected error returns the generic 500 without the password", async () => {
    const failing: UserStore = {
      async findByEmailKey() {
        throw new Error(`database went wrong for ${PASSWORD}`);
      },
      async findById() {
        return null;
      },
      async create() {
        throw new Error("not used");
      },
    };
    const app = build({ users: failing, sessions: fakeSessionStore() });

    const res = await post(app, "/auth/login", { email: EMAIL, password: PASSWORD });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: UNEXPECTED_ERROR_MESSAGE });
    expect(res.body).not.toContain(PASSWORD);
  });
});
