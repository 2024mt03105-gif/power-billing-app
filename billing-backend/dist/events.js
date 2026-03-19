const subscribers = new Map();
export const eventBus = {
    subscribe(reply) {
        const id = crypto.randomUUID();
        const subscriber = {
            id,
            send(event, payload) {
                reply.raw.write(`event: ${event}\n`);
                reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
            },
            close() {
                subscribers.delete(id);
            }
        };
        subscribers.set(id, subscriber);
        return subscriber;
    },
    broadcast(event, payload) {
        subscribers.forEach((subscriber) => subscriber.send(event, payload));
    },
    heartbeat() {
        subscribers.forEach((subscriber) => subscriber.send("heartbeat", { timestamp: new Date().toISOString() }));
    }
};
