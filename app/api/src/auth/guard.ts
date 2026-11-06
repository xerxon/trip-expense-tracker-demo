// Auth guard for trip endpoints (F1.R8 API part, F1.R10). F2 applies requireLogin to every trip route.
// No database import: the session store is passed in as SessionStoreLike.
import type { FastifyReply, FastifyRequest } from "fastify";
import { LOGIN_REQUIRED_MESSAGE, SESSION_COOKIE } from "../routes/auth.js";
import { findSessionUser, type SessionStoreLike } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    // Set by requireLogin when the request has a live session (F1.R10).
    userId?: string;
  }
}

// Reads the session token from the signed cookie. Returns null when there is no cookie
// or the signature does not verify.
function sessionTokenFrom(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw === undefined || raw === "") return null;
  const result = request.unsignCookie(raw);
  return result.valid ? result.value : null;
}

// Returns a preHandler. With no live session it replies 401 JSON and stops, so the
// route handler never runs. The cookie is checked before the session store is queried,
// and the session store is queried before any trip lookup (F1.AC10).
export function requireLogin(sessions: SessionStoreLike) {
  return async function requireLoginHook(request: FastifyRequest, reply: FastifyReply) {
    const token = sessionTokenFrom(request);
    const userId = token === null ? null : await findSessionUser(sessions, token);
    if (userId === null) {
      // F1.AC17: an API request gets a JSON error and no trip data.
      return reply.status(401).send({ error: LOGIN_REQUIRED_MESSAGE });
    }
    request.userId = userId;
  };
}
