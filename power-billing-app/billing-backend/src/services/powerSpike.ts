import { FastifyBaseLogger } from "fastify";
import { PowerSample, SpikeEvent } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";

export const detectPowerSpike = (
  sample: PowerSample,
  thresholdKw: number
): Omit<SpikeEvent, "id" | "detectedAt"> | null => {
  if (sample.powerKw <= thresholdKw) {
    return null;
  }

  return {
    meterId: sample.meterId,
    powerKw: sample.powerKw,
    thresholdKw,
    excessKw: Number((sample.powerKw - thresholdKw).toFixed(4)),
    sampleTime: sample.timestamp,
    eventType: "POWER_SPIKE"
  };
};

export const processPowerSpike = async (
  sample: PowerSample,
  thresholdKw: number,
  logger: FastifyBaseLogger
): Promise<SpikeEvent | null> => {
  const candidate = detectPowerSpike(sample, thresholdKw);
  if (!candidate) {
    return null;
  }

  const spikeEvent: SpikeEvent = {
    id: `spike-${crypto.randomUUID()}`,
    detectedAt: new Date().toISOString(),
    ...candidate
  };

  const saved = await repository.addSpikeEvent(spikeEvent);

  logger.warn(
    {
      meterId: saved.meterId,
      powerKw: saved.powerKw,
      thresholdKw: saved.thresholdKw,
      spikeId: saved.id
    },
    "Real-time power spike detected"
  );

  eventBus.broadcast("spike.alert", saved);
  return saved;
};
