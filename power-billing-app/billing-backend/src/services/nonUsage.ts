import { FastifyBaseLogger } from "fastify";
import { Meter, NonUsageAlert } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";

export const detectNonUsage = async (meterId: string, asOfTimestamp: string): Promise<boolean> => {
  const stats = await repository.getNonUsageWindowStats(meterId, asOfTimestamp);
  if (!stats) {
    return false;
  }

  return (
    stats.sampleCount > 0 &&
    stats.positiveCount === 0 &&
    stats.voltagePresentCount > 0 &&
    stats.hoursSinceFirstZero > 24
  );
};

export const processNonUsageAlert = async (
  meter: Meter,
  asOfTimestamp: string,
  logger: FastifyBaseLogger
): Promise<NonUsageAlert | null> => {
  const isNonUsage = await detectNonUsage(meter.id, asOfTimestamp);
  if (!isNonUsage) {
    return null;
  }

  if (meter.status === "NON_USAGE") {
    return null;
  }

  await repository.updateMeterStatus(meter.id, "NON_USAGE");

  const alert: NonUsageAlert = {
    id: `alert-non-usage-${crypto.randomUUID()}`,
    meterId: meter.id,
    severity: "medium",
    reason: "Zero consumption for more than 24 hours while voltage is present",
    detectedAt: new Date().toISOString()
  };

  const saved = await repository.addNonUsageAlert(alert);

  logger.warn(
    {
      meterId: meter.id,
      status: "NON_USAGE",
      alertId: saved.id
    },
    "Non-usage condition detected"
  );

  eventBus.broadcast("meter.non_usage", {
    meterId: meter.id,
    status: "NON_USAGE",
    detectedAt: saved.detectedAt,
    message: saved.reason
  });

  eventBus.broadcast("admin.notification", {
    type: "NON_USAGE",
    meterId: meter.id,
    severity: saved.severity,
    message: saved.reason,
    detectedAt: saved.detectedAt
  });

  return saved;
};
