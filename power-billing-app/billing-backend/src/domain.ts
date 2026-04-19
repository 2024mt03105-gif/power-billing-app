export type MeterStatus = "active" | "investigation" | "disconnected";
export type ReadingSource = "iot" | "manual";
export type UserRole = "admin" | "customer";

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
