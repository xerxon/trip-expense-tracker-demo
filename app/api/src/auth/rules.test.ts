import { describe, expect, it } from "vitest";
import {
  EMAIL_ERROR,
  PASSWORD_ERROR,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "./rules.js";

describe("F1.AC2 password rule (F1.R3)", () => {
  it("F1.AC2 rejects 7 characters and accepts 8, including 8 spaces", () => {
    expect(validatePassword("abcdefg")).toBe(PASSWORD_ERROR);
    expect(validatePassword("abcdefgh")).toBeNull();
    expect(validatePassword("        ")).toBeNull();
  });
});

describe("F1.AC4 email normalizer (F1.R2)", () => {
  it("F1.AC4 normalizer trims and lower-cases the email", () => {
    expect(normalizeEmail("  Sam@Example.com ")).toBe("sam@example.com");
  });
});

describe("F1.AC16 email validator (F1.R1)", () => {
  it("F1.AC16 rejects malformed emails and accepts a 254-character address", () => {
    // No @
    expect(validateEmail("samexample.com")).toBe(EMAIL_ERROR);
    // Two @
    expect(validateEmail("sam@@example.com")).toBe(EMAIL_ERROR);
    expect(validateEmail("sam@exa@mple.com")).toBe(EMAIL_ERROR);
    // A space
    expect(validateEmail("sam smith@example.com")).toBe(EMAIL_ERROR);
    // No dot in the domain part
    expect(validateEmail("sam@example")).toBe(EMAIL_ERROR);
    // Missing text on one side of the @
    expect(validateEmail("@example.com")).toBe(EMAIL_ERROR);
    expect(validateEmail("sam@")).toBe(EMAIL_ERROR);

    // 254 characters is valid: 64 + "@" + 189 = 254
    const local = "a".repeat(64);
    const domain254 = `${"b".repeat(185)}.com`;
    const address254 = `${local}@${domain254}`;
    expect(address254.length).toBe(254);
    expect(validateEmail(address254)).toBeNull();

    // 255 characters is rejected
    const address255 = `${local}@${"b".repeat(186)}.com`;
    expect(address255.length).toBe(255);
    expect(validateEmail(address255)).toBe(EMAIL_ERROR);
  });
});
