import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../App";
import { ApiError, me, type AuthUser } from "../auth/api";
import { createTrip, type TripView } from "../trips/api";
import { CreateTripPage } from "./CreateTripPage";

// Fake api modules: the real error class and copy helpers stay, the network calls are replaced.
vi.mock("../trips/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trips/api")>();
  return { ...actual, createTrip: vi.fn() };
});

vi.mock("../auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/api")>();
  return {
    ...actual,
    me: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };
});

const user: AuthUser = { id: "user-1", email: "sam@example.com" };
const trip: TripView = { id: "t1", name: "Lisbon", created_at: "2026-03-01T10:00:00.000Z" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Shows where the router is, so a test can see the navigation after a create.
function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/trips/new"]}>
      <Routes>
        <Route path="/trips/new" element={<CreateTripPage />} />
        <Route
          path="/trips"
          element={
            <>
              <h1>Trips</h1>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function typeName(name: string) {
  fireEvent.change(screen.getByLabelText("Trip name"), { target: { value: name } });
}

function clickCreate() {
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
}

describe("CreateTripPage", () => {
  beforeEach(() => {
    vi.mocked(createTrip).mockReset();
    vi.mocked(me).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F2.AC1 the name field has a visible label", () => {
    renderPage();

    expect(screen.getByLabelText("Trip name").tagName).toBe("INPUT");
  });

  it("F2.AC1 success creates the trip and navigates to Trips", async () => {
    vi.mocked(createTrip).mockResolvedValue(trip);
    renderPage();

    typeName("Lisbon");
    clickCreate();

    await screen.findByRole("heading", { name: "Trips" });
    expect(createTrip).toHaveBeenCalledWith("Lisbon");
    expect(createTrip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location").textContent).toBe("/trips");
  });

  it("F2.AC1 submitting the form (Enter in the field) creates the trip", async () => {
    vi.mocked(createTrip).mockResolvedValue(trip);
    renderPage();

    typeName("Lisbon");
    fireEvent.submit(screen.getByLabelText("Trip name").closest("form") as HTMLFormElement);

    await screen.findByRole("heading", { name: "Trips" });
    expect(createTrip).toHaveBeenCalledWith("Lisbon");
  });

  it("F2.AC1 the Create button is disabled while the request is in flight", async () => {
    const pending = deferred<TripView>();
    vi.mocked(createTrip).mockReturnValue(pending.promise);
    renderPage();

    typeName("Lisbon");
    clickCreate();

    const button = screen.getByRole("button", { name: "Create" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(screen.queryByRole("heading", { name: "Trips" })).toBeNull();

    pending.resolve(trip);
    await screen.findByRole("heading", { name: "Trips" });
  });

  it("F2.AC2 a 400 name error is shown, linked to the field, focused, and no navigation happens", async () => {
    vi.mocked(createTrip).mockRejectedValue(new ApiError(400, "Enter a trip name."));
    renderPage();

    typeName("   ");
    clickCreate();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter a trip name.");
    expect(createTrip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Trips" })).toBeNull();

    const field = screen.getByLabelText("Trip name");
    expect(field.getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.activeElement).toBe(field);
  });

  it("F2.AC2 a name over 50 characters shows the server's length error", async () => {
    vi.mocked(createTrip).mockRejectedValue(
      new ApiError(400, "Trip names can be up to 50 characters."),
    );
    renderPage();

    typeName("x".repeat(51));
    clickCreate();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Trip names can be up to 50 characters.");
    expect(screen.queryByRole("heading", { name: "Trips" })).toBeNull();
  });

  it("F2.AC2 an empty name is sent to the API, which answers with its name error", async () => {
    vi.mocked(createTrip).mockRejectedValue(new ApiError(400, "Enter a trip name."));
    renderPage();

    clickCreate();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter a trip name.");
    expect(createTrip).toHaveBeenCalledWith("");
  });

  it("F2.AC2 a failure other than 400 shows the generic message, not the raw text", async () => {
    vi.mocked(createTrip).mockRejectedValue(new ApiError(500, "database exploded"));
    renderPage();

    typeName("Lisbon");
    clickCreate();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Try again.");
    expect(screen.queryByRole("heading", { name: "Trips" })).toBeNull();
  });

  it("F2.AC1 after a successful create the app opens Trips (top-of-list order is checked with F2.T8)", async () => {
    vi.mocked(me).mockResolvedValue(user);
    vi.mocked(createTrip).mockResolvedValue(trip);
    render(
      <MemoryRouter initialEntries={["/trips/new"]}>
        <AppShell />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Create trip" });
    typeName("Lisbon");
    clickCreate();

    await screen.findByRole("heading", { name: "Trips" });
    expect(createTrip).toHaveBeenCalledWith("Lisbon");
    expect(screen.queryByRole("heading", { name: "Create trip" })).toBeNull();
  });
});
