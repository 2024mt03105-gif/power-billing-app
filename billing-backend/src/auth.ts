import { FastifyReply, FastifyRequest } from "fastify";
import { AuthUser, UserRole } from "./domain.js";

export const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ message: "Authentication required" });
  }
};

export const requireRoles = (...roles: UserRole[]) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as AuthUser | undefined;

    if (!user || !roles.includes(user.role)) {
      reply.code(403).send({ message: "You do not have access to this resource" });
    }
  };
};

export const getAuthUser = (request: FastifyRequest): AuthUser => request.user as AuthUser;
