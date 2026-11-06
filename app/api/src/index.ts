import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildServer } from "./server.js";

// Local settings live in app/api/.env. Load it when the file exists, before anything reads
// the environment. Variables already set in the environment win, and a missing file is fine,
// because production may set the variables directly.
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const port = Number(process.env.PORT ?? 3000);

// SESSION_SECRET signs the session cookie (F1.R6). No default: refuse to start without it.
// The value is never logged.
const sessionSecret = process.env.SESSION_SECRET;
if (sessionSecret === undefined || sessionSecret === "") {
  throw new Error("SESSION_SECRET is not set. Add it to the environment before starting the API.");
}

const app = buildServer({
  auth: {
    cookieSecret: sessionSecret,
    // Secure cookies in production only, so local development over http still works.
    secureCookies: process.env.NODE_ENV === "production",
  },
});

await app.listen({ port, host: "127.0.0.1" });
