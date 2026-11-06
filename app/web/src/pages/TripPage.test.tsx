import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../auth/api";
import { getTrip, type TripView } from "../trips/api";
import { TripPage } from "./TripPage";

// Fake api module: the real error class stays, the network call is replaced.
vi.mock("../trips/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trips/api")>();
  return { ...actual, getTrip: vi.fn() };
});

const lisbon: TripView = { id: "t1", name: "Lisbon", created_at: "2026-03-01T10:00:00.000Z" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage(path = "/trips/t1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/:id" element={<TripPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TripPage", () => {
  beforeEach(() => {
    vi.mocked(getTrip).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F2.AC16 the trip name is the only heading and the only trip content", async () => {
    vi.mocked(getTrip).mockResolvedValue(lisbon);
    const { container } = renderPage();

    const heading = await screen.findByRole("heading", { name: "Lisbon" });
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(heading.tagName).toBe("H1");
    expect(getTrip).toHaveBeenCalledWith("t1");
    // Nothing else on the page: the only text is the name (no id, dates or other trip content).
    const main = container.querySelector("main") as HTMLElement;
    expect(main.textContent).toBe("Lisbon");
    expect(main.textContent).not.toContain(lisbon.created_at);
    expect(main.textContent).not.toContain(lisbon.id);
  });

  it("F2.AC16 shows a loading state until the trip arrives", async () => {
    const pending = deferred<TripView>();
    vi.mocked(getTrip).mockReturnValue(pending.promise);
    renderPage();

    expect(screen.getByRole("status").textContent).toBe("Loading trip…");
    expect(screen.queryByRole("heading")).toBeNull();

    pending.resolve(lisbon);
    await screen.findByRole("heading", { name: "Lisbon" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("F2.AC17 a 404 shows Trip not found. and no trip data", async () => {
    vi.mocked(getTrip).mockRejectedValue(new ApiError(404, "Trip not found."));
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Trip not found.");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("Lisbon")).toBeNull();
  });

  it("F2.AC17 a 404 with the same body from a not-owned trip shows Trip not found. and no name", async () => {
    vi.mocked(getTrip).mockRejectedValue(new ApiError(404, "Trip not found."));
    renderPage("/trips/someone-elses");

    await screen.findByText("Trip not found.");
    expect(getTrip).toHaveBeenCalledWith("someone-elses");
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("F2.AC17 a server error shows the generic message, not the raw error text", async () => {
    vi.mocked(getTrip).mockRejectedValue(new ApiError(500, "database exploded"));
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Try again.");
    expect(screen.queryByText(/database exploded/)).toBeNull();
    expect(screen.queryByText("Trip not found.")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
