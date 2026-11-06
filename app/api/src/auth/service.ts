import { randomBytes } from "node:crypto";
import { normalizeEmail, validateEmail, validatePassword } from "./rules.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  type AuthLogger,
  type UserStore,
} from "./types.js";

// F1.R5: the same neutral copy for "already in use", whether the pre-check or the store catches it.
export const EMAIL_TAKEN_MESSAGE = "We couldn't create an account with that email. Try logging in.";

export interface AuthUser {
  id: string;
  email: string;
}

export type RegisterResult =
  | { ok: true; user: AuthUser }
  | { ok: false; message: string };

export interface AuthService {
  register(input: { email: string; password: string }): Promise<RegisterResult>;
  login(input: { email: string; password: string }): Promise<AuthUser>;
}

export interface AuthDeps {
  store: UserStore;
  logger: AuthLogger;
}

// A real scrypt hash of a random value, used when the email is unknown so that a
// login always runs one hash verify (F1.R5). Computed once, on first use.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHash;
}

export function createAuthService({ store, logger }: AuthDeps): AuthService {
  return {
    async register({ email, password }) {
      // F1.R1 and F1.R3: validate before anything is written.
      const emailError = validateEmail(email);
      if (emailError !== null) return { ok: false, message: emailError };
      const passwordError = validatePassword(password);
      if (passwordError !== null) return { ok: false, message: passwordError };

      // F1.R2: the normalized email is both the stored email and the unique key.
      const normalized = normalizeEmail(email);

      const existing = await store.findByEmailKey(normalized);
      if (existing !== null) {
        logger.warn({ event: "auth.register.email_taken" }, "Registration refused");
        return { ok: false, message: EMAIL_TAKEN_MESSAGE };
      }

      // F1.R4: only the salted hash reaches the store.
      const passwordHash = await hashPassword(password);

      try {
        const created = await store.create({
          email: normalized,
          emailKey: normalized,
          passwordHash,
        });
        logger.info({ event: "auth.register.created", userId: created.id }, "Account created");
        return { ok: true, user: { id: created.id, email: created.email } };
      } catch (err) {
        // A race between two registrations: the store rejects the second one.
        if (err instanceof EmailTakenError) {
          logger.warn({ event: "auth.register.email_taken" }, "Registration refused");
          return { ok: false, message: EMAIL_TAKEN_MESSAGE };
        }
        throw err;
      }
    },

    async login({ email, password }) {
      const emailKey = normalizeEmail(email);
      const user = await store.findByEmailKey(emailKey);

      // Unknown email still runs one verify, against the dummy hash (F1.R5).
      const storedHash = user !== null ? user.passwordHash : await getDummyHash();
      const passwordMatches = await verifyPassword(password, storedHash);

      if (user === null || !passwordMatches) {
        logger.warn({ event: "auth.login.failed" }, "Login failed");
        throw new InvalidCredentialsError();
      }

      logger.info({ event: "auth.login.succeeded", userId: user.id }, "Login succeeded");
      return { id: user.id, email: user.email };
    },
  };
}
