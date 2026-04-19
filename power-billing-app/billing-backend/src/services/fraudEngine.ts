import { FastifyBaseLogger } from "fastify";
import { config } from "../config.js";
import { FraudEvent, Meter, Reading } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";
import { detectFraud } from "./fraud.js";
import { processNonUsageAlert } from "./nonUsage.js";
import { processPowerSpike } from "./powerSpike.js";
import { logInvalidReading, validateReadingValue } from "./readingValidation.js";
import { validateRegionalMismatch } from "./regionValidation.js";
import { detectSeasonalReplayFraud, logSeasonalReplayAlert } from "./seasonalFraud.js";
import { logDuplicateSessionFraud } from "./sessionFraud.js";

export type FraudEngineInput = {
  meterId: string;
  timestamp: string;
  reading?: {
    kwh: number;
    voltage: number;
    current: number;
    source: "iot" | "manual";
  };
  powerSampleKw?: number;
  session?: {
    sessionId: string;
    startTime: string;
    endTime: string;
    regionId: string;
  };
  regionCheck?: {
    regionId: string;
    latitude: number;
    longitude: number;
  };
};

const createFraudEvent = async (
  meterId: string,
  eventType: FraudEvent["eventType"],
  severity: FraudEvent["severity"],
  source: string,
  payload: Record<string, unknown>
): Promise<FraudEvent> => {
  return repository.addFraudEvent({
    id: `fraud-event-${crypto.randomUUID()}`,
    meterId,
    eventType,
    severity,
    source,
    payload,
    detectedAt: new Date().toISOString()
  });
};

const isMeterTampering = (reading: Pick<Reading, "voltage" | "current">): boolean => reading.voltage < 210 && reading.current > 8;

const isBypassConnection = (reading: Pick<Reading, "kwh" | "voltage" | "current">): boolean =>
  reading.kwh === 0 && reading.voltage > 200 && reading.current > 2;

export const processFraudEngine = async (
  input: FraudEngineInput,
  meter: Meter,
  logger: FastifyBaseLogger
): Promise<{ fraudEvents: FraudEvent[]; reading?: Reading }> => {
  const fraudEvents: FraudEvent[] = [];
  let savedReading: Reading | undefined;

  if (input.session) {
    const existing = await repository.getPowerSessionById(input.session.sessionId);
    if (existing) {
      const duplicate = await repository.markPowerSessionAsDuplicate(input.session.sessionId);
      if (duplicate) {
        await logDuplicateSessionFraud(duplicate, logger);
        const event = await createFraudEvent(meter.id, "DUPLICATE_SESSION_ID", "high", "session_rule", {
          sessionId: duplicate.sessionId,
          meterId: duplicate.meterId,
          regionId: duplicate.regionId
        });
        fraudEvents.push(event);
      }
    } else {
      await repository.createPowerSession({
        sessionId: input.session.sessionId,
        meterId: meter.id,
        startTime: input.session.startTime,
        endTime: input.session.endTime,
        regionId: input.session.regionId,
        status: "ACCEPTED"
      });
    }
  }

  if (input.regionCheck) {
    const regionResult = await validateRegionalMismatch(
      {
        meterId: meter.id,
        regionId: input.regionCheck.regionId,
        latitude: input.regionCheck.latitude,
        longitude: input.regionCheck.longitude
      },
      logger
    );

    if (regionResult?.status === "REGION_REPLAY") {
      const event = await createFraudEvent(meter.id, "REGIONAL_MISMATCH", "high", "region_rule", {
        incomingRegionId: regionResult.fraudRecord.incomingRegionId,
        registeredRegionId: regionResult.fraudRecord.registeredRegionId,
        fraudRecordId: regionResult.fraudRecord.id
      });
      fraudEvents.push(event);
    }
  }

  if (input.reading) {
    const previousReading = await repository.getLatestValidReading(meter.id);
    const validation = validateReadingValue(input.reading.kwh, previousReading, config.readingMaxDeltaKwh);

    savedReading = await repository.addReading({
      id: `reading-${crypto.randomUUID()}`,
      meterId: meter.id,
      timestamp: input.timestamp,
      kwh: input.reading.kwh,
      voltage: input.reading.voltage,
      current: input.reading.current,
      source: input.reading.source,
      status: validation.status
    });

    if (validation.status === "INVALID") {
      await logInvalidReading(meter.id, savedReading, previousReading, config.readingMaxDeltaKwh, validation.errorCodes, logger);
    } else {
      const historicalReadings = await repository.listHistoricalReadingsBefore(meter.id, input.timestamp);
      const alert = detectFraud(meter.id, savedReading, historicalReadings, config.billing);
      if (alert) {
        await repository.addFraudAlert(alert);
        eventBus.broadcast("fraud.alert", alert);

        const event = await createFraudEvent(meter.id, "SUDDEN_CONSUMPTION_SPIKE", "high", "consumption_rule", {
          readingId: savedReading.id,
          reason: alert.reason
        });
        fraudEvents.push(event);
      }

      const seasonal = await detectSeasonalReplayFraud(meter, savedReading, config.billing);
      if (seasonal) {
        const saved = await logSeasonalReplayAlert(seasonal, logger);
        const event = await createFraudEvent(meter.id, "SEASONAL_REPLAY", "medium", "seasonal_rule", {
          fraudLogId: saved.id,
          season: saved.season,
          expectedKwh: saved.expectedKwh,
          observedKwh: saved.observedKwh
        });
        fraudEvents.push(event);
      }

      const nonUsage = await processNonUsageAlert(meter, input.timestamp, logger);
      if (nonUsage) {
        const event = await createFraudEvent(meter.id, "NON_USAGE", nonUsage.severity, "non_usage_rule", {
          alertId: nonUsage.id,
          reason: nonUsage.reason
        });
        fraudEvents.push(event);
      }

      if (isMeterTampering(savedReading)) {
        const event = await createFraudEvent(meter.id, "METER_TAMPERING", "high", "electrical_pattern_rule", {
          readingId: savedReading.id,
          voltage: savedReading.voltage,
          current: savedReading.current
        });
        fraudEvents.push(event);
      }

      if (isBypassConnection(savedReading)) {
        const event = await createFraudEvent(meter.id, "BYPASS_CONNECTION", "high", "bypass_rule", {
          readingId: savedReading.id,
          kwh: savedReading.kwh,
          voltage: savedReading.voltage,
          current: savedReading.current
        });
        fraudEvents.push(event);
      }
    }
  }

  if (input.powerSampleKw !== undefined) {
    const threshold = await repository.getSpikeThreshold(meter.id);
    const thresholdKw = threshold?.thresholdKw ?? config.defaultPowerSpikeKw;
    const spike = await processPowerSpike(
      { meterId: meter.id, timestamp: input.timestamp, powerKw: input.powerSampleKw },
      thresholdKw,
      logger
    );

    if (spike) {
      const event = await createFraudEvent(meter.id, "SUDDEN_CONSUMPTION_SPIKE", "high", "power_sample_rule", {
        spikeId: spike.id,
        powerKw: spike.powerKw,
        thresholdKw: spike.thresholdKw
      });
      fraudEvents.push(event);
    }
  }

  if (fraudEvents.length > 0) {
    eventBus.broadcast("fraud.engine.events", { meterId: meter.id, count: fraudEvents.length, items: fraudEvents });
  }

  return { fraudEvents, reading: savedReading };
};
