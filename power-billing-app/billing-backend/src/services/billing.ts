import { BillingConfig, BillingPeriod, Reading } from "../domain.js";

const round = (value: number): number => Math.round(value * 100) / 100;

export const calculateMonthlyBill = (
  meterId: string,
  month: string,
  monthlyReadings: Reading[],
  config: BillingConfig
): BillingPeriod => {
  const totalKwh = monthlyReadings.reduce((sum, reading) => sum + reading.kwh, 0);
  const energyCharge = round(totalKwh * config.unitRate);
  const taxes = round(energyCharge * config.taxRate);
  const totalAmount = round(energyCharge + config.fixedCharge + taxes);

  return {
    month,
    meterId,
    totalKwh: round(totalKwh),
    unitRate: config.unitRate,
    energyCharge,
    fixedCharge: config.fixedCharge,
    taxes,
    totalAmount
  };
};

export const filterReadingsForMonth = (readings: Reading[], month: string): Reading[] =>
  readings.filter((reading) => reading.timestamp.startsWith(month));

export const buildConsumptionTrend = (readings: Reading[]) => {
  const buckets = new Map<string, number>();

  readings.forEach((reading) => {
    const day = reading.timestamp.slice(0, 10);
    buckets.set(day, round((buckets.get(day) ?? 0) + reading.kwh));
  });

  return Array.from(buckets.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, totalKwh]) => ({ day, totalKwh }));
};
