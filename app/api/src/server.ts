import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import cookie from "@fastify/cookie";
import { createDb, type Db } from "./db.js";
import { createSessionStore, createUserStore } from "./auth/prisma-stores.js";
import { createAuthService } from "./auth/service.js";
import type { SessionStoreLike } from "./auth/session.js";
import type { UserStore } from "./auth/types.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTripRoutes } from "./routes/trips.js";
import { createTripStore } from "./trips/prisma-store.js";
import type { TripStore } from "./trips/types.js";

export const UNEXPECTED_ERROR_MESSAGE = "Something went wrong. Try again.";

export interface AuthOptions {
  // Optional stores. When omitted, the Prisma stores are used.
  users?: UserStore;
  sessions?: SessionStoreLike;
  // Signs the session cookie (F1.R6). index.ts reads it from SESSION_SECRET.
  cookieSecret?: string;
  // Sets the Secure attribute on the session cookie. Defaults to true; index.ts derives it.
  secureCookies?: boolean;
}

export interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  auth?: AuthOptions;
  // Optional trip store. index.ts and the default use the Prisma store.
  trips?: TripStore;
}

// The Prisma stores are created on first use, so building the server (for example in
// the /health test) does not need DATABASE_URL. Auth and trip stores share one client.
function defaultStores(): { users: UserStore; sessions: SessionStoreLike; trips: TripStore } {
  let stores: { users: UserStore; sessions: SessionStoreLike; trips: TripStore } | undefined;
  const get = () => {
    if (stores === undefined) {
      const db: Db = createDb();
      stores = {
        users: createUserStore(db),
        sessions: createSessionStore(db),
        trips: createTripStore(db),
      };
    }
    return stores;
  };

  return {
    users: {
      findByEmailKey: (emailKey) => get().users.findByEmailKey(emailKey),
      findById: (id) => get().users.findById(id),
      create: (user) => get().users.create(user),
    },
    sessions: {
      insert: (session) => get().sessions.insert(session),
      findByHash: (hash) => get().sessions.findByHash(hash),
      deleteByHash: (hash) => get().sessions.deleteByHash(hash),
    },
    trips: {
      create: (input) => get().trips.create(input),
      listByOwner: (ownerId) => get().trips.listByOwner(ownerId),
      findForOwner: (ownerId, tripId) => get().trips.findForOwner(ownerId, tripId),
      deleteForOwner: (ownerId, tripId) => get().trips.deleteForOwner(ownerId, tripId),
    },
  };
}

export function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const auth = options.auth ?? {};
  const defaults = defaultStores();

  // Unexpected errors reach here and get the generic 500 copy (never swallowed).
  // Client errors (4xx) keep their status and message.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: err.message });
    }
    // Log the error name and code only: messages can carry query data.
    request.log.error({ err: { name: err.name, code: err.code } }, "Unexpected error");
    return reply.status(500).send({ error: UNEXPECTED_ERROR_MESSAGE });
  });

  app.register(cookie, { secret: auth.cookieSecret });

  app.get("/health", async () => ({ status: "ok" }));

  const users = auth.users ?? defaults.users;
  const sessions = auth.sessions ?? defaults.sessions;
  registerAuthRoutes(app, {
    service: createAuthService({ store: users, logger: app.log }),
    users,
    sessions,
    secureCookies: auth.secureCookies ?? true,
  });

  registerTripRoutes(app, {
    store: options.trips ?? defaults.trips,
    sessions,
    logger: app.log,
  });

  return app;
}
