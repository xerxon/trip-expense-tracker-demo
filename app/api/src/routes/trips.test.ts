import { afterEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { hashPassword } from "../auth/password.js";
import type { SessionRow, SessionStoreLike } from "../auth/session.js";
import { EmailTakenError, type NewUser, type StoredUser, type UserStore } from "../auth/types.js";
import { buildServer } from "../server.js";
import { TRIP_NOT_FOUND_MESSAGE } from "./trips.js";
import { LOGIN_REQUIRED_MESSAGE } from "./auth.js";
import type { NewTrip, Trip, TripStore } from "../trips/types.js";

const SECRET = "test-session-secret";
const PASSWORD = "correct horse battery";
const SAM = "sam@example.com";
const ANA = "ana@example.com";
const TRIP_NAME_EMPTY = "Enter a trip name.";
const TRIP_NAME_TOO_LONG = "Trip names can be up to 50 characters.";

// Fake user store: an in-memory list that enforces the unique email key like the database does.
function fakeUserStore() {
  const users: StoredUser[] = [];
  const store: UserStore = {
    async findByEmailKey(emailKey) {
      return users.find((u) => u.emailKey === emailKey) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create(newUser: NewUser) {
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
  return { store, users };
}

// Fake session store: an in-memory map keyed by the hash, like the real table.
function fakeSessionStore(): SessionStoreLike {
  const rows = new Map<string, SessionRow>();
  return {
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

// Fake trip store. Every method is keyed by ownerId, like the real store. `calls` records each
// store method that ran, so a test can prove a rejected request never reached the store.
function fakeTripStore(seed: Trip[] = []) {
  const rows: Trip[] = [...seed];
  const calls: string[] = [];
  const creates: NewTrip[] = [];
  let nextId = 1;
  const store: TripStore = {
    async create(input) {
      calls.push("create");
      creates.push({ ...input });
      const trip: Trip = {
        id: `trip-${nextId}`,
        ownerId: input.ownerId,
        name: input.name,
        // Fixed times, so no test depends on the clock. Each new trip is one minute later.
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, nextId)),
      };
      nextId += 1;
      rows.push(trip);
      return { ...trip };
    },
    async listByOwner(ownerId) {
      calls.push("listByOwner");
      return rows.filter((t) => t.ownerId === ownerId).map((t) => ({ ...t }));
    },
    async findForOwner(ownerId, tripId) {
      calls.push("findForOwner");
      const trip = rows.find((t) => t.id === tripId && t.ownerId === ownerId);
      return trip === undefined ? null : { ...trip };
    },
    async deleteForOwner(ownerId, tripId) {
      calls.push("deleteForOwner");
      const index = rows.findIndex((t) => t.id === tripId && t.ownerId === ownerId);
      if (index === -1) return 0;
      rows.splice(index, 1);
      return 1;
    },
  };
  return { store, rows, calls, creates };
}

// Seed an account straight into the fake store, as if it were already registered.
async function seedUser(store: UserStore, email: string, password: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await store.create({
    email: normalized,
    emailKey: normalized,
    passwordHash: await hashPassword(password),
  });
}

// The "session=<value>" pair from a Set-Cookie header, as the browser sends it back.
function cookiePairFrom(res: LightMyRequestResponse): string {
  const header = res.headers["set-cookie"];
  const lines = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const line = lines.find((l) => l.startsWith("session="));
  if (line === undefined) throw new Error("No session cookie was set");
  return line.split(";")[0] as string;
}

describe("trip routes", () => {
  const apps: ReturnType<typeof buildServer>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function build(trips: TripStore) {
    const users = fakeUserStore();
    const app = buildServer({
      logger: false,
      auth: {
        users: users.store,
        sessions: fakeSessionStore(),
        cookieSecret: SECRET,
        secureCookies: false,
      },
      trips,
    });
    apps.push(app);
    return { app, users: users.store };
  }

  // Logs in as the given seeded user through the real login route and returns the cookie pair.
  async function login(app: ReturnType<typeof buildServer>, email: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return cookiePairFrom(res);
  }

  it("F2.AC1 POST /trips creates the trip and returns 201 with id, name and created_at", async () => {
    const trips = fakeTripStore();
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD);
    const cookie = await login(app, SAM);

    const res = await app.inject({
      method: "POST",
      url: "/trips",
      payload: { name: "Lisbon" },
      headers: { cookie },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: "trip-1",
      name: "Lisbon",
      created_at: "2026-01-01T00:01:00.000Z",
    });
    expect(trips.creates).toEqual([{ ownerId: "user-1", name: "Lisbon" }]);
  });

  it("F2.AC1 the new trip is listed first on GET /trips", async () => {
    const trips = fakeTripStore();
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD);
    const cookie = await login(app, SAM);

    await app.inject({ method: "POST", url: "/trips", payload: { name: "Porto" }, headers: { cookie } });
    await app.inject({ method: "POST", url: "/trips", payload: { name: "Lisbon" }, headers: { cookie } });
    const res = await app.inject({ method: "GET", url: "/trips", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json().map((t: { name: string }) => t.name)).toEqual(["Lisbon", "Porto"]);
  });

  it("F2.AC4 POST /trips ignores an ownerId in the body and owns the trip by the session user", async () => {
    const trips = fakeTripStore();
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD); // user-1
    await seedUser(users, ANA, PASSWORD); // user-2
    const cookie = await login(app, SAM);

    const res = await app.inject({
      method: "POST",
      url: "/trips",
      payload: { name: "Lisbon", ownerId: "user-2" },
      headers: { cookie },
    });

    expect(res.statusCode).toBe(201);
    expect(trips.creates).toEqual([{ ownerId: "user-1", name: "Lisbon" }]);
  });

  it("F2.AC12 create, list, open and delete return 401 with a JSON error and touch no store when logged out", async () => {
    const trips = fakeTripStore([
      { id: "trip-9", ownerId: "user-1", name: "Secret", createdAt: new Date(0) },
    ]);
    const { app } = build(trips.store);

    const responses = [
      await app.inject({ method: "POST", url: "/trips", payload: { name: "Lisbon" } }),
      await app.inject({ method: "GET", url: "/trips" }),
      await app.inject({ method: "GET", url: "/trips/trip-9" }),
      await app.inject({ method: "DELETE", url: "/trips/trip-9" }),
    ];

    for (const res of responses) {
      expect(res.statusCode).toBe(401);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.json()).toEqual({ error: LOGIN_REQUIRED_MESSAGE });
      expect(res.body).not.toContain("Secret");
    }
    expect(trips.calls).toEqual([]);
    expect(trips.rows.length).toBe(1);
  });

  it("F2.AC15 POST /trips with an invalid name returns 400 with an error body and creates nothing", async () => {
    const trips = fakeTripStore();
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD);
    const cookie = await login(app, SAM);

    const cases: Array<{ payload: Record<string, unknown>; error: string }> = [
      { payload: { name: "" }, error: TRIP_NAME_EMPTY },
      { payload: { name: "   " }, error: TRIP_NAME_EMPTY },
      { payload: {}, error: TRIP_NAME_EMPTY },
      { payload: { name: 42 }, error: TRIP_NAME_EMPTY },
      { payload: { name: "a".repeat(51) }, error: TRIP_NAME_TOO_LONG },
    ];

    for (const { payload, error } of cases) {
      const res = await app.inject({ method: "POST", url: "/trips", payload, headers: { cookie } });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error });
    }
    expect(trips.calls).toEqual([]);
  });

  it("F2.AC17 GET /trips/:id returns 200 with the view for the owner's trip", async () => {
    const trips = fakeTripStore([
      { id: "trip-1", ownerId: "user-1", name: "Lisbon", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD);
    const cookie = await login(app, SAM);

    const res = await app.inject({ method: "GET", url: "/trips/trip-1", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "trip-1", name: "Lisbon", created_at: "2026-01-01T00:00:00.000Z" });
  });

  it("F2.AC17 GET /trips/:id returns 404 for another user's trip with the same body as a missing trip", async () => {
    const trips = fakeTripStore([
      { id: "trip-1", ownerId: "user-2", name: "Ana's trip", createdAt: new Date(0) },
    ]);
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD); // user-1
    await seedUser(users, ANA, PASSWORD); // user-2
    const cookie = await login(app, SAM);

    const notOwned = await app.inject({ method: "GET", url: "/trips/trip-1", headers: { cookie } });
    const missing = await app.inject({ method: "GET", url: "/trips/trip-404", headers: { cookie } });

    expect(notOwned.statusCode).toBe(404);
    expect(notOwned.json()).toEqual({ error: TRIP_NOT_FOUND_MESSAGE });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toBe(notOwned.body);
    expect(notOwned.body).not.toContain("Ana's trip");
  });

  it("F2.AC11 DELETE /trips/:id returns 404 for another user's trip and leaves it in place", async () => {
    const trips = fakeTripStore([
      { id: "trip-1", ownerId: "user-2", name: "Ana's trip", createdAt: new Date(0) },
    ]);
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD); // user-1
    await seedUser(users, ANA, PASSWORD); // user-2
    const cookie = await login(app, SAM);

    const res = await app.inject({ method: "DELETE", url: "/trips/trip-1", headers: { cookie } });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: TRIP_NOT_FOUND_MESSAGE });
    expect(trips.rows.map((t) => t.id)).toEqual(["trip-1"]);
  });

  it("F2.AC9 DELETE /trips/:id returns 204 with no body and removes the owner's trip", async () => {
    const trips = fakeTripStore([
      { id: "trip-1", ownerId: "user-1", name: "Lisbon", createdAt: new Date(0) },
    ]);
    const { app, users } = build(trips.store);
    await seedUser(users, SAM, PASSWORD);
    const cookie = await login(app, SAM);

    const res = await app.inject({ method: "DELETE", url: "/trips/trip-1", headers: { cookie } });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(trips.rows).toEqual([]);
  });
});
