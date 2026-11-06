// Trip routes for F2: create, list, open and delete. Every route runs requireLogin first (F1.R10),
// so the store is never touched without a live session. The session user is the only owner
// the routes use (F2.R2, F2.R9).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireLogin } from "../auth/guard.js";
import type { SessionStoreLike } from "../auth/session.js";
import { createTrip, deleteTrip, getTrip, listTrips, toTripView } from "../trips/service.js";
import { TripNotFoundError, TripValidationError, type TripLogger, type TripStore } from "../trips/types.js";

export const TRIP_NOT_FOUND_MESSAGE = "Trip not found.";

export interface TripRouteDeps {
  store: TripStore;
  sessions: SessionStoreLike;
  logger: TripLogger;
}

// Reads the name from the JSON body only. Anything other than a string counts as empty,
// so the service's own validation refuses it with the right copy (F2.AC15).
function readName(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const value = (body as Record<string, unknown>).name;
  return typeof value === "string" ? value : "";
}

// requireLogin sets request.userId before any handler runs. Missing means a broken guard,
// so this throws and the error handler answers 500 rather than guessing an owner.
function ownerOf(request: FastifyRequest): string {
  if (request.userId === undefined) {
    throw new Error("requireLogin did not set userId");
  }
  return request.userId;
}

// F2.R9, F2.R12, F1.R9: a missing trip and another user's trip get the same 404.
// Any other error is rethrown, never swallowed.
function sendNotFound(err: unknown, reply: FastifyReply) {
  if (err instanceof TripNotFoundError) {
    return reply.status(404).send({ error: TRIP_NOT_FOUND_MESSAGE });
  }
  throw err;
}

export function registerTripRoutes(app: FastifyInstance, deps: TripRouteDeps): void {
  const { store, logger } = deps;
  const guard = { preHandler: requireLogin(deps.sessions) };

  // F2.AC1, F2.AC4, F2.AC15: the owner comes from the session, never from the body.
  app.post("/trips", guard, async (request, reply) => {
    try {
      const trip = await createTrip(store, { ownerId: ownerOf(request), name: readName(request.body) }, logger);
      return reply.status(201).send(toTripView(trip));
    } catch (err) {
      if (err instanceof TripValidationError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // F2.R4: only the session user's trips, newest first.
  app.get("/trips", guard, async (request, reply) => {
    const trips = await listTrips(store, ownerOf(request));
    return reply.status(200).send(trips.map(toTripView));
  });

  // F2.AC17, F2.AC11: open one trip. Not found covers missing and not-owned alike.
  app.get<{ Params: { id: string } }>("/trips/:id", guard, async (request, reply) => {
    try {
      const trip = await getTrip(store, ownerOf(request), request.params.id, logger);
      return reply.status(200).send(toTripView(trip));
    } catch (err) {
      return sendNotFound(err, reply);
    }
  });

  // F2.AC9, F2.AC11: delete one trip. Success is 204 with no body.
  app.delete<{ Params: { id: string } }>("/trips/:id", guard, async (request, reply) => {
    try {
      await deleteTrip(store, ownerOf(request), request.params.id, logger);
      return reply.status(204).send();
    } catch (err) {
      return sendNotFound(err, reply);
    }
  });
}
