import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, login, type AuthUser } from "../auth/api";
import { LoginPage } from "./LoginPage";

// Fake api module: the real error class and copy helpers stay, the network calls are replaced.
vi.mock("../auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/api")>();
  return { ...actual, register: vi.fn(), login: vi.fn() };
});

const user: AuthUser = { id: "user-1", email: "sam@example.com" };
const FAILED_LOGIN = "Email or password is incorrect.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F1.AC5 success calls the success callback", async () => {
    vi.mocked(login).mockResolvedValue(user);
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "correct horse");

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user));
    expect(login).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "correct horse",
    });
  });

  it("F1.AC5 the password field uses autocomplete current-password", () => {
    render(<LoginPage onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe(
      "current-password",
    );
  });

  it("F1.AC5 the Log in button is disabled while the request is pending", async () => {
    const pending = deferred<AuthUser>();
    vi.mocked(login).mockReturnValue(pending.promise);
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "correct horse");

    const button = screen.getByRole("button", { name: "Log in" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(onSuccess).not.toHaveBeenCalled();

    pending.resolve(user);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user));
  });

  it("F1.AC6 wrong password and unknown email show the same message", async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError(401, FAILED_LOGIN))
      .mockRejectedValueOnce(new ApiError(401, FAILED_LOGIN));
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "wrong password");
    const wrongPassword = (await screen.findByRole("alert")).textContent;

    fillAndSubmit("nobody@example.com", "any password");
    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    const unknownEmail = (await screen.findByRole("alert")).textContent;

    expect(wrongPassword).toBe(FAILED_LOGIN);
    expect(unknownEmail).toBe(FAILED_LOGIN);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("F1.AC6 a server failure shows the generic message", async () => {
    vi.mocked(login).mockRejectedValue(new ApiError(500, "internal detail"));
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "correct horse");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Try again.");
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
