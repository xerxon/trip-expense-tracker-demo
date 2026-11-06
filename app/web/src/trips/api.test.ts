import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, SERVER_ERROR_MESSAGE } from "../auth/api";
import {
  SessionEndedError,
  TRIP_NOT_FOUND_MESSAGE,
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
} from "./api";

const TRIP = { id: "t1", name: "Lisbon", created_at: "2026-03-01T10:00:00.000Z" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A fake fetch that answers every call with the given response and records the calls.
function stubFetch(response: Response) {
  const fake = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response.clone());
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("F2.AC12 a 401 becomes the session-ended error", () => {
  it("F2.AC12 listTrips raises SessionEndedError on 401", async () => {
    stubFetch(jsonResponse(401, { error: "Log in required" }));
    await expect(listTrips()).rejects.toBeInstanceOf(SessionEndedError);
  });

  it("F2.AC12 getTrip raises SessionEndedError on 401, not the 404 text", async () => {
    stubFetch(jsonResponse(401, { error: "Log in required" }));
    const err = await getTrip("t1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionEndedError);
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it("F2.AC12 createTrip raises SessionEndedError on 401", async () => {
    stubFetch(jsonResponse(401, { error: "Log in required" }));
    await expect(createTrip("Lisbon")).rejects.toBeInstanceOf(SessionEndedError);
  });

  it("F2.AC12 deleteTrip raises SessionEndedError on 401", async () => {
    stubFetch(jsonResponse(401, { error: "Log in required" }));
    await expect(deleteTrip("t1")).rejects.toBeInstanceOf(SessionEndedError);
  });

  it("F2.AC12 a 401 with no body still raises SessionEndedError", async () => {
    stubFetch(new Response(null, { status: 401 }));
    await expect(listTrips()).rejects.toBeInstanceOf(SessionEndedError);
  });
});

describe("error mapping for non-2xx answers", () => {
  it("F2.R9 a 400 from createTrip carries the server's error text", async () => {
    stubFetch(jsonResponse(400, { error: "Enter a trip name." }));
    const err = await createTrip("   ").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe("Enter a trip name.");
  });

  it("F2.R9 a 500 with no error text gets the generic message", async () => {
    stubFetch(jsonResponse(500, {}));
    await expect(listTrips()).rejects.toThrow(SERVER_ERROR_MESSAGE);
  });

  it("F2.R9 a 500 with a non-JSON body gets the generic message", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 500 }));
    await expect(deleteTrip("t1")).rejects.toThrow(SERVER_ERROR_MESSAGE);
  });

  it("F2.R9 a 500 with an empty error string gets the generic message", async () => {
    stubFetch(jsonResponse(500, { error: "" }));
    await expect(createTrip("Lisbon")).rejects.toThrow(SERVER_ERROR_MESSAGE);
  });
});

describe("F2.R12 getTrip 404 text", () => {
  it('F2.R12 a 404 from getTrip carries "Trip not found."', async () => {
    stubFetch(jsonResponse(404, { error: "Trip not found." }));
    const err = await getTrip("missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe(TRIP_NOT_FOUND_MESSAGE);
  });

  it('F2.R12 a 404 from getTrip with no body still carries "Trip not found."', async () => {
    stubFetch(new Response(null, { status: 404 }));
    await expect(getTrip("missing")).rejects.toThrow("Trip not found.");
  });
});

describe("request shape", () => {
  it("F2.R9 calls use relative /api/trips paths with same-origin cookies", async () => {
    const fake = stubFetch(jsonResponse(200, [TRIP]));
    await listTrips();
    const [url, init] = fake.mock.calls[0] ?? [];
    expect(url).toBe("/api/trips");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.method).toBe("GET");
  });

  it("F2.R9 getTrip encodes the id into a relative path", async () => {
    const fake = stubFetch(jsonResponse(200, TRIP));
    await getTrip("a/b");
    expect(fake.mock.calls[0]?.[0]).toBe("/api/trips/a%2Fb");
  });

  it("F2.R9 createTrip sends the name as JSON to /api/trips", async () => {
    const fake = stubFetch(jsonResponse(201, TRIP));
    await createTrip("Lisbon");
    const [url, init] = fake.mock.calls[0] ?? [];
    expect(url).toBe("/api/trips");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ name: "Lisbon" }));
  });

  it("F2.R9 deleteTrip sends DELETE to /api/trips/:id", async () => {
    const fake = stubFetch(new Response(null, { status: 204 }));
    await deleteTrip("t1");
    const [url, init] = fake.mock.calls[0] ?? [];
    expect(url).toBe("/api/trips/t1");
    expect(init?.method).toBe("DELETE");
  });
});

describe("successful responses", () => {
  it("F2.R9 listTrips returns the server's order", async () => {
    const second = { id: "t2", name: "Porto", created_at: "2026-02-01T10:00:00.000Z" };
    stubFetch(jsonResponse(200, [TRIP, second]));
    await expect(listTrips()).resolves.toEqual([TRIP, second]);
  });

  it("F2.R9 createTrip returns the created trip view", async () => {
    stubFetch(jsonResponse(201, TRIP));
    await expect(createTrip("Lisbon")).resolves.toEqual(TRIP);
  });

  it("F2.R9 deleteTrip resolves on 204 with no body", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(deleteTrip("t1")).resolves.toBeUndefined();
  });

  it("F2.R9 a 2xx body of the wrong shape is rejected rather than passed on", async () => {
    stubFetch(jsonResponse(200, { unexpected: true }));
    await expect(getTrip("t1")).rejects.toThrow("Unexpected response from the trips API");
  });
});
