// F2 trip service: create, list, get and delete, over a TripStore (see types.ts).
// No database import: the store and logger are passed in, so the tests use fakes.
// Ownership: every read or delete of one trip is keyed by ownerId in the store call (F2.R9).

import { newestFirst, normalizeTripName, validateTripName } from "./rules.js";
import {
  TripNotFoundError,
  TripValidationError,
  type Trip,
  type TripLogger,
  type TripStore,
  type TripView,
} from "./types.js";

// F2.R1: the name is validated and trimmed before anything is written.
// F2.R2: ownerId is the session user. The caller never passes an owner from the request.
export async function createTrip(
  store: TripStore,
  { ownerId, name }: { ownerId: string; name: string },
  logger: TripLogger,
): Promise<Trip> {
  const error = validateTripName(name);
  if (error !== null) throw new TripValidationError(error);

  const trip = await store.create({ ownerId, name: normalizeTripName(name) });
  logger.info({ event: "trip.created", tripId: trip.id, userId: ownerId }, "Trip created");
  return trip;
}

// F2.R4: only the owner's trips, newest first.
export async function listTrips(store: TripStore, ownerId: string): Promise<Trip[]> {
  const trips = await store.listByOwner(ownerId);
  return newestFirst(trips);
}

// F2.R9, F2.R12: a missing trip and another user's trip both raise the same not-found error.
export async function getTrip(
  store: TripStore,
  ownerId: string,
  tripId: string,
  logger: TripLogger,
): Promise<Trip> {
  const trip = await store.findForOwner(ownerId, tripId);
  if (trip === null) {
    logger.warn({ event: "trip.get.not_found", tripId, userId: ownerId }, "Trip not found");
    throw new TripNotFoundError();
  }
  return trip;
}

// F2.R9: a count of 0 covers both a missing trip and another user's trip.
export async function deleteTrip(
  store: TripStore,
  ownerId: string,
  tripId: string,
  logger: TripLogger,
): Promise<void> {
  const deleted = await store.deleteForOwner(ownerId, tripId);
  if (deleted === 0) {
    logger.warn({ event: "trip.delete.not_found", tripId, userId: ownerId }, "Trip not found");
    throw new TripNotFoundError();
  }
  logger.info({ event: "trip.deleted", tripId, userId: ownerId }, "Trip deleted");
}

// F2.R10: the view is id, name and created_at. toISOString always gives UTC.
export function toTripView(trip: Trip): TripView {
  return { id: trip.id, name: trip.name, created_at: trip.createdAt.toISOString() };
}
