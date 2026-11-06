// Calls to the F1 auth endpoints. Paths are relative so the Vite proxy (which strips /api)
// forwards them, and cookies stay same-origin. Nothing here stores a password or token.

export interface AuthUser {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}

// Shown when the server fails in a way the form cannot explain (F1 States & errors).
export const SERVER_ERROR_MESSAGE = "Something went wrong. Try again.";

const AUTH_BASE = "/api/auth";

// A non-2xx answer from the API. `message` is the server's `error` text, safe to show.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function send(method: "GET" | "POST", path: string, body?: Credentials): Promise<Response> {
  const hasBody = body !== undefined;
  return fetch(`${AUTH_BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

// Reads the server's `error` text. A body without one gets the generic message.
async function errorTextOf(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return SERVER_ERROR_MESSAGE;
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error !== ""
  ) {
    return body.error;
  }
  return SERVER_ERROR_MESSAGE;
}

async function errorFrom(response: Response): Promise<ApiError> {
  return new ApiError(response.status, await errorTextOf(response));
}

// Keeps only the fields the UI uses, so nothing else from the response is passed on.
function parseUser(body: unknown): AuthUser {
  if (
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    "email" in body &&
    typeof body.id === "string" &&
    typeof body.email === "string"
  ) {
    return { id: body.id, email: body.email };
  }
  throw new Error("Unexpected response from the auth API");
}

/**
 * The message to show for a failed call. A 4xx answer carries copy the user can act on.
 * Anything else (a 5xx, or no response at all) shows the generic message.
 */
export function messageFor(err: unknown): string {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return err.message;
  }
  return SERVER_ERROR_MESSAGE;
}

export async function register(credentials: Credentials): Promise<AuthUser> {
  const response = await send("POST", "/register", credentials);
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return parseUser(await response.json());
}

export async function login(credentials: Credentials): Promise<AuthUser> {
  const response = await send("POST", "/login", credentials);
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return parseUser(await response.json());
}

export async function logout(): Promise<void> {
  const response = await send("POST", "/logout");
  if (!response.ok) {
    throw await errorFrom(response);
  }
}

/** The logged-in user, or null when there is no session (401). */
export async function me(): Promise<AuthUser | null> {
  const response = await send("GET", "/me");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return parseUser(await response.json());
}
