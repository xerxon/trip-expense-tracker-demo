import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("server", () => {
  const apps: ReturnType<typeof buildServer>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("GET /health returns 200 with status ok", async () => {
    const app = buildServer({ logger: false });
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
