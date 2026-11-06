import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db.js";
import {
  createSessionStore,
  createUserStore,
  isEmailKeyViolation,
} from "./prisma-stores.js";
import { EmailTakenError } from "./types.js";

// Fake Prisma-shaped error. Only the fields the mapping rule reads are set.
function prismaError(code: string, meta: Record<string, unknown>) {
  return Object.assign(new Error(`Invalid prisma invocation (${code})`), { code, meta });
}

describe("prisma-stores", () => {
  it("F1.AC13 maps only an emailKey unique violation to EmailTakenError", async () => {
    // Pure rule: P2002 naming emailKey, by target or by driver adapter constraint, is a match.
    expect(isEmailKeyViolation(prismaError("P2002", { target: ["emailKey"] }))).toBe(true);
    expect(isEmailKeyViolation(prismaError("P2002", { target: "User_emailKey_key" }))).toBe(true);
    expect(
      isEmailKeyViolation(
        prismaError("P2002", {
          driverAdapterError: { kind: "UniqueConstraintViolation", constraint: { fields: ["emailKey"] } },
        }),
      ),
    ).toBe(true);

    // Other unique violations, other codes, and non-errors are not email key violations.
    expect(isEmailKeyViolation(prismaError("P2002", { target: ["id"] }))).toBe(false);
    expect(isEmailKeyViolation(prismaError("P2002", { target: ["email"] }))).toBe(false);
    expect(isEmailKeyViolation(prismaError("P2025", { target: ["emailKey"] }))).toBe(false);
    expect(isEmailKeyViolation(prismaError("P2002", {}))).toBe(false);
    expect(isEmailKeyViolation(new Error("emailKey"))).toBe(false);
    expect(isEmailKeyViolation("P2002")).toBe(false);
    expect(isEmailKeyViolation(null)).toBe(false);

    // Through the store: an emailKey violation becomes EmailTakenError.
    const dupDb = {
      user: {
        create: vi.fn().mockRejectedValue(prismaError("P2002", { target: ["emailKey"] })),
      },
    } as unknown as Db;
    const store = createUserStore(dupDb);
    await expect(
      store.create({ email: "a@example.com", emailKey: "a@example.com", passwordHash: "h" }),
    ).rejects.toBeInstanceOf(EmailTakenError);

    // Through the store: any other error is rethrown unchanged.
    const other = new Error("disk I/O error");
    const failDb = { user: { create: vi.fn().mockRejectedValue(other) } } as unknown as Db;
    await expect(
      createUserStore(failDb).create({ email: "a@example.com", emailKey: "a@example.com", passwordHash: "h" }),
    ).rejects.toBe(other);
  });

  it("F1.AC13 user store reads and creates with parameters only", async () => {
    const row = {
      id: "u1",
      email: "a@example.com",
      emailKey: "a@example.com",
      passwordHash: "h",
      createdAt: new Date(0),
    };
    const findUnique = vi.fn().mockResolvedValue(row);
    const create = vi.fn().mockResolvedValue(row);
    const db = { user: { findUnique, create } } as unknown as Db;
    const store = createUserStore(db);

    await expect(store.findByEmailKey("a@example.com")).resolves.toEqual({
      id: "u1",
      email: "a@example.com",
      emailKey: "a@example.com",
      passwordHash: "h",
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { emailKey: "a@example.com" } });

    await store.create({ email: "a@example.com", emailKey: "a@example.com", passwordHash: "h" });
    expect(create).toHaveBeenCalledWith({
      data: { email: "a@example.com", emailKey: "a@example.com", passwordHash: "h" },
    });
  });

  it("F1.R7 session store inserts, finds and deletes by hash with parameters", async () => {
    const insert = vi.fn().mockResolvedValue({ id: "hash1", userId: "u1", createdAt: new Date(0) });
    const findUnique = vi.fn().mockResolvedValue({ id: "hash1", userId: "u1" });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { session: { create: insert, findUnique, deleteMany } } as unknown as Db;
    const store = createSessionStore(db);

    await store.insert({ id: "hash1", userId: "u1" });
    expect(insert).toHaveBeenCalledWith({ data: { id: "hash1", userId: "u1" } });

    await expect(store.findByHash("hash1")).resolves.toEqual({ id: "hash1", userId: "u1" });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "hash1" },
      select: { id: true, userId: true },
    });

    await store.deleteByHash("hash1");
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "hash1" } });
  });
});
