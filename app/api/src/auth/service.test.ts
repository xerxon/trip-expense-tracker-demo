import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
import { EMAIL_TAKEN_MESSAGE, createAuthService } from "./service.js";
import { PASSWORD_ERROR, EMAIL_ERROR } from "./rules.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  type AuthLogger,
  type NewUser,
  type StoredUser,
  type UserStore,
} from "./types.js";

const PASSWORD = "correct horse battery";

// Fake user store: an in-memory list that enforces the unique email key like the database does.
function createFakeStore() {
  const users: StoredUser[] = [];
  const createCalls: NewUser[] = [];
  const store: UserStore = {
    async findByEmailKey(emailKey) {
      return users.find((u) => u.emailKey === emailKey) ?? null;
    },
    async create(newUser) {
      createCalls.push(newUser);
      if (users.some((u) => u.emailKey === newUser.emailKey)) {
        throw new EmailTakenError();
      }
      const row: StoredUser = {
        id: `user-${users.length + 1}`,
        email: newUser.email,
        emailKey: newUser.emailKey,
        passwordHash: newUser.passwordHash,
      };
      users.push(row);
      return row;
    },
  };
  return { store, users, createCalls };
}

// Fake logger: records every call so tests can check what was logged.
function createFakeLogger() {
  const calls: { level: "info" | "warn"; obj: Record<string, unknown>; msg: string }[] = [];
  const logger: AuthLogger = {
    info(obj, msg) {
      calls.push({ level: "info", obj, msg });
    },
    warn(obj, msg) {
      calls.push({ level: "warn", obj, msg });
    },
  };
  return { logger, calls };
}

// Put an account straight into the fake store, as if it were already registered.
async function seedUser(
  store: UserStore,
  email: string,
  password: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await store.create({
    email: normalized,
    emailKey: normalized,
    passwordHash: await hashPassword(password),
  });
}

describe("F1.AC1 registration stores a hash (F1.R4)", () => {
  it("F1.AC1 registration stores a hash and returns the user", async () => {
    const { store, createCalls } = createFakeStore();
    const { logger } = createFakeLogger();
    const auth = createAuthService({ store, logger });

    const result = await auth.register({ email: "sam@example.com", password: PASSWORD });

    expect(result).toEqual({
      ok: true,
      user: { id: "user-1", email: "sam@example.com" },
    });
    expect(createCalls).toHaveLength(1);
    const saved = createCalls[0];
    expect(saved?.passwordHash).not.toBe(PASSWORD);
    expect(saved?.passwordHash).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, saved?.passwordHash ?? "")).toBe(true);
    // The returned user has no hash field.
    expect(result.ok && "passwordHash" in result.user).toBe(false);
  });
});

describe("F1.AC2 register refuses a short password (F1.R3)", () => {
  it("F1.AC2 register service refuses a short password and creates nothing", async () => {
    const { store, createCalls, users } = createFakeStore();
    const { logger } = createFakeLogger();
    const auth = createAuthService({ store, logger });

    const result = await auth.register({ email: "sam@example.com", password: "abcdefg" });

    expect(result).toEqual({ ok: false, message: PASSWORD_ERROR });
    expect(createCalls).toHaveLength(0);
    expect(users).toHaveLength(0);
  });

  it("F1.AC2 register service refuses a malformed email and creates nothing", async () => {
    const { store, createCalls } = createFakeStore();
    const { logger } = createFakeLogger();
    const auth = createAuthService({ store, logger });

    const result = await auth.register({ email: "no-at-sign", password: PASSWORD });

    expect(result).toEqual({ ok: false, message: EMAIL_ERROR });
    expect(createCalls).toHaveLength(0);
  });
});

