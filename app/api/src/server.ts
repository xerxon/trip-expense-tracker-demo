import Fastify from "fastify";

export function buildServer(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
