import { describe, expect, it } from "vitest";
import {
  TRIP_NAME_EMPTY_ERROR,
  TRIP_NAME_TOO_LONG_ERROR,
} from "./rules.js";
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  toTripView,
} from "./service.js";
import {
  TripNotFoundError,
  TripValidationError,
  type NewTrip,
  type Trip,
  type TripLogger,
  type TripStore,
} from "./types.js";

// Build a trip for a test. Each field can be overridden.
function makeTrip(overrides: Partial<Trip> & { id: string }): Trip {
  return {
    ownerId: "user-1",
    name: "Lisbon",
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

// Fake trip store: an in-memory list. Every lookup and delete is keyed by owner, like the database query.
function createFakeStore(seed: Trip[] = []) {
  const trips: Trip[] = [...seed];
  const createCalls: NewTrip[] = [];
  let created = 0;
  const store: TripStore = {
    async create(input) {
      createCalls.push(input);
      created += 1;
      const trip = makeTrip({
        id: `trip-new-${created}`,
        ownerId: input.ownerId,
        name: input.name,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, created)),
      });
      trips.push(trip);
      return trip;
    },
    async listByOwner(ownerId) {
      return trips.filter((t) => t.ownerId === ownerId);
    },
    async findForOwner(ownerId, tripId) {
      return trips.find((t) => t.ownerId === ownerId && t.id === tripId) ?? null;
    },
    async deleteForOwner(ownerId, tripId) {
      const index = trips.findIndex((t) => t.ownerId === ownerId && t.id === tripId);
      if (index === -1) return 0;
      trips.splice(index, 1);
      return 1;
    },
  };
  return { store, trips, createCalls };
}

// Fake logger: records every call so tests can check what was logged.
function createFakeLogger() {
  const calls: { level: "info" | "warn"; obj: Record<string, unknown>; msg: string }[] = [];
  const logger: TripLogger = {
    info(obj, msg) {
      calls.push({ level: "info", obj, msg });
    },
    warn(obj, msg) {
      calls.push({ level: "warn", obj, msg });
    },
  };
  return { logger, calls };
}

describe("F2.AC1 trip creation saves the trimmed name (F2.R1, F2.R3)", () => {
  it("F2.AC1 create saves the trimmed name and returns the trip", async () => {
    const { store, createCalls } = createFakeStore();
    const { logger } = createFakeLogger();

    const trip = await createTrip(store, { ownerId: "user-1", name: "  Lisbon  " }, logger);

    expect(createCalls).toEqual([{ ownerId: "user-1", name: "Lisbon" }]);
    expect(trip.name).toBe("Lisbon");
    expect(trip.ownerId).toBe("user-1");
    expect(trip.id).toBe("trip-new-1");
  });

  it("F2.AC1 rethrows a store error and logs nothing", async () => {
    const { logger, calls } = createFakeLogger();
    const boom = new Error("database unavailable");
    const failingStore: TripStore = {
      async create() {
        throw boom;
      },
      async listByOwner() {
        return [];
      },
      async findForOwner() {
        return null;
      },
      async deleteForOwner() {
        return 0;
      },
    };

    await expect(
      createTrip(failingStore, { ownerId: "user-1", name: "Lisbon" }, logger),
    ).rejects.toBe(boom);
    expect(calls).toHaveLength(0);
  });

  it("F2.AC1 log lines carry event names and ids only, never the trip name", async () => {
    const { store, trips } = createFakeStore();
    const { logger, calls } = createFakeLogger();

    const trip = await createTrip(store, { ownerId: "user-1", name: "Lisbon" }, logger);
    await getTrip(store, "user-1", trip.id, logger);
    await deleteTrip(store, "user-1", trip.id, logger);
    await expect(getTrip(store, "user-1", "missing", logger)).rejects.toBeInstanceOf(
      TripNotFoundError,
    );

    expect(trips).toHaveLength(0);
    expect(calls.map((c) => c.obj.event)).toEqual([
      "trip.created",
      "trip.deleted",
      "trip.get.not_found",
    ]);
    for (const call of calls) {
      for (const key of Object.keys(call.obj)) {
        expect(["event", "tripId", "userId"]).toContain(key);
      }
    }
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain("Lisbon");
  });
});

describe("F2.AC2 create refuses a blank or too-long name (F2.R1)", () => {
  it("F2.AC2 refuses an empty, spaces-only or 51-character name and saves nothing", async () => {
    const { store, createCalls } = createFakeStore();
    const { logger } = createFakeLogger();

    const blank = await createTrip(store, { ownerId: "user-1", name: "   " }, logger).catch(
      (err: unknown) => err,
    );
    const tooLong = await createTrip(
      store,
      { ownerId: "user-1", name: "a".repeat(51) },
      logger,
    ).catch((err: unknown) => err);

    expect(blank).toBeInstanceOf(TripValidationError);
    expect((blank as Error).message).toBe(TRIP_NAME_EMPTY_ERROR);
    expect(tooLong).toBeInstanceOf(TripValidationError);
    expect((tooLong as Error).message).toBe(TRIP_NAME_TOO_LONG_ERROR);
    expect(createCalls).toHaveLength(0);
  });
});

