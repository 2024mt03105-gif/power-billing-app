import "@fastify/jwt";
import { AuthUser } from "./domain.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}
