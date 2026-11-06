// Pure route rules for the web app. No React or router imports, so these run as plain unit tests.

export interface Session {
  userId: string;
}

const LOG_IN_PATH = "/login";
const REGISTER_PATH = "/register";
const TRIPS_PATH = "/trips";

function pathnameOf(path: string): string {
  const withoutHash = path.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

function isAuthPage(path: string): boolean {
  const pathname = pathnameOf(path);
  return pathname === LOG_IN_PATH || pathname === REGISTER_PATH;
}

/**
 * Where to send a visitor for `path`, or null to stay put.
 * - No session, trip or app page: Log in, keeping the path in `next` (F1.R8).
 * - Session, Register or Log in page: Trips (F1.R12).
 */
export function redirectFor(session: Session | null, path: string): string | null {
  if (session === null) {
    if (isAuthPage(path)) {
      return null;
    }
    return `${LOG_IN_PATH}?next=${encodeURIComponent(path)}`;
  }

  if (isAuthPage(path)) {
    return TRIPS_PATH;
  }
  return null;
}

/**
 * Returns `next` when it is a same-site path, otherwise Trips.
 * Accepts only a path that starts with a single "/" (not "//" or "/\").
 */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string") {
    return TRIPS_PATH;
  }
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return TRIPS_PATH;
  }
  return next;
}

/** Where to send a visitor after logging out. */
export function afterLogout(): string {
  return LOG_IN_PATH;
}