describe("F2.AC3 duplicate names for one owner (F2.R1)", () => {
  it("F2.AC3 accepts a duplicate name for the same owner", async () => {
    const { store, trips } = createFakeStore([
      makeTrip({ id: "trip-1", ownerId: "user-1", name: "Italy" }),
    ]);
    const { logger } = createFakeLogger();

    await createTrip(store, { ownerId: "user-1", name: "Italy" }, logger);

    expect(trips.filter((t) => t.name === "Italy")).toHaveLength(2);
  });
});

describe("F2.AC4 owner comes from the session user (F2.R2)", () => {
  it("F2.AC4 owner comes from the session user and ignores one in the request", async () => {
    const { store, createCalls } = createFakeStore();
    const { logger } = createFakeLogger();
    // A request body that names another owner. The service reads only the name from it.
    const requestBody: { name: string; ownerId?: string } = { name: "Lisbon", ownerId: "user-2" };

    const trip = await createTrip(
      store,
      { ownerId: "user-1", name: requestBody.name },
      logger,
    );

    expect(trip.ownerId).toBe("user-1");
    expect(createCalls).toEqual([{ ownerId: "user-1", name: "Lisbon" }]);
  });
});

describe("F2.AC6 trip list ordering and row view (F2.R4, F2.R10)", () => {
  it("F2.AC6 list ordering puts newest first and leaves out other owners' trips", async () => {
    const { store } = createFakeStore([
      makeTrip({ id: "t1", createdAt: new Date("2026-01-01T10:00:00.000Z") }),
      makeTrip({ id: "t3", createdAt: new Date("2026-03-01T10:00:00.000Z") }),
      makeTrip({ id: "t2", createdAt: new Date("2026-02-01T10:00:00.000Z") }),
      makeTrip({ id: "other", ownerId: "user-2", createdAt: new Date("2026-04-01T10:00:00.000Z") }),
    ]);

    const trips = await listTrips(store, "user-1");

    expect(trips.map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
  });

  it("F2.AC6 trip view has only id, name and an ISO UTC created_at", () => {
    const trip = makeTrip({
      id: "t1",
      name: "Lisbon",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    });

    const view = toTripView(trip);

    expect(view).toEqual({
      id: "t1",
      name: "Lisbon",
      created_at: "2026-03-01T10:00:00.000Z",
    });
    expect(Object.keys(view).sort()).toEqual(["created_at", "id", "name"]);
  });
});

describe("F2.AC17 getTrip not-found for a trip the owner does not have (F2.R9, F2.R12)", () => {
  it("F2.AC17 getTrip throws not-found for a trip the owner does not have", async () => {
    const { store } = createFakeStore([
      makeTrip({ id: "trip-9", ownerId: "user-2", name: "Rome" }),
    ]);
    const { logger } = createFakeLogger();

    const notOwned = await getTrip(store, "user-1", "trip-9", logger).catch(
      (err: unknown) => err,
    );
    const missing = await getTrip(store, "user-1", "no-such-trip", logger).catch(
      (err: unknown) => err,
    );

    expect(notOwned).toBeInstanceOf(TripNotFoundError);
    expect((notOwned as Error).message).toBe("Trip not found.");
    expect(missing).toBeInstanceOf(TripNotFoundError);
    expect((missing as Error).message).toBe("Trip not found.");
  });

  it("F2.AC17 getTrip returns the trip the owner has", async () => {
    const { store } = createFakeStore([makeTrip({ id: "trip-1", ownerId: "user-1", name: "Rome" })]);
    const { logger } = createFakeLogger();

    const trip = await getTrip(store, "user-1", "trip-1", logger);

    expect(trip.name).toBe("Rome");
  });
});

describe("F2.AC11 deleteTrip not-found for a trip the owner does not have (F2.R9)", () => {
  it("F2.AC11 deleteTrip throws not-found and deletes nothing for another owner's trip", async () => {
    const { store, trips } = createFakeStore([
      makeTrip({ id: "trip-9", ownerId: "user-2", name: "Rome" }),
    ]);
    const { logger } = createFakeLogger();

    await expect(deleteTrip(store, "user-1", "trip-9", logger)).rejects.toBeInstanceOf(
      TripNotFoundError,
    );
    expect(trips).toHaveLength(1);
  });

  it("F2.AC11 deleteTrip removes the owner's own trip", async () => {
    const { store, trips } = createFakeStore([
      makeTrip({ id: "trip-1", ownerId: "user-1", name: "Rome" }),
    ]);
    const { logger } = createFakeLogger();

    await deleteTrip(store, "user-1", "trip-1", logger);

    expect(trips).toHaveLength(0);
  });
});
