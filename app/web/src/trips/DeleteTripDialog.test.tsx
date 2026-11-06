import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../auth/api";
import { TripsPage } from "../pages/TripsPage";
import { deleteTrip, listTrips, type TripView } from "./api";

// Fake api module: the real error class stays, the network calls are replaced.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, listTrips: vi.fn(), deleteTrip: vi.fn() };
});

const porto: TripView = { id: "t3", name: "Porto", created_at: "2026-05-03T10:00:00.000Z" };
const madrid: TripView = { id: "t2", name: "Madrid", created_at: "2026-04-02T10:00:00.000Z" };
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/trips"]}>
      <Routes>
        <Route path="/trips" element={<TripsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders the list, then opens the dialog for the named trip's row.
async function openDialogFor(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Delete ${name} trip` }));
  return screen.getByRole("dialog");
}

describe("DeleteTripDialog", () => {
  beforeEach(() => {
    vi.mocked(listTrips).mockReset();
    vi.mocked(deleteTrip).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F2.AC8 opening the dialog shows the title, the body, Cancel and Delete, with focus on Cancel", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto, madrid]);
    renderPage();

    const dialog = await openDialogFor("Porto");

    expect(within(dialog).getByRole("heading", { name: "Delete this trip?" })).toBeTruthy();
    expect(
      within(dialog).getByText("This removes the trip and everything in it. This can't be undone."),
    ).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
  });

  it("F2.AC8 Cancel closes the dialog, does not call deleteTrip, and keeps the trip in the list", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto, madrid]);
    renderPage();

    const dialog = await openDialogFor("Porto");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteTrip).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Porto" })).toBeTruthy();
  });

  it("F2.AC8 Cancel returns focus to the Delete button on the row", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto, madrid]);
    renderPage();

    const dialog = await openDialogFor("Madrid");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Delete Madrid trip" }),
    );
  });

  it("F2.AC8 Escape closes the dialog without deleting", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto]);
    renderPage();

    const dialog = await openDialogFor("Porto");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteTrip).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Porto" })).toBeTruthy();
  });

  it("F2.AC8 Tab and Shift+Tab stay between Cancel and Delete while the dialog is open", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto]);
    renderPage();

    const dialog = await openDialogFor("Porto");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Delete" });

    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("F2.AC8 focus moved outside the dialog is pulled back to Cancel", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto, madrid]);
    renderPage();

    const dialog = await openDialogFor("Porto");
    const outside = screen.getByRole("button", { name: "Delete Madrid trip" });
    outside.focus();

    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
  });

  it("F2.AC9 Delete calls deleteTrip once for the chosen trip and the row is removed", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto, madrid, lisbon]);
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    renderPage();

    const dialog = await openDialogFor("Madrid");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleteTrip).toHaveBeenCalledTimes(1);
    expect(deleteTrip).toHaveBeenCalledWith("t2");
    expect(screen.queryByRole("link", { name: "Madrid" })).toBeNull();
    expect(screen.getByRole("link", { name: "Porto" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Lisbon" })).toBeTruthy();
  });

  it("F2.AC9 after a confirmed delete focus moves to the Trips heading", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto, madrid]);
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    renderPage();

    const dialog = await openDialogFor("Porto");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Trips" }));
  });

  it("F2.AC9 while the delete runs both buttons are disabled and a second click does not delete again", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto]);
    const pending = deferred<void>();
    vi.mocked(deleteTrip).mockReturnValue(pending.promise);
    renderPage();

    const dialog = await openDialogFor("Porto");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirm);

    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(deleteTrip).toHaveBeenCalledTimes(1);

    pending.resolve(undefined);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("F2.AC10 web side: a failed delete shows the generic message and keeps the trip in the list", async () => {
    vi.mocked(listTrips).mockResolvedValue([porto]);
    vi.mocked(deleteTrip).mockRejectedValue(new ApiError(500, "database exploded"));
    renderPage();

    const dialog = await openDialogFor("Porto");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Try again.");
    expect(screen.queryByText(/database exploded/)).toBeNull();
    expect(screen.getByRole("link", { name: "Porto" })).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
