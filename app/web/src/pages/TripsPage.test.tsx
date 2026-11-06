import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../auth/api";
import { listTrips, type TripView } from "../trips/api";
import { TripsPage } from "./TripsPage";

// Fake api module: the real error class stays, the network call is replaced.
vi.mock("../trips/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trips/api")>();
  return { ...actual, listTrips: vi.fn() };
});

// Three trips in the order the server gives them (newest first).
const newest: TripView = { id: "t3", name: "Porto", created_at: "2026-05-03T10:00:00.000Z" };
const middle: TripView = { id: "t2", name: "Madrid", created_at: "2026-04-02T10:00:00.000Z" };
const oldest: TripView = { id: "t1", name: "Lisbon", created_at: "2026-03-01T10:00:00.000Z" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Shows where the router is, so a test can see the navigation to Create trip.
function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/trips"]}>
      <Routes>
        <Route
          path="/trips"
          element={
            <>
              <TripsPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="/trips/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TripsPage", () => {
  beforeEach(() => {
    vi.mocked(listTrips).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F2.AC6 shows the trips in the order the server gives them", async () => {
    vi.mocked(listTrips).mockResolvedValue([newest, middle, oldest]);
    renderPage();

    await screen.findByRole("link", { name: "Porto" });
    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Porto", "Madrid", "Lisbon"]);
  });

  it("F2.AC6 each row shows only the trip name and its Delete control", async () => {
    vi.mocked(listTrips).mockResolvedValue([newest]);
    renderPage();

    const link = await screen.findByRole("link", { name: "Porto" });
    const row = link.closest("li") as HTMLLIElement;
    // The only text in the row is the name and the Delete control. No dates or ids.
    expect(row.textContent).toBe("Porto Delete");
    expect(within(row).getByRole("button", { name: "Delete Porto trip" })).toBeTruthy();
    expect(row.textContent).not.toContain(newest.created_at);
    expect(row.textContent).not.toContain(newest.id);
  });

  it("F2.AC7 empty list shows the message and the Create trip button", async () => {
    vi.mocked(listTrips).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("You don't have any trips yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create trip" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("F2.AC7 the Create trip button in the empty state opens the Create trip page", async () => {
    vi.mocked(listTrips).mockResolvedValue([]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));

    expect(screen.getByTestId("location").textContent).toBe("/trips/new");
  });

  it("F2.AC7 a list with trips shows a Create trip button that opens the Create trip page", async () => {
    vi.mocked(listTrips).mockResolvedValue([newest, middle, oldest]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Create trip" }));

    expect(screen.getByTestId("location").textContent).toBe("/trips/new");
  });

  it("F2.AC13 a trip row has no edit control", async () => {
    vi.mocked(listTrips).mockResolvedValue([newest, middle, oldest]);
    renderPage();

    await screen.findByRole("link", { name: "Porto" });
    const controls = [
      ...screen.queryAllByRole("button"),
      ...screen.queryAllByRole("link"),
    ];
    for (const control of controls) {
      expect(control.textContent ?? "").not.toMatch(/edit/i);
      expect(control.getAttribute("aria-label") ?? "").not.toMatch(/edit/i);
    }
    expect(screen.queryByText(/edit/i)).toBeNull();
  });

  it("F2.AC16 each trip name is a link to its trip page", async () => {
    vi.mocked(listTrips).mockResolvedValue([newest, oldest]);
    renderPage();

    const porto = await screen.findByRole("link", { name: "Porto" });
    const lisbon = screen.getByRole("link", { name: "Lisbon" });
    expect(porto.getAttribute("href")).toBe("/trips/t3");
    expect(lisbon.getAttribute("href")).toBe("/trips/t1");
  });

  it("F2.AC6 shows a loading state until the list arrives", async () => {
    const pending = deferred<TripView[]>();
    vi.mocked(listTrips).mockReturnValue(pending.promise);
    renderPage();

    expect(screen.getByRole("status").textContent).toBe("Loading trips…");
    expect(screen.queryByRole("link", { name: "Porto" })).toBeNull();

    pending.resolve([newest]);
    await screen.findByRole("link", { name: "Porto" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("F2.AC6 a failed list shows the generic message, not the raw error text", async () => {
    vi.mocked(listTrips).mockRejectedValue(new ApiError(500, "database exploded"));
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Try again.");
    expect(screen.queryByText(/database exploded/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Create trip" })).toBeNull();
  });
});
