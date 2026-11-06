// Prisma-backed stores for the F1 user and session tables.
// Only Prisma query methods with parameters are used here (project rules).
import type { Db } from "../db.js";
import { EmailTakenError, type NewUser, type StoredUser, type UserStore } from "./types.js";

// F1.R7: sessions are stored by the SHA-256 hash of the token, never the token itself.
// session.ts (F1.T6) uses this shape. It is defined here because session.ts does not exist yet.
export interface StoredSession {
  id: string;
  userId: string;
}

export interface SessionStore {
  insert(session: StoredSession): Promise<void>;
  findByHash(hash: string): Promise<StoredSession | null>;
  deleteByHash(hash: string): Promise<void>;
}

// F1.R2: the database unique index on User.emailKey is the only thing that stops two rows
// with the same normalized email. This pure check maps only that violation.
// Prisma reports a unique violation as code P2002. The SQLite driver adapter puts the
// failing columns in meta.driverAdapterError.constraint.fields, and meta.target may also
// name them. Duck-typed, so it can be tested with a fake error and no Prisma import.
const EMAIL_KEY_NAMES = new Set(["emailKey", "User_emailKey_key"]);

export function isEmailKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: unknown };
  if (code !== "P2002" || typeof meta !== "object" || meta === null) return false;

  const { target, driverAdapterError } = meta as {
    target?: unknown;
    driverAdapterError?: { constraint?: { fields?: unknown } };
  };

  const named: unknown[] = [];
  if (typeof target === "string") named.push(target);
  else if (Array.isArray(target)) named.push(...target);
  const fields = driverAdapterError?.constraint?.fields;
  if (Array.isArray(fields)) named.push(...fields);

  return named.some((name) => typeof name === "string" && EMAIL_KEY_NAMES.has(name));
}

export function createUserStore(db: Db): UserStore {
  return {
    async findByEmailKey(emailKey: string): Promise<StoredUser | null> {
      const row = await db.user.findUnique({ where: { emailKey } });
      if (row === null) return null;
      return { id: row.id, email: row.email, emailKey: row.emailKey, passwordHash: row.passwordHash };
    },

    async findById(id: string): Promise<StoredUser | null> {
      const row = await db.user.findUnique({ where: { id } });
      if (row === null) return null;
      return { id: row.id, email: row.email, emailKey: row.emailKey, passwordHash: row.passwordHash };
    },

    async create(user: NewUser): Promise<StoredUser> {
      try {
        const row = await db.user.create({
          data: { email: user.email, emailKey: user.emailKey, passwordHash: user.passwordHash },
        });
        return { id: row.id, email: row.email, emailKey: row.emailKey, passwordHash: row.passwordHash };
      } catch (err) {
        // F1.R2: a second account with the same normalized email is refused by the database.
        if (isEmailKeyViolation(err)) {
          throw new EmailTakenError();
        }
        throw err;
      }
    },
  };
}

export function createSessionStore(db: Db): SessionStore {
  return {
    async insert(session: StoredSession): Promise<void> {
      await db.session.create({ data: { id: session.id, userId: session.userId } });
    },

    async findByHash(hash: string): Promise<StoredSession | null> {
      const row = await db.session.findUnique({
        where: { id: hash },
        select: { id: true, userId: true },
      });
      return row;
    },

    async deleteByHash(hash: string): Promise<void> {
      // deleteMany does not throw when the row is already gone, so a repeated logout is safe.
      await db.session.deleteMany({ where: { id: hash } });
    },
  };
}
