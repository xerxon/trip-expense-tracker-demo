// Pure trip name and ordering rules for F2 (trips).
// No imports: these functions take plain values and return plain values.

export const TRIP_NAME_EMPTY_ERROR = "Enter a trip name.";
export const TRIP_NAME_TOO_LONG_ERROR = "Trip names can be up to 50 characters.";

const MAX_TRIP_NAME_LENGTH = 50;

// F2.R1: trim surrounding spaces.
export function normalizeTripName(name: string): string {
  return name.trim();
}

// F2.R1: after normalizing, empty is refused, and so is more than 50 characters.
// Length is counted in Unicode code points (see the F2 plan Decisions log).
export function validateTripName(name: string): string | null {
  const normalized = normalizeTripName(name);

  if (normalized.length === 0) return TRIP_NAME_EMPTY_ERROR;
  if (Array.from(normalized).length > MAX_TRIP_NAME_LENGTH) return TRIP_NAME_TOO_LONG_ERROR;

  return null;
}

// F2.R4, F2.R10: newest first by createdAt, then by id descending as a tie-break.
// Returns a new array and leaves the input unchanged.
export function newestFirst<T extends { id: string; createdAt: Date }>(trips: readonly T[]): T[] {
  return [...trips].sort((a, b) => {
    const byTime = b.createdAt.getTime() - a.createdAt.getTime();
    if (byTime !== 0) return byTime;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}