describe("F1.AC3 duplicate email is refused neutrally (F1.R2, F1.R5)", () => {
  it("F1.AC3 rejects a second account whose normalized email matches and shows the neutral message", async () => {
    const { store, createCalls, users } = createFakeStore();
    const { logger } = createFakeLogger();
    await seedUser(store, "sam@example.com", "first password here");
    const auth = createAuthService({ store, logger });

    const result = await auth.register({ email: "SAM@example.com", password: PASSWORD });

    expect(result).toEqual({ ok: false, message: EMAIL_TAKEN_MESSAGE });
    expect(EMAIL_TAKEN_MESSAGE).toBe(
      "We couldn't create an account with that email. Try logging in.",
    );
    expect(createCalls).toHaveLength(1); // only the seeded account
    expect(users).toHaveLength(1);
  });

  it("F1.AC3 a store race (EmailTakenError after the pre-check) shows the same neutral message", async () => {
    const { logger } = createFakeLogger();
    const createCalls: NewUser[] = [];
    // The pre-check finds nothing, but the store rejects the insert as a duplicate.
    const racingStore: UserStore = {
      async findByEmailKey() {
        return null;
      },
      async create(newUser) {
        createCalls.push(newUser);
        throw new EmailTakenError();
      },
    };
    const auth = createAuthService({ store: racingStore, logger });

    const result = await auth.register({ email: "sam@example.com", password: PASSWORD });

    expect(result).toEqual({ ok: false, message: EMAIL_TAKEN_MESSAGE });
    expect(createCalls).toHaveLength(1);
  });

  it("F1.AC3 rethrows store errors other than EmailTakenError and does not swallow them", async () => {
    const { logger } = createFakeLogger();
    const boom = new Error("database unavailable");
    const failingStore: UserStore = {
      async findByEmailKey() {
        return null;
      },
      async create() {
        throw boom;
      },
    };
    const auth = createAuthService({ store: failingStore, logger });

    await expect(
      auth.register({ email: "sam@example.com", password: PASSWORD }),
    ).rejects.toBe(boom);
  });
});

describe("F1.AC6 login errors are the same for unknown email and wrong password (F1.R5)", () => {
  it("F1.AC6 unknown email and wrong password give the same error", async () => {
    const { store } = createFakeStore();
    const { logger } = createFakeLogger();
    await seedUser(store, "sam@example.com", PASSWORD);
    const auth = createAuthService({ store, logger });

    const wrongPassword = await auth
      .login({ email: "sam@example.com", password: "not the password" })
      .then(
        () => null,
        (err: unknown) => err,
      );
    const unknownEmail = await auth
      .login({ email: "nobody@example.com", password: PASSWORD })
      .then(
        () => null,
        (err: unknown) => err,
      );

    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect((wrongPassword as Error).message).toBe("Email or password is incorrect.");
    expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
  });

  it("F1.AC6 correct email and password log in and return the user without the hash", async () => {
    const { store } = createFakeStore();
    const { logger } = createFakeLogger();
    await seedUser(store, "sam@example.com", PASSWORD);
    const auth = createAuthService({ store, logger });

    // Email is matched after trimming and lower-casing (F1.R2).
    const user = await auth.login({ email: "  SAM@example.com ", password: PASSWORD });

    expect(user).toEqual({ id: "user-1", email: "sam@example.com" });
    expect("passwordHash" in user).toBe(false);
  });
});

describe("F1.AC14 logger never receives a password or hash (F1.R4)", () => {
  it("F1.AC14 logger receives no password or hash on register and login", async () => {
    const { store, createCalls } = createFakeStore();
    const { logger, calls } = createFakeLogger();
    const auth = createAuthService({ store, logger });

    // Register path, success.
    await auth.register({ email: "sam@example.com", password: PASSWORD });
    const storedHash = createCalls[0]?.passwordHash ?? "";

    // Register path, duplicate.
    await auth.register({ email: "sam@example.com", password: PASSWORD });

    // Login path, success and failure.
    await auth.login({ email: "sam@example.com", password: PASSWORD });
    await auth
      .login({ email: "sam@example.com", password: "wrong password here" })
      .catch(() => undefined);

    expect(calls.length).toBeGreaterThan(0);
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain("wrong password here");
    expect(logged).not.toContain(storedHash);
    expect(logged).not.toContain("scrypt$");
    // Personal data: the email is not logged either.
    expect(logged).not.toContain("sam@example.com");
  });

  it("F1.AC14 logs carry event names and the user id only", async () => {
    const { store } = createFakeStore();
    const { logger, calls } = createFakeLogger();
    const auth = createAuthService({ store, logger });

    await auth.register({ email: "sam@example.com", password: PASSWORD });
    await auth.login({ email: "sam@example.com", password: PASSWORD });

    for (const call of calls) {
      expect(Object.keys(call.obj).sort()).toEqual(
        call.obj.userId === undefined ? ["event"] : ["event", "userId"],
      );
      expect(typeof call.obj.event).toBe("string");
    }
    expect(calls.map((c) => c.obj.event)).toEqual([
      "auth.register.created",
      "auth.login.succeeded",
    ]);
  });
});
