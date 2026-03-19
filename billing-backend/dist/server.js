import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { config } from "./config.js";
import { closeDatabase, initializeDatabase } from "./db.js";
import { eventBus } from "./events.js";
import { repository } from "./repository.js";
import { registerRoutes } from "./routes.js";
const app = Fastify({
    logger: true
});
await app.register(cors, {
    origin: config.frontendOrigin
});
await app.register(jwt, {
    secret: config.jwtSecret
});
await initializeDatabase();
if (config.seedDemoData) {
    await repository.seed();
}
await registerRoutes(app);
const heartbeatInterval = setInterval(() => {
    eventBus.heartbeat();
}, 30_000);
app.addHook("onClose", async () => {
    clearInterval(heartbeatInterval);
    await closeDatabase();
});
try {
    await app.listen({
        port: config.port,
        host: "0.0.0.0"
    });
}
catch (error) {
    app.log.error(error);
    process.exit(1);
}
