import { describe, expect, it } from "vitest";
import { afterLogout, redirectFor, safeNextPath, type Session } from "./rules";

const session: Session = { userId: "user-1" };

describe("F1.AC5 safe next path", () => {
  it("F1.AC5 uses a safe next path", () => {
    expect(safeNextPath("/trips/12")).toBe("/trips/12");
    expect(safeNextPath("/trips?tab=people")).toBe("/trips?tab=people");
  });

  it("F1.AC5 ignores an external next path", () => {
    expect(safeNextPath("https://evil.example")).toBe("/trips");
    expect(safeNextPath("//evil.example/steal")).toBe("/trips");
    expect(safeNextPath("/\\evil.example")).toBe("/trips");
    expect(safeNextPath("trips/12")).toBe("/trips");
    expect(safeNextPath("")).toBe("/trips");
  });

  it("F1.AC5 falls back to Trips when next is missing", () => {
    expect(safeNextPath(null)).toBe("/trips");
    expect(safeNextPath(undefined)).toBe("/trips");
  });
});

describe("F1.AC7 logout", () => {
  it("F1.AC7 after logout goes to Log in", () => {
    expect(afterLogout()).toBe("/login");
  });

  it("F1.AC7 after logout a trip path goes to Log in", () => {
    expect(redirectFor(null, "/trips/12")).toBe("/login?next=%2Ftrips%2F12");
  });
});

describe("F1.AC8 logged-out trip path", () => {
  it("F1.AC8 logged-out trip path goes to Log in with the path kept", () => {
    expect(redirectFor(null, "/trips/12/expenses")).toBe(
      "/login?next=%2Ftrips%2F12%2Fexpenses",
    );
  });
});

describe("F1.AC15 session on Register or Log in", () => {
  it("F1.AC15 session on Register goes to Trips", () => {
    expect(redirectFor(session, "/register")).toBe("/trips");
  });

  it("F1.AC15 session on Log in goes to Trips", () => {
    expect(redirectFor(session, "/login")).toBe("/trips");
  });

  it("F1.AC15 session on Log in with a next query goes to Trips", () => {
    expect(redirectFor(session, "/login?next=%2Ftrips%2F12")).toBe("/trips");
  });

  it("F1.AC15 session on a trip page stays put", () => {
    expect(redirectFor(session, "/trips/12")).toBeNull();
  });
});

describe("F1.AC17 page request with no session", () => {
  it("F1.AC17 page request with no session redirects to Log in", () => {
    expect(redirectFor(null, "/trips")).toBe("/login?next=%2Ftrips");
  });

  it("F1.AC17 logged-out visitor stays on Register and Log in", () => {
    expect(redirectFor(null, "/login")).toBeNull();
    expect(redirectFor(null, "/register")).toBeNull();
  });
});
