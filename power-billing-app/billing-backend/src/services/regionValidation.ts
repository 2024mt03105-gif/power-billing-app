import { FastifyBaseLogger } from "fastify";
import { MeterRegionRegistration, RegionReplayFraudRecord } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";

export type RegionalValidationInput = {
  meterId: string;
  regionId: string;
  latitude: number;
  longitude: number;
};

export type RegionalValidationResult =
  | { status: "VALID"; registration: MeterRegionRegistration }
  | { status: "REGION_REPLAY"; registration: MeterRegionRegistration; fraudRecord: RegionReplayFraudRecord };

export const validateRegionalMismatch = async (
  payload: RegionalValidationInput,
  logger: FastifyBaseLogger
): Promise<RegionalValidationResult | null> => {
  const registration = await repository.getMeterRegionRegistration(payload.meterId);
  if (!registration) {
    return null;
  }

  if (registration.regionId === payload.regionId) {
    return { status: "VALID", registration };
  }

  const fraudRecord: RegionReplayFraudRecord = {
    id: `fraud-region-${crypto.randomUUID()}`,
    meterId: payload.meterId,
    incomingRegionId: payload.regionId,
    registeredRegionId: registration.regionId,
    incomingLatitude: payload.latitude,
    incomingLongitude: payload.longitude,
    eventType: "REGION_REPLAY",
    message: `Incoming region ${payload.regionId} does not match registered region ${registration.regionId}`,
    detectedAt: new Date().toISOString()
  };

  const savedRecord = await repository.addRegionReplayFraudRecord(fraudRecord);

  logger.error(
    {
      eventType: savedRecord.eventType,
      meterId: savedRecord.meterId,
      incomingRegionId: savedRecord.incomingRegionId,
      registeredRegionId: savedRecord.registeredRegionId,
      fraudRecordId: savedRecord.id
    },
    "Regional mismatch detected"
  );

  eventBus.broadcast("admin.notification", {
    type: "REGION_REPLAY",
    meterId: savedRecord.meterId,
    incomingRegionId: savedRecord.incomingRegionId,
    registeredRegionId: savedRecord.registeredRegionId,
    message: savedRecord.message,
    detectedAt: savedRecord.detectedAt
  });

  eventBus.broadcast("fraud.region_replay", savedRecord);

  return {
    status: "REGION_REPLAY",
    registration,
    fraudRecord: savedRecord
  };
};
