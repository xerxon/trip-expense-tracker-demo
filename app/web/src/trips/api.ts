// Calls to the F2 trip endpoints. Paths are relative so the Vite proxy (which strips /api)
// forwards them, and cookies stay same-origin. Validation lives only in the API (F1 decision),
// so this file checks no names. Trip names are never logged here.
import { ApiError, SERVER_ERROR_MESSAGE } from "../auth/api";

export interface TripView {
  id: string;
  name: string;
  created_at: string;
}

// F2.R12: the text shown when a trip cannot be found (missing or not owned).
export const TRIP_NOT_FOUND_MESSAGE = "Trip not found.";

// Raised on any 401 (F1.R8, F1.R10). The app turns it into a redirect to Log in,
// and the message is shown only if nothing else catches it.
export class SessionEndedError extends Error {
  constructor() {
    super("Your session has ended. Log in again.");
    this.name = "SessionEndedError";
  }
}

const TRIPS_BASE = "/api/trips";

async function send(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<Response> {
  const hasBody = body !== undefined;
  const response = await fetch(`${TRIPS_BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    throw new SessionEndedError();
  }
  return response;
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

// Keeps only the fields the UI uses. Anything else in the response is dropped.
function parseTrip(body: unknown): TripView {
  if (
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    "name" in body &&
    "created_at" in body &&
    typeof body.id === "string" &&
    typeof body.name === "string" &&
    typeof body.created_at === "string"
  ) {
    return { id: body.id, name: body.name, created_at: body.created_at };
  }
  throw new Error("Unexpected response from the trips API");
}

function parseTripList(body: unknown): TripView[] {
  if (!Array.isArray(body)) {
    throw new Error("Unexpected response from the trips API");
  }
  return body.map(parseTrip);
}

/** The logged-in user's trips, in the order the server gives (F2.R4). */
export async function listTrips(): Promise<TripView[]> {
  const response = await send("GET", "");
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return parseTripList(await response.json());
}

/** One trip. A missing or not-owned trip raises "Trip not found." (F2.R12). */
export async function getTrip(id: string): Promise<TripView> {
  const response = await send("GET", `/${encodeURIComponent(id)}`);
  if (response.status === 404) {
    throw new ApiError(404, TRIP_NOT_FOUND_MESSAGE);
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return parseTrip(await response.json());
}

/** Creates a trip. The API decides whether the name is valid and returns its copy on a 400. */
export async function createTrip(name: string): Promise<TripView> {
  const response = await send("POST", "", { name });
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return parseTrip(await response.json());
}

/** Deletes a trip. Success is 204 with no body (F2.AC9). */
export async function deleteTrip(id: string): Promise<void> {
  const response = await send("DELETE", `/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw await errorFrom(response);
  }
}
