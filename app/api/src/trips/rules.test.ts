import { describe, expect, it } from "vitest";
import {
  TRIP_NAME_EMPTY_ERROR,
  TRIP_NAME_TOO_LONG_ERROR,
  newestFirst,
  normalizeTripName,
  validateTripName,
} from "./rules.js";

describe("F2.AC2 trip name rule (F2.R1)", () => {
  it("F2.AC2 rejects empty, spaces-only and 51-character names, accepts 50", () => {
    expect(validateTripName("")).toBe(TRIP_NAME_EMPTY_ERROR);
    expect(validateTripName("     ")).toBe(TRIP_NAME_EMPTY_ERROR);
    expect(validateTripName("a".repeat(51))).toBe(TRIP_NAME_TOO_LONG_ERROR);
    expect(validateTripName("a".repeat(50))).toBeNull();
  });
});

describe("F2.AC14 trip name trimming (F2.R1)", () => {
  it("F2.AC14 trims surrounding spaces and treats spaces-only as empty", () => {
    expect(normalizeTripName("  Lisbon  ")).toBe("Lisbon");
    expect(validateTripName("   ")).toBe("Enter a trip name.");
    expect(validateTripName("  Lisbon  ")).toBeNull();
  });
});

describe("F2.AC6 trip ordering (F2.R4, F2.R10)", () => {
  it("F2.AC6 newestFirst puts the newest trip first", () => {
    const trips = [
      { id: "t1", createdAt: new Date("2026-01-01T10:00:00.000Z") },
      { id: "t3", createdAt: new Date("2026-03-01T10:00:00.000Z") },
      { id: "t2", createdAt: new Date("2026-02-01T10:00:00.000Z") },
    ];
    const original = [...trips];

    const sorted = newestFirst(trips);

    expect(sorted.map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
    expect(sorted).not.toBe(trips);
    expect(trips).toEqual(original);
  });
});
