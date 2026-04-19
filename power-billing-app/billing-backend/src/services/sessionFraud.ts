import { FastifyBaseLogger } from "fastify";
import { PowerSession, SessionFraudEvent } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";

export const logDuplicateSessionFraud = async (
  session: PowerSession,
  logger: FastifyBaseLogger
): Promise<SessionFraudEvent> => {
  const fraudEvent: SessionFraudEvent = {
    id: `session-fraud-${crypto.randomUUID()}`,
    sessionId: session.sessionId,
    meterId: session.meterId,
    regionId: session.regionId,
    reason: `Duplicate session ID detected: ${session.sessionId}`,
    detectedAt: new Date().toISOString()
  };

  const savedEvent = await repository.addSessionFraudEvent(fraudEvent);

  logger.warn(
    {
      sessionId: session.sessionId,
      meterId: session.meterId,
      regionId: session.regionId,
      fraudEventId: savedEvent.id
    },
    "Duplicate session detected"
  );

  eventBus.broadcast("session.duplicate", {
    sessionId: session.sessionId,
    meterId: session.meterId,
    regionId: session.regionId,
    status: session.status,
    fraudEventId: savedEvent.id,
    detectedAt: savedEvent.detectedAt
  });

  return savedEvent;
};
