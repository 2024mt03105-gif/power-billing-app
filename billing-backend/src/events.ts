import { FastifyReply } from "fastify";

type Subscriber = {
  id: string;
  send: (event: string, payload: unknown) => void;
  close: () => void;
};

const subscribers = new Map<string, Subscriber>();

export const eventBus = {
  subscribe(reply: FastifyReply): Subscriber {
    const id = crypto.randomUUID();
    const subscriber: Subscriber = {
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
  broadcast(event: string, payload: unknown): void {
    subscribers.forEach((subscriber) => subscriber.send(event, payload));
  },
  heartbeat(): void {
    subscribers.forEach((subscriber) => subscriber.send("heartbeat", { timestamp: new Date().toISOString() }));
  }
};
