// Types and errors for the F2 trip service.
// No database import: the database sits behind TripStore, which the app supplies.

export interface Trip {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
}

export interface NewTrip {
  ownerId: string;
  name: string;
}

// The response shape for one trip (F2.R10). created_at is an ISO UTC string.
export interface TripView {
  id: string;
  name: string;
  created_at: string;
}

// Every method is keyed by ownerId, so a read or delete of one trip never finds another user's trip (F2.R9).
// findForOwner returns null when no trip matches both id and owner.
// deleteForOwner returns how many rows were deleted (0 when no trip matches both id and owner).
export interface TripStore {
  create(input: NewTrip): Promise<Trip>;
  listByOwner(ownerId: string): Promise<Trip[]>;
  findForOwner(ownerId: string, tripId: string): Promise<Trip | null>;
  deleteForOwner(ownerId: string, tripId: string): Promise<number>;
}

// Raised for a missing trip and for a trip owned by someone else alike (F2.R9, F2.R12).
export class TripNotFoundError extends Error {
  constructor() {
    super("Trip not found.");
    this.name = "TripNotFoundError";
  }
}

// Raised by createTrip when the trimmed name fails the F2.R1 rules. The message is the copy to show.
export class TripValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TripValidationError";
  }
}

// The app's logger (Fastify/Pino) satisfies this shape. Log event names and ids only, never the trip name.
export interface TripLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}
