export type MeterStatus = "active" | "investigation" | "disconnected" | "NON_USAGE";
export type ReadingSource = "iot" | "manual";
export type UserRole = "admin" | "customer";
export type PowerSessionStatus = "ACCEPTED" | "DUPLICATE";
export type SeasonName = "Summer" | "Winter" | "Monsoon";
export type RegionalValidationStatus = "VALID" | "REGION_REPLAY";
export type ReadingStatus = "VALID" | "INVALID";
export type FraudEventType =
  | "METER_TAMPERING"
  | "BYPASS_CONNECTION"
  | "DUPLICATE_SESSION_ID"
  | "SEASONAL_REPLAY"
  | "REGIONAL_MISMATCH"
  | "NON_USAGE"
  | "SUDDEN_CONSUMPTION_SPIKE";

export interface Meter {
  id: string;
  customerId: string;
  serialNumber: string;
  location: string;
  status: MeterStatus;
  installedAt: string;
}

export interface Reading {
  id: string;
  meterId: string;
  timestamp: string;
  kwh: number;
  voltage: number;
  current: number;
  source: ReadingSource;
  status?: ReadingStatus;
}

export interface FraudAlert {
  id: string;
  meterId: string;
  readingId: string;
  severity: "medium" | "high";
  reason: string;
  detectedAt: string;
}

export interface BillingPeriod {
  month: string;
  meterId: string;
  totalKwh: number;
  unitRate: number;
  energyCharge: number;
  fixedCharge: number;
  taxes: number;
  totalAmount: number;
}

export interface BillingConfig {
  unitRate: number;
  fixedCharge: number;
  taxRate: number;
  fraudSpikeFactor: number;
  seasonalReplayThreshold: number;
  seasonalMinExpectedKwh: number;
}

export interface DashboardOverview {
  month: string;
  totalMeters: number;
  activeMeters: number;
  totalReadings: number;
  totalConsumption: number;
  totalAlerts: number;
}

export interface FraudInsight {
  month: string;
  severityBreakdown: Array<{ severity: "medium" | "high"; total: number }>;
  riskyMeters: Array<{ meterId: string; location: string; alertCount: number }>;
}

export interface TariffSlab {
  upto: number | null; // null means no upper cap
  rate: number;
}

export interface TariffPlan {
  id: string;
  name: string;
  slabs: TariffSlab[];
  fixedCharge: number;
  taxRate: number;
  active: boolean;
  updatedAt: string;
}

export interface BillDetail extends BillingPeriod {
  slabs: Array<{ upto: number | null; rate: number; units: number; charge: number }>;
  previousReading: Reading | null;
  currentReading: Reading | null;
  maxDemandKwh: number;
  planName: string;
  dueDate: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  customerId: string | null;
  createdAt: string;
}

export interface CustomerProfile {
  customerId: string;
  customerName: string;
  serviceNumber: string;
  address: string;
}

export interface AuthUser {
  sub: string;
  username: string;
  role: UserRole;
  customerId: string | null;
}

export interface PowerSession {
  sessionId: string;
  meterId: string;
  startTime: string;
  endTime: string;
  regionId: string;
  status: PowerSessionStatus;
  createdAt: string;
}

export interface SessionFraudEvent {
  id: string;
  sessionId: string;
  meterId: string;
  regionId: string;
  reason: string;
  detectedAt: string;
}

export interface SeasonalProfile {
  regionId: string;
  season: SeasonName;
  avgConsumptionKwh: number;
  updatedAt: string;
}

export interface FraudLogEvent {
  id: string;
  meterId: string;
  readingId: string;
  regionId: string;
  season: SeasonName;
  observedKwh: number;
  expectedKwh: number;
  thresholdPercent: number;
  fraudType: "seasonal_replay";
  message: string;
  detectedAt: string;
}

export interface MeterRegionRegistration {
  meterId: string;
  regionId: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface RegionReplayFraudRecord {
  id: string;
  meterId: string;
  incomingRegionId: string;
  registeredRegionId: string;
  incomingLatitude: number;
  incomingLongitude: number;
  eventType: "REGION_REPLAY";
  message: string;
  detectedAt: string;
}

export interface PowerSample {
  meterId: string;
  timestamp: string;
  powerKw: number;
}

export interface SpikeThreshold {
  meterId: string;
  thresholdKw: number;
  updatedAt: string;
}

export interface SpikeEvent {
  id: string;
  meterId: string;
  powerKw: number;
  thresholdKw: number;
  excessKw: number;
  sampleTime: string;
  detectedAt: string;
  eventType: "POWER_SPIKE";
}

export interface NonUsageWindowStats {
  meterId: string;
  firstTs: string | null;
  lastTs: string | null;
  sampleCount: number;
  positiveCount: number;
  voltagePresentCount: number;
  hoursSinceFirstZero: number;
}

export interface NonUsageAlert {
  id: string;
  meterId: string;
  severity: "medium" | "high";
  reason: string;
  detectedAt: string;
}

export interface ReadingValidationError {
  id: string;
  meterId: string;
  readingId: string;
  previousReadingId: string | null;
  previousKwh: number | null;
  currentKwh: number;
  thresholdKwh: number;
  errorCodes: string[];
  message: string;
  detectedAt: string;
}

export interface FraudEvent {
  id: string;
  meterId: string;
  eventType: FraudEventType;
  severity: "medium" | "high";
  source: string;
  payload: Record<string, unknown>;
  detectedAt: string;
}

export interface ConsumptionSession {
  sessionId: string;
  meterId: string;
  startTime: string;
  endTime: string | null;
  totalEnergy: number;
  peakPower: number;
  regionId: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}
