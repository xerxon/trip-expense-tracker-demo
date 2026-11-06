import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

const PASSWORD = "correct horse battery";

describe("F1.AC1 password hash (F1.R4)", () => {
  it("F1.AC1 stores only a salted hash, never the password", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(stored).not.toBe(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith("scrypt$")).toBe(true);

    // Two hashes of the same password differ because each uses a random salt.
    const second = await hashPassword(PASSWORD);
    expect(second).not.toBe(stored);
  });

  it("F1.AC1 verify is true for the right password and false for a wrong one", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword("wrong password here", stored)).toBe(false);
  });

  it("F1.AC1 verify returns false for a malformed stored value", async () => {
    expect(await verifyPassword(PASSWORD, "")).toBe(false);
    expect(await verifyPassword(PASSWORD, "not-a-hash")).toBe(false);
    expect(await verifyPassword(PASSWORD, "scrypt$1$2$3$4$5")).toBe(false);
    expect(await verifyPassword(PASSWORD, "bcrypt$x$y$z$a$b")).toBe(false);
    expect(await verifyPassword(PASSWORD, "scrypt$131072$8$1$AAAA$AAAA")).toBe(false);
  });
});

describe("F1.AC14 no plain value stored (F1.R4)", () => {
  it("F1.AC14 the stored value holds no part of the plain password", async () => {
    const stored = await hashPassword(PASSWORD);
    const parts = stored.split("$");

    // Six fields: algorithm, N, r, p, salt, hash. The password is in none of them.
    expect(parts).toHaveLength(6);
    for (const part of parts) {
      expect(part).not.toBe(PASSWORD);
    }
    expect(Buffer.from(parts[5] ?? "", "base64").toString("utf8")).not.toContain(PASSWORD);
  });
});
