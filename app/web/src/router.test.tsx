import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./App";
import { ApiError, login, logout, me, register, type AuthUser } from "./auth/api";

// Fake api module: the real error class and copy helpers stay, the network calls are replaced.
vi.mock("./auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/api")>();
  return {
    ...actual,
    me: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };
});

const user: AuthUser = { id: "user-1", email: "sam@example.com" };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  );
}

function fillAndSubmitRegister(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
}

describe("App shell and router", () => {
  beforeEach(() => {
    vi.mocked(me).mockReset();
    vi.mocked(register).mockReset();
    vi.mocked(login).mockReset();
    vi.mocked(logout).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F1.AC1 after registration the app shows Trips", async () => {
    vi.mocked(me).mockResolvedValue(null);
    vi.mocked(register).mockResolvedValue(user);
    renderAt("/register");

    await screen.findByRole("heading", { name: "Register" });
    fillAndSubmitRegister("sam@example.com", "correct horse");

    await screen.findByRole("heading", { name: "Trips" });
    expect(register).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "correct horse",
    });
    expect(screen.getByRole("heading", { name: "Trip Expense Tracker" })).toBeTruthy();
  });

  it("F1.AC7 logout shows the Log in page", async () => {
    vi.mocked(me).mockResolvedValue(user);
    vi.mocked(logout).mockResolvedValue(undefined);
    renderAt("/trips");

    await screen.findByRole("heading", { name: "Trips" });
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await screen.findByRole("heading", { name: "Log in" });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Trips" })).toBeNull();
  });

  it("F1.AC7 a trip URL with no session shows the Log in page", async () => {
    vi.mocked(me).mockResolvedValue(null);
    renderAt("/trips");

    await screen.findByRole("heading", { name: "Log in" });
    expect(screen.queryByRole("heading", { name: "Trips" })).toBeNull();
  });

  it("F1.AC7 a failed logout keeps the user on Trips and shows the error", async () => {
    vi.mocked(me).mockResolvedValue(user);
    vi.mocked(logout).mockRejectedValue(new ApiError(500, "server down"));
    renderAt("/trips");

    await screen.findByRole("heading", { name: "Trips" });
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "Trips" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
  });

  it("F1.AC15 a logged-in user who opens Log in is sent to Trips", async () => {
    vi.mocked(me).mockResolvedValue(user);
    renderAt("/login");

    await screen.findByRole("heading", { name: "Trips" });
    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
  });

  it("F1.AC15 a logged-in user who opens Register is sent to Trips", async () => {
    vi.mocked(me).mockResolvedValue(user);
    renderAt("/register");

    await screen.findByRole("heading", { name: "Trips" });
    expect(screen.queryByRole("heading", { name: "Register" })).toBeNull();
  });
});
