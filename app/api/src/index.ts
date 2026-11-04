import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildServer();

await app.listen({ port, host: "127.0.0.1" });
