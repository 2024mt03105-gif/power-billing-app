export const authenticate = async (request, reply) => {
    try {
        await request.jwtVerify();
    }
    catch {
        reply.code(401).send({ message: "Authentication required" });
    }
};
export const requireRoles = (...roles) => {
    return async (request, reply) => {
        const user = request.user;
        if (!user || !roles.includes(user.role)) {
            reply.code(403).send({ message: "You do not have access to this resource" });
        }
    };
};
export const getAuthUser = (request) => request.user;
