import { FastifyBaseLogger } from "fastify";
import { Reading, ReadingValidationError } from "../domain.js";
import { eventBus } from "../events.js";
import { repository } from "../repository.js";

type ValidationRuleCode = "NEGATIVE_READING" | "REGRESSION_READING" | "EXCEEDS_EXPECTED_THRESHOLD";

type ReadingValidationResult = {
  status: "VALID" | "INVALID";
  errorCodes: ValidationRuleCode[];
  message: string | null;
};

export const validateReadingValue = (
  currentKwh: number,
  previousReading: Reading | null,
  thresholdKwh: number
): ReadingValidationResult => {
  const errorCodes: ValidationRuleCode[] = [];

  if (currentKwh < 0) {
    errorCodes.push("NEGATIVE_READING");
  }

  if (previousReading && currentKwh < previousReading.kwh) {
    errorCodes.push("REGRESSION_READING");
  }

  if (previousReading) {
    const delta = currentKwh - previousReading.kwh;
    if (delta > thresholdKwh) {
      errorCodes.push("EXCEEDS_EXPECTED_THRESHOLD");
    }
  } else if (currentKwh > thresholdKwh) {
    errorCodes.push("EXCEEDS_EXPECTED_THRESHOLD");
  }

  if (errorCodes.length === 0) {
    return { status: "VALID", errorCodes: [], message: null };
  }

  return {
    status: "INVALID",
    errorCodes,
    message: `Reading marked INVALID due to: ${errorCodes.join(", ")}`
  };
};

export const logInvalidReading = async (
  meterId: string,
  reading: Reading,
  previousReading: Reading | null,
  thresholdKwh: number,
  errorCodes: string[],
  logger: FastifyBaseLogger
): Promise<ReadingValidationError> => {
  const errorRecord: ReadingValidationError = {
    id: `reading-validation-${crypto.randomUUID()}`,
    meterId,
    readingId: reading.id,
    previousReadingId: previousReading?.id ?? null,
    previousKwh: previousReading?.kwh ?? null,
    currentKwh: reading.kwh,
    thresholdKwh,
    errorCodes,
    message: `Invalid reading ${reading.kwh.toFixed(2)} kWh for meter ${meterId}`,
    detectedAt: new Date().toISOString()
  };

  const saved = await repository.addReadingValidationError(errorRecord);

  logger.error(
    {
      meterId,
      readingId: reading.id,
      previousReadingId: previousReading?.id ?? null,
      errorCodes: saved.errorCodes,
      thresholdKwh
    },
    "Reading validation failed"
  );

  eventBus.broadcast("reading.invalid", saved);
  eventBus.broadcast("admin.notification", {
    type: "INVALID_READING",
    meterId,
    readingId: reading.id,
    errorCodes: saved.errorCodes,
    message: saved.message,
    detectedAt: saved.detectedAt
  });

  return saved;
};
