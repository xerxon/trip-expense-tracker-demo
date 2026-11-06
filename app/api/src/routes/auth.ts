import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthService, AuthUser } from "../auth/service.js";
import {
  endSession,
  findSessionUser,
  sessionCookieOptions,
  startSession,
  type SessionStoreLike,
} from "../auth/session.js";
import { InvalidCredentialsError, type UserStore } from "../auth/types.js";

export const SESSION_COOKIE = "session";
export const LOGIN_EMPTY_MESSAGE = "Enter your email and password.";
export const LOGIN_FAILED_MESSAGE = "Email or password is incorrect.";
export const LOGIN_REQUIRED_MESSAGE = "Log in required";

export interface AuthRouteDeps {
  service: AuthService;
  users: UserStore;
  sessions: SessionStoreLike;
  secureCookies: boolean;
}

// Reads a string field from the JSON body. Anything else counts as empty,
// so the service's own validation rejects it with the right copy.
function readField(body: unknown, name: string): string {
  if (typeof body !== "object" || body === null) return "";
  const value = (body as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

function publicUser(user: AuthUser): AuthUser {
  return { id: user.id, email: user.email };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { service, users, sessions, secureCookies } = deps;
  const cookieOptions = sessionCookieOptions({ secure: secureCookies });

  // Reads the session token from the signed cookie. Returns null when there is no
  // cookie or the signature does not verify.
  function sessionTokenFrom(request: FastifyRequest): string | null {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw === undefined || raw === "") return null;
    const result = request.unsignCookie(raw);
    return result.valid ? result.value : null;
  }

  app.post("/auth/register", async (request, reply) => {
    const email = readField(request.body, "email");
    const password = readField(request.body, "password");

    const result = await service.register({ email, password });
    if (!result.ok) {
      // F1.R5: every registration failure, duplicate email included, gets the same 400 shape.
      return reply.status(400).send({ error: result.message });
    }

    const token = await startSession(sessions, result.user.id);
    reply.setCookie(SESSION_COOKIE, token, cookieOptions);
    return reply.status(201).send(publicUser(result.user));
  });

  app.post("/auth/login", async (request, reply) => {
    const email = readField(request.body, "email");
    const password = readField(request.body, "password");

    if (email.trim() === "" || password === "") {
      return reply.status(400).send({ error: LOGIN_EMPTY_MESSAGE });
    }

    let user: AuthUser;
    try {
      user = await service.login({ email, password });
    } catch (err) {
      // F1.AC6: unknown email and wrong password give the same 401 body.
      if (err instanceof InvalidCredentialsError) {
        return reply.status(401).send({ error: LOGIN_FAILED_MESSAGE });
      }
      throw err;
    }

    const token = await startSession(sessions, user.id);
    reply.setCookie(SESSION_COOKIE, token, cookieOptions);
    return reply.status(200).send(publicUser(user));
  });

  app.post("/auth/logout", async (request, reply) => {
    // F1.AC7: the session row is deleted, then the cookie is cleared.
    const token = sessionTokenFrom(request);
    if (token !== null) {
      await endSession(sessions, token);
    }
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get("/auth/me", async (request, reply) => {
    // F1.AC7: after logout the session row is gone, so this returns 401.
    const token = sessionTokenFrom(request);
    const userId = token === null ? null : await findSessionUser(sessions, token);
    const user = userId === null ? null : await users.findById(userId);
    if (user === null) {
      return reply.status(401).send({ error: LOGIN_REQUIRED_MESSAGE });
    }
    return reply.status(200).send(publicUser(user));
  });
}
