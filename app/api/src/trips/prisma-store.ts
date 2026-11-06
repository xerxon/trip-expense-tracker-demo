// Prisma-backed store for the F2 trip table.
// Only Prisma query methods with parameters are used here (project rules).
// Every read and delete of one trip is keyed by ownerId in the query itself (F2.R9).
import type { Db } from "../db.js";
import type { NewTrip, Trip, TripStore } from "./types.js";

export function createTripStore(db: Db): TripStore {
  return {
    async create(input: NewTrip): Promise<Trip> {
      const row = await db.trip.create({
        data: { ownerId: input.ownerId, name: input.name },
      });
      return { id: row.id, ownerId: row.ownerId, name: row.name, createdAt: row.createdAt };
    },

    // F2.R4: only the owner's trips, newest first, with id as the tie-break.
    async listByOwner(ownerId: string): Promise<Trip[]> {
      const rows = await db.trip.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        createdAt: row.createdAt,
      }));
    },

    // F2.R9, F2.R12: findFirst, not findUnique, because ownerId is not unique on its own.
    // Returns null when no trip matches both the id and the owner.
    async findForOwner(ownerId: string, tripId: string): Promise<Trip | null> {
      const row = await db.trip.findFirst({ where: { id: tripId, ownerId } });
      if (row === null) return null;
      return { id: row.id, ownerId: row.ownerId, name: row.name, createdAt: row.createdAt };
    },

    // F2.R7: the delete runs inside a transaction. F3, F4 and F6 add their deletes to this block.
    // F2.R9: the owner check is in the deleteMany where clause.
    async deleteForOwner(ownerId: string, tripId: string): Promise<number> {
      return db.$transaction(async (tx) => {
        const result = await tx.trip.deleteMany({ where: { id: tripId, ownerId } });
        return result.count;
      });
    },
  };
}
