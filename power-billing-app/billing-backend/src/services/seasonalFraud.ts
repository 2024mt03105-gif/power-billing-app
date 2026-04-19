import { FastifyBaseLogger } from "fastify";
import { BillingConfig, FraudLogEvent, Meter, Reading, SeasonName } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";

const monthToSeason = (month: number): SeasonName => {
  if (month >= 3 && month <= 6) return "Summer";
  if (month >= 7 && month <= 10) return "Monsoon";
  return "Winter";
};

const extractRegionFromMeter = (meter: Meter): string => {
  const [region] = meter.location.split("/");
  const normalized = region.trim();
  return normalized.length > 0 ? normalized : meter.location.trim();
};

export const determineSeason = (timestampIso: string): SeasonName => {
  const month = new Date(timestampIso).getUTCMonth() + 1;
  return monthToSeason(month);
};

export const detectSeasonalReplayFraud = async (
  meter: Meter,
  reading: Reading,
  config: BillingConfig
): Promise<FraudLogEvent | null> => {
  const season = determineSeason(reading.timestamp);
  const regionId = extractRegionFromMeter(meter);
  const seasonalProfile = await repository.getSeasonalProfile(regionId, season);

  if (!seasonalProfile) {
    return null;
  }

  const expected = seasonalProfile.avgConsumptionKwh;
  if (expected < config.seasonalMinExpectedKwh) {
    return null;
  }

  if (reading.kwh >= expected * config.seasonalReplayThreshold) {
    return null;
  }

  return {
    id: `fraud-seasonal-${crypto.randomUUID()}`,
    meterId: meter.id,
    readingId: reading.id,
    regionId,
    season,
    observedKwh: reading.kwh,
    expectedKwh: expected,
    thresholdPercent: config.seasonalReplayThreshold,
    fraudType: "seasonal_replay",
    message: `Observed ${reading.kwh.toFixed(2)} kWh is below ${(config.seasonalReplayThreshold * 100).toFixed(0)}% of expected seasonal average ${expected.toFixed(2)} kWh`,
    detectedAt: new Date().toISOString()
  };
};

export const logSeasonalReplayAlert = async (
  event: FraudLogEvent,
  logger: FastifyBaseLogger
): Promise<FraudLogEvent> => {
  const saved = await repository.addFraudLogEvent(event);

  logger.warn(
    {
      fraudLogId: saved.id,
      meterId: saved.meterId,
      readingId: saved.readingId,
      regionId: saved.regionId,
      season: saved.season,
      expectedKwh: saved.expectedKwh,
      observedKwh: saved.observedKwh
    },
    "Seasonal replay fraud detected"
  );

  eventBus.broadcast("fraud.seasonal_replay", saved);
  return saved;
};
