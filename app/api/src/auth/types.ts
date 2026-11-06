// Types and errors for the F1 register and log-in services.
// No database import: the database sits behind UserStore, which the app supplies.

export interface StoredUser {
  id: string;
  email: string;
  emailKey: string;
  passwordHash: string;
}

export interface NewUser {
  email: string;
  emailKey: string;
  passwordHash: string;
}

// The store looks users up by the normalized email key (F1.R2).
// create() must raise EmailTakenError when emailKey is already in use (F1.R2, F1.R5).
export interface UserStore {
  findByEmailKey(emailKey: string): Promise<StoredUser | null>;
  create(user: NewUser): Promise<StoredUser>;
}

// Raised by the store when a unique email key already exists (a registration race).
export class EmailTakenError extends Error {
  constructor() {
    super("Email already in use");
    this.name = "EmailTakenError";
  }
}

// Raised by login for an unknown email and for a wrong password alike (F1.R5).
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email or password is incorrect.");
    this.name = "InvalidCredentialsError";
  }
}

// The app's logger (Fastify/Pino) satisfies this shape. Log event names and ids only.
export interface AuthLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}
