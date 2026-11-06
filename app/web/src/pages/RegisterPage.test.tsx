import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, register, type AuthUser } from "../auth/api";
import { RegisterPage } from "./RegisterPage";

// Fake api module: the real error class and copy helpers stay, the network calls are replaced.
vi.mock("../auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/api")>();
  return { ...actual, register: vi.fn(), login: vi.fn() };
});

const user: AuthUser = { id: "user-1", email: "sam@example.com" };

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
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.mocked(register).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("F1.AC1 success calls the success callback", async () => {
    vi.mocked(register).mockResolvedValue(user);
    const onSuccess = vi.fn();
    render(<RegisterPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "correct horse");

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user));
    expect(register).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "correct horse",
    });
  });

  it("F1.AC1 the password field uses autocomplete new-password", () => {
    render(<RegisterPage onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
  });

  it("F1.AC1 the Register button is disabled while the request is pending", async () => {
    const pending = deferred<AuthUser>();
    vi.mocked(register).mockReturnValue(pending.promise);
    const onSuccess = vi.fn();
    render(<RegisterPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "correct horse");

    const button = screen.getByRole("button", { name: "Register" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(onSuccess).not.toHaveBeenCalled();

    pending.resolve(user);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user));
  });

  it("F1.AC2 a 400 password error is shown, focused, and the success callback is not called", async () => {
    vi.mocked(register).mockRejectedValue(
      new ApiError(400, "Password must be at least 8 characters."),
    );
    const onSuccess = vi.fn();
    render(<RegisterPage onSuccess={onSuccess} />);

    fillAndSubmit("sam@example.com", "1234567");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Password must be at least 8 characters.");
    expect(onSuccess).not.toHaveBeenCalled();

    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.activeElement).toBe(password);
  });

  it("F1.AC16 an email error from the server is shown next to the email field", async () => {
    vi.mocked(register).mockRejectedValue(
      new ApiError(400, "Enter a valid email address."),
    );
    render(<RegisterPage onSuccess={vi.fn()} />);

    fillAndSubmit("not-an-email", "correct horse");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter a valid email address.");
    expect(screen.getByLabelText("Email").getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });
});
