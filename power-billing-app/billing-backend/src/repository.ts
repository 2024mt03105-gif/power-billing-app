import { ConsumptionSession, CustomerProfile, DashboardOverview, FraudAlert, FraudEvent, FraudInsight, FraudLogEvent, Meter, MeterRegionRegistration, NonUsageAlert, NonUsageWindowStats, PowerSession, Reading, ReadingValidationError, RegionReplayFraudRecord, SeasonName, SeasonalProfile, SessionFraudEvent, SpikeEvent, SpikeThreshold, TariffPlan, TariffSlab, User } from "./domain.js";
import { sql } from "./db.js";
import bcrypt from "bcryptjs";

const toMeter = (row: Record<string, unknown>): Meter => ({
  id: String(row.id),
  customerId: String(row.customer_id),
  serialNumber: String(row.serial_number),
  location: String(row.location),
  status: row.status as Meter["status"],
  installedAt: new Date(String(row.installed_at)).toISOString()
});

const toReading = (row: Record<string, unknown>): Reading => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  timestamp: new Date(String(row.timestamp)).toISOString(),
  kwh: Number(row.kwh),
  voltage: Number(row.voltage),
  current: Number(row.current),
  source: row.source as Reading["source"],
  status: row.status as Reading["status"]
});

const toAlert = (row: Record<string, unknown>): FraudAlert => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  readingId: String(row.reading_id),
  severity: row.severity as FraudAlert["severity"],
  reason: String(row.reason),
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toUser = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  username: String(row.username),
  passwordHash: String(row.password_hash),
  role: row.role as User["role"],
  customerId: row.customer_id ? String(row.customer_id) : null,
  createdAt: new Date(String(row.created_at)).toISOString()
});

const toPlan = (row: Record<string, unknown>): TariffPlan => ({
  id: String(row.id),
  name: String(row.name),
  slabs: row.slabs as TariffSlab[],
  fixedCharge: Number(row.fixed_charge),
  taxRate: Number(row.tax_rate),
  active: Boolean(row.active),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const toCustomerProfile = (row: Record<string, unknown>): CustomerProfile => ({
  customerId: String(row.customer_id),
  customerName: String(row.customer_name),
  serviceNumber: String(row.service_number),
  address: String(row.address)
});

const toPowerSession = (row: Record<string, unknown>): PowerSession => ({
  sessionId: String(row.session_id),
  meterId: String(row.meter_id),
  startTime: new Date(String(row.start_time)).toISOString(),
  endTime: new Date(String(row.end_time)).toISOString(),
  regionId: String(row.region_id),
  status: row.status as PowerSession["status"],
  createdAt: new Date(String(row.created_at)).toISOString()
});

const toSessionFraudEvent = (row: Record<string, unknown>): SessionFraudEvent => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  meterId: String(row.meter_id),
  regionId: String(row.region_id),
  reason: String(row.reason),
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toSeasonalProfile = (row: Record<string, unknown>): SeasonalProfile => ({
  regionId: String(row.region_id),
  season: row.season as SeasonName,
  avgConsumptionKwh: Number(row.avg_consumption_kwh),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const toFraudLogEvent = (row: Record<string, unknown>): FraudLogEvent => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  readingId: String(row.reading_id),
  regionId: String(row.region_id),
  season: row.season as SeasonName,
  observedKwh: Number(row.observed_kwh),
  expectedKwh: Number(row.expected_kwh),
  thresholdPercent: Number(row.threshold_percent),
  fraudType: row.fraud_type as FraudLogEvent["fraudType"],
  message: String(row.message),
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toMeterRegionRegistration = (row: Record<string, unknown>): MeterRegionRegistration => ({
  meterId: String(row.meter_id),
  regionId: String(row.region_id),
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const toRegionReplayFraudRecord = (row: Record<string, unknown>): RegionReplayFraudRecord => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  incomingRegionId: String(row.incoming_region_id),
  registeredRegionId: String(row.registered_region_id),
  incomingLatitude: Number(row.incoming_latitude),
  incomingLongitude: Number(row.incoming_longitude),
  eventType: row.event_type as RegionReplayFraudRecord["eventType"],
  message: String(row.message),
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toSpikeThreshold = (row: Record<string, unknown>): SpikeThreshold => ({
  meterId: String(row.meter_id),
  thresholdKw: Number(row.threshold_kw),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

const toSpikeEvent = (row: Record<string, unknown>): SpikeEvent => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  powerKw: Number(row.power_kw),
  thresholdKw: Number(row.threshold_kw),
  excessKw: Number(row.excess_kw),
  sampleTime: new Date(String(row.sample_time)).toISOString(),
  detectedAt: new Date(String(row.detected_at)).toISOString(),
  eventType: row.event_type as SpikeEvent["eventType"]
});

const toNonUsageWindowStats = (row: Record<string, unknown>, meterId: string): NonUsageWindowStats => ({
  meterId,
  firstTs: row.first_ts ? new Date(String(row.first_ts)).toISOString() : null,
  lastTs: row.last_ts ? new Date(String(row.last_ts)).toISOString() : null,
  sampleCount: Number(row.sample_count),
  positiveCount: Number(row.positive_count),
  voltagePresentCount: Number(row.voltage_present_count),
  hoursSinceFirstZero: Number(row.hours_since_first_zero)
});

const toNonUsageAlert = (row: Record<string, unknown>): NonUsageAlert => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  severity: row.severity as NonUsageAlert["severity"],
  reason: String(row.reason),
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toReadingValidationError = (row: Record<string, unknown>): ReadingValidationError => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  readingId: String(row.reading_id),
  previousReadingId: row.previous_reading_id ? String(row.previous_reading_id) : null,
  previousKwh: row.previous_kwh === null || row.previous_kwh === undefined ? null : Number(row.previous_kwh),
  currentKwh: Number(row.current_kwh),
  thresholdKwh: Number(row.threshold_kwh),
  errorCodes: Array.isArray(row.error_codes) ? (row.error_codes as string[]) : [],
  message: String(row.message),
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toFraudEvent = (row: Record<string, unknown>): FraudEvent => ({
  id: String(row.id),
  meterId: String(row.meter_id),
  eventType: row.event_type as FraudEvent["eventType"],
  severity: row.severity as FraudEvent["severity"],
  source: String(row.source),
  payload: row.payload as Record<string, unknown>,
  detectedAt: new Date(String(row.detected_at)).toISOString()
});

const toConsumptionSession = (row: Record<string, unknown>): ConsumptionSession => ({
  sessionId: String(row.session_id),
  meterId: String(row.meter_id),
  startTime: new Date(String(row.start_time)).toISOString(),
  endTime: row.end_time ? new Date(String(row.end_time)).toISOString() : null,
  totalEnergy: Number(row.total_energy),
  peakPower: Number(row.peak_power),
  regionId: String(row.region_id),
  status: row.status as ConsumptionSession["status"],
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString()
});

export const repository = {
  async listMeters(customerId?: string | null): Promise<Meter[]> {
    const rows = customerId
      ? await sql`select * from meters where customer_id = ${customerId} order by installed_at desc`
      : await sql`select * from meters order by installed_at desc`;
    return rows.map((row) => toMeter(row));
  },

  async getMeter(meterId: string): Promise<Meter | null> {
    const rows = await sql`select * from meters where id = ${meterId} limit 1`;
    return rows[0] ? toMeter(rows[0]) : null;
  },

  async saveMeter(meter: Meter): Promise<Meter> {
    const rows = await sql`
      insert into meters (id, customer_id, serial_number, location, status, installed_at)
      values (${meter.id}, ${meter.customerId}, ${meter.serialNumber}, ${meter.location}, ${meter.status}, ${meter.installedAt})
      returning *
    `;
    return toMeter(rows[0]);
  },

  async addReading(reading: Reading): Promise<Reading> {
    const rows = await sql`
      insert into readings (id, meter_id, timestamp, kwh, voltage, current, source, status)
      values (${reading.id}, ${reading.meterId}, ${reading.timestamp}, ${reading.kwh}, ${reading.voltage}, ${reading.current}, ${reading.source}, ${reading.status ?? "VALID"})
      returning *
    `;
    return toReading(rows[0]);
  },

  async listReadings(meterId: string): Promise<Reading[]> {
    const rows = await sql`
      select * from readings
      where meter_id = ${meterId}
      order by timestamp desc
    `;
    return rows.map((row) => toReading(row));
  },

  async getReadingById(readingId: string): Promise<Reading | null> {
    const rows = await sql`select * from readings where id = ${readingId} limit 1`;
    return rows[0] ? toReading(rows[0]) : null;
  },

  async listBillingMonths(meterId: string, limit = 12): Promise<string[]> {
    const rows = await sql`
      select to_char(timestamp at time zone 'UTC', 'YYYY-MM') as month
      from readings
      where meter_id = ${meterId}
      group by month
      order by month desc
      limit ${limit}
    `;
    return rows.map((row) => String(row.month));
  },

  async listHistoricalReadingsBefore(meterId: string, timestamp: string): Promise<Reading[]> {
    const rows = await sql`
      select * from readings
      where meter_id = ${meterId} and timestamp < ${timestamp}
      order by timestamp desc
      limit 30
    `;
    return rows.map((row) => toReading(row));
  },

  async getLatestReading(meterId: string): Promise<Reading | null> {
    const rows = await sql`
      select * from readings
      where meter_id = ${meterId}
      order by timestamp desc
      limit 1
    `;
    return rows[0] ? toReading(rows[0]) : null;
  },

  async getLatestValidReading(meterId: string): Promise<Reading | null> {
    const rows = await sql`
      select * from readings
      where meter_id = ${meterId} and status = 'VALID'
      order by timestamp desc
      limit 1
    `;
    return rows[0] ? toReading(rows[0]) : null;
  },

  async addFraudAlert(alert: FraudAlert): Promise<FraudAlert> {
    const rows = await sql`
      insert into fraud_alerts (id, meter_id, reading_id, severity, reason, detected_at)
      values (${alert.id}, ${alert.meterId}, ${alert.readingId}, ${alert.severity}, ${alert.reason}, ${alert.detectedAt})
      returning *
    `;
    return toAlert(rows[0]);
  },

  async listFraudAlerts(meterId?: string): Promise<FraudAlert[]> {
    const rows = meterId
      ? await sql`select * from fraud_alerts where meter_id = ${meterId} order by detected_at desc`
      : await sql`select * from fraud_alerts order by detected_at desc`;
    return rows.map((row) => toAlert(row));
  },

  async getDashboardOverview(month: string, customerId?: string | null): Promise<DashboardOverview> {
    const monthStart = `${month}-01T00:00:00.000Z`;
    const monthEnd = new Date(`${month}-01T00:00:00.000Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    const meterCount = customerId
      ? await sql`
          select
            count(*)::int as total_meters,
            count(*) filter (where status = 'active')::int as active_meters
          from meters
          where customer_id = ${customerId}
        `
      : await sql`
          select
            count(*)::int as total_meters,
            count(*) filter (where status = 'active')::int as active_meters
          from meters
        `;

    const usageCount = customerId
      ? await sql`
          select
            count(r.*)::int as total_readings,
            coalesce(sum(r.kwh), 0)::float as total_consumption
          from readings r
          join meters m on m.id = r.meter_id
          where m.customer_id = ${customerId} and r.timestamp >= ${monthStart} and r.timestamp < ${monthEnd.toISOString()}
        `
      : await sql`
          select
            count(*)::int as total_readings,
            coalesce(sum(kwh), 0)::float as total_consumption
          from readings
          where timestamp >= ${monthStart} and timestamp < ${monthEnd.toISOString()}
        `;

    const alertCount = customerId
      ? await sql`
          select count(*)::int as total_alerts
          from (
            select f.meter_id, f.detected_at
            from fraud_alerts f
            join meters m on m.id = f.meter_id
            where m.customer_id = ${customerId}
              and f.detected_at >= ${monthStart}
              and f.detected_at < ${monthEnd.toISOString()}
            union all
            select e.meter_id, e.detected_at
            from fraud_events e
            join meters m on m.id = e.meter_id
            where m.customer_id = ${customerId}
              and e.detected_at >= ${monthStart}
              and e.detected_at < ${monthEnd.toISOString()}
          ) t
        `
      : await sql`
          select count(*)::int as total_alerts
          from (
            select meter_id, detected_at from fraud_alerts
            where detected_at >= ${monthStart} and detected_at < ${monthEnd.toISOString()}
            union all
            select meter_id, detected_at from fraud_events
            where detected_at >= ${monthStart} and detected_at < ${monthEnd.toISOString()}
          ) t
        `;

    return {
      month,
      totalMeters: Number(meterCount[0].total_meters),
      activeMeters: Number(meterCount[0].active_meters),
      totalReadings: Number(usageCount[0].total_readings),
      totalConsumption: Number(usageCount[0].total_consumption),
      totalAlerts: Number(alertCount[0].total_alerts)
    };
  },

  async getFraudInsights(month: string, customerId?: string | null): Promise<FraudInsight> {
    const monthStart = `${month}-01T00:00:00.000Z`;
    const monthEnd = new Date(`${month}-01T00:00:00.000Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    const severityRows = customerId
      ? await sql`
          select x.severity, count(*)::int as total
          from (
            select f.meter_id, f.severity, f.detected_at
            from fraud_alerts f
            union all
            select e.meter_id, e.severity, e.detected_at
            from fraud_events e
          ) x
          join meters m on m.id = x.meter_id
          where m.customer_id = ${customerId}
            and x.detected_at >= ${monthStart}
            and x.detected_at < ${monthEnd.toISOString()}
          group by x.severity
          order by x.severity
        `
      : await sql`
          select x.severity, count(*)::int as total
          from (
            select severity, detected_at from fraud_alerts
            union all
            select severity, detected_at from fraud_events
          ) x
          where x.detected_at >= ${monthStart}
            and x.detected_at < ${monthEnd.toISOString()}
          group by x.severity
          order by x.severity
        `;

    const riskyMeterRows = customerId
      ? await sql`
          select m.id as meter_id, m.location, count(*)::int as alert_count
          from (
            select meter_id, detected_at from fraud_alerts
            union all
            select meter_id, detected_at from fraud_events
          ) x
          join meters m on m.id = x.meter_id
          where m.customer_id = ${customerId}
            and x.detected_at >= ${monthStart}
            and x.detected_at < ${monthEnd.toISOString()}
          group by m.id, m.location
          order by alert_count desc, m.id asc
          limit 5
        `
      : await sql`
          select m.id as meter_id, m.location, count(*)::int as alert_count
          from (
            select meter_id, detected_at from fraud_alerts
            union all
            select meter_id, detected_at from fraud_events
          ) x
          join meters m on m.id = x.meter_id
          where x.detected_at >= ${monthStart}
            and x.detected_at < ${monthEnd.toISOString()}
          group by m.id, m.location
          order by alert_count desc, m.id asc
          limit 5
        `;

    return {
      month,
      severityBreakdown: severityRows.map((row) => ({
        severity: row.severity as "medium" | "high",
        total: Number(row.total)
      })),
      riskyMeters: riskyMeterRows.map((row) => ({
        meterId: String(row.meter_id),
        location: String(row.location),
        alertCount: Number(row.alert_count)
      }))
    };
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const rows = await sql`select * from users where username = ${username} limit 1`;
    return rows[0] ? toUser(rows[0]) : null;
  },

  async getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
    const rows = await sql`select * from customer_profiles where customer_id = ${customerId} limit 1`;
    return rows[0] ? toCustomerProfile(rows[0]) : null;
  },

  async getActiveTariff(): Promise<TariffPlan | null> {
    const rows = await sql`select * from tariff_plans where active = true limit 1`;
    return rows[0] ? toPlan(rows[0]) : null;
  },

  async upsertTariff(plan: TariffPlan): Promise<TariffPlan> {
    await sql`update tariff_plans set active = false`;
    const rows = await sql`
      insert into tariff_plans (id, name, slabs, fixed_charge, tax_rate, active, updated_at)
      values (${plan.id}, ${plan.name}, ${sql.json(JSON.parse(JSON.stringify(plan.slabs)))}, ${plan.fixedCharge}, ${plan.taxRate}, ${plan.active}, ${plan.updatedAt})
      on conflict (id) do update set name = excluded.name, slabs = excluded.slabs, fixed_charge = excluded.fixed_charge, tax_rate = excluded.tax_rate, active = excluded.active, updated_at = excluded.updated_at
      returning *
    `;
    return toPlan(rows[0]);
  },

  async getPowerSessionById(sessionId: string): Promise<PowerSession | null> {
    const rows = await sql`select * from power_session where session_id = ${sessionId} limit 1`;
    return rows[0] ? toPowerSession(rows[0]) : null;
  },

  async createPowerSession(session: Omit<PowerSession, "createdAt">): Promise<PowerSession> {
    const rows = await sql`
      insert into power_session (session_id, meter_id, start_time, end_time, region_id, status)
      values (${session.sessionId}, ${session.meterId}, ${session.startTime}, ${session.endTime}, ${session.regionId}, ${session.status})
      returning *
    `;
    return toPowerSession(rows[0]);
  },

  async markPowerSessionAsDuplicate(sessionId: string): Promise<PowerSession | null> {
    const rows = await sql`
      update power_session
      set status = 'DUPLICATE'
      where session_id = ${sessionId}
      returning *
    `;
    return rows[0] ? toPowerSession(rows[0]) : null;
  },

  async addSessionFraudEvent(event: SessionFraudEvent): Promise<SessionFraudEvent> {
    const rows = await sql`
      insert into session_fraud_events (id, session_id, meter_id, region_id, reason, detected_at)
      values (${event.id}, ${event.sessionId}, ${event.meterId}, ${event.regionId}, ${event.reason}, ${event.detectedAt})
      returning *
    `;
    return toSessionFraudEvent(rows[0]);
  },

  async getSeasonalProfile(regionId: string, season: SeasonName): Promise<SeasonalProfile | null> {
    const rows = await sql`
      select * from seasonal_profile
      where region_id = ${regionId} and season = ${season}
      limit 1
    `;
    return rows[0] ? toSeasonalProfile(rows[0]) : null;
  },

  async upsertSeasonalProfile(profile: SeasonalProfile): Promise<SeasonalProfile> {
    const rows = await sql`
      insert into seasonal_profile (region_id, season, avg_consumption_kwh, updated_at)
      values (${profile.regionId}, ${profile.season}, ${profile.avgConsumptionKwh}, ${profile.updatedAt})
      on conflict (region_id, season) do update set
        avg_consumption_kwh = excluded.avg_consumption_kwh,
        updated_at = excluded.updated_at
      returning *
    `;
    return toSeasonalProfile(rows[0]);
  },

  async addFraudLogEvent(event: FraudLogEvent): Promise<FraudLogEvent> {
    const rows = await sql`
      insert into fraud_log (id, meter_id, reading_id, region_id, season, observed_kwh, expected_kwh, threshold_percent, fraud_type, message, detected_at)
      values (${event.id}, ${event.meterId}, ${event.readingId}, ${event.regionId}, ${event.season}, ${event.observedKwh}, ${event.expectedKwh}, ${event.thresholdPercent}, ${event.fraudType}, ${event.message}, ${event.detectedAt})
      returning *
    `;
    return toFraudLogEvent(rows[0]);
  },

  async getMeterRegionRegistration(meterId: string): Promise<MeterRegionRegistration | null> {
    const rows = await sql`select * from meter_region_registry where meter_id = ${meterId} limit 1`;
    return rows[0] ? toMeterRegionRegistration(rows[0]) : null;
  },

  async upsertMeterRegionRegistration(registration: MeterRegionRegistration): Promise<MeterRegionRegistration> {
    const rows = await sql`
      insert into meter_region_registry (meter_id, region_id, latitude, longitude, updated_at)
      values (${registration.meterId}, ${registration.regionId}, ${registration.latitude}, ${registration.longitude}, ${registration.updatedAt})
      on conflict (meter_id) do update set
        region_id = excluded.region_id,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        updated_at = excluded.updated_at
      returning *
    `;
    return toMeterRegionRegistration(rows[0]);
  },

  async addRegionReplayFraudRecord(record: RegionReplayFraudRecord): Promise<RegionReplayFraudRecord> {
    const rows = await sql`
      insert into region_replay_fraud (
        id, meter_id, incoming_region_id, registered_region_id, incoming_latitude, incoming_longitude, event_type, message, detected_at
      )
      values (
        ${record.id}, ${record.meterId}, ${record.incomingRegionId}, ${record.registeredRegionId}, ${record.incomingLatitude}, ${record.incomingLongitude}, ${record.eventType}, ${record.message}, ${record.detectedAt}
      )
      returning *
    `;
    return toRegionReplayFraudRecord(rows[0]);
  },

  async getSpikeThreshold(meterId: string): Promise<SpikeThreshold | null> {
    const rows = await sql`select * from meter_spike_threshold where meter_id = ${meterId} limit 1`;
    return rows[0] ? toSpikeThreshold(rows[0]) : null;
  },

  async upsertSpikeThreshold(threshold: SpikeThreshold): Promise<SpikeThreshold> {
    const rows = await sql`
      insert into meter_spike_threshold (meter_id, threshold_kw, updated_at)
      values (${threshold.meterId}, ${threshold.thresholdKw}, ${threshold.updatedAt})
      on conflict (meter_id) do update set
        threshold_kw = excluded.threshold_kw,
        updated_at = excluded.updated_at
      returning *
    `;
    return toSpikeThreshold(rows[0]);
  },

  async addSpikeEvent(event: SpikeEvent): Promise<SpikeEvent> {
    const rows = await sql`
      insert into spike_table (id, meter_id, power_kw, threshold_kw, excess_kw, sample_time, detected_at, event_type)
      values (${event.id}, ${event.meterId}, ${event.powerKw}, ${event.thresholdKw}, ${event.excessKw}, ${event.sampleTime}, ${event.detectedAt}, ${event.eventType})
      returning *
    `;
    return toSpikeEvent(rows[0]);
  },

  async updateMeterStatus(meterId: string, status: Meter["status"]): Promise<Meter | null> {
    const rows = await sql`
      update meters
      set status = ${status}
      where id = ${meterId}
      returning *
    `;
    return rows[0] ? toMeter(rows[0]) : null;
  },

  async getNonUsageWindowStats(meterId: string, asOfTimestamp: string): Promise<NonUsageWindowStats | null> {
    const rows = await sql`
      with last_positive as (
        select max(timestamp) as ts
        from readings
        where meter_id = ${meterId}
          and timestamp <= ${asOfTimestamp}
          and kwh > 0
      ),
      window_readings as (
        select timestamp, kwh, voltage
        from readings
        where meter_id = ${meterId}
          and timestamp > coalesce((select ts from last_positive), '1970-01-01T00:00:00.000Z'::timestamptz)
          and timestamp <= ${asOfTimestamp}
      )
      select
        min(timestamp) as first_ts,
        max(timestamp) as last_ts,
        count(*)::int as sample_count,
        count(*) filter (where kwh > 0)::int as positive_count,
        count(*) filter (where voltage > 0)::int as voltage_present_count,
        coalesce(extract(epoch from (${asOfTimestamp}::timestamptz - min(timestamp))) / 3600, 0)::float as hours_since_first_zero
      from window_readings
    `;

    return rows[0] ? toNonUsageWindowStats(rows[0], meterId) : null;
  },

  async addNonUsageAlert(alert: NonUsageAlert): Promise<NonUsageAlert> {
    const rows = await sql`
      insert into non_usage_alerts (id, meter_id, severity, reason, detected_at)
      values (${alert.id}, ${alert.meterId}, ${alert.severity}, ${alert.reason}, ${alert.detectedAt})
      returning *
    `;
    return toNonUsageAlert(rows[0]);
  },

  async addReadingValidationError(error: ReadingValidationError): Promise<ReadingValidationError> {
    const rows = await sql`
      insert into reading_validation_errors (
        id, meter_id, reading_id, previous_reading_id, previous_kwh, current_kwh, threshold_kwh, error_codes, message, detected_at
      )
      values (
        ${error.id}, ${error.meterId}, ${error.readingId}, ${error.previousReadingId}, ${error.previousKwh}, ${error.currentKwh}, ${error.thresholdKwh}, ${error.errorCodes}, ${error.message}, ${error.detectedAt}
      )
      returning *
    `;
    return toReadingValidationError(rows[0]);
  },

  async addFraudEvent(event: FraudEvent): Promise<FraudEvent> {
    const rows = await sql`
      insert into fraud_events (id, meter_id, event_type, severity, source, payload, detected_at)
      values (${event.id}, ${event.meterId}, ${event.eventType}, ${event.severity}, ${event.source}, ${sql.json(JSON.parse(JSON.stringify(event.payload)))}, ${event.detectedAt})
      returning *
    `;
    return toFraudEvent(rows[0]);
  },

  async listFraudEvents(meterId?: string, limit = 100): Promise<FraudEvent[]> {
    const rows = meterId
      ? await sql`
          select * from fraud_events
          where meter_id = ${meterId}
          order by detected_at desc
          limit ${limit}
        `
      : await sql`
          select * from fraud_events
          order by detected_at desc
          limit ${limit}
        `;
    return rows.map((row) => toFraudEvent(row));
  },

  async getFraudEventById(eventId: string): Promise<FraudEvent | null> {
    const rows = await sql`select * from fraud_events where id = ${eventId} limit 1`;
    return rows[0] ? toFraudEvent(rows[0]) : null;
  },

  async createConsumptionSession(session: Omit<ConsumptionSession, "createdAt" | "updatedAt">): Promise<ConsumptionSession> {
    const rows = await sql`
      insert into consumption_session (session_id, meter_id, start_time, end_time, total_energy, peak_power, region_id, status)
      values (${session.sessionId}, ${session.meterId}, ${session.startTime}, ${session.endTime}, ${session.totalEnergy}, ${session.peakPower}, ${session.regionId}, ${session.status})
      returning *
    `;
    return toConsumptionSession(rows[0]);
  },

  async getConsumptionSession(sessionId: string): Promise<ConsumptionSession | null> {
    const rows = await sql`select * from consumption_session where session_id = ${sessionId} limit 1`;
    return rows[0] ? toConsumptionSession(rows[0]) : null;
  },

  async getOpenConsumptionSessionByMeterId(meterId: string): Promise<ConsumptionSession | null> {
    const rows = await sql`
      select * from consumption_session
      where meter_id = ${meterId} and status = 'OPEN'
      order by start_time desc
      limit 1
    `;
    return rows[0] ? toConsumptionSession(rows[0]) : null;
  },

  async listConsumptionSessions(meterId: string, limit = 50): Promise<ConsumptionSession[]> {
    const rows = await sql`
      select * from consumption_session
      where meter_id = ${meterId}
      order by start_time desc
      limit ${limit}
    `;
    return rows.map((row) => toConsumptionSession(row));
  },

  async calculateConsumptionSessionMetrics(meterId: string, startTime: string, endTime: string): Promise<{ totalEnergy: number; peakPower: number }> {
    const [rows] = await sql`
      select
        coalesce(sum(kwh), 0)::float as total_energy,
        coalesce(max((voltage * current) / 1000.0), 0)::float as peak_power
      from readings
      where meter_id = ${meterId}
        and timestamp >= ${startTime}
        and timestamp <= ${endTime}
    `;
    return {
      totalEnergy: Number(rows.total_energy),
      peakPower: Number(rows.peak_power)
    };
  },

  async closeConsumptionSession(sessionId: string, endTime: string, totalEnergy: number, peakPower: number): Promise<ConsumptionSession | null> {
    const rows = await sql`
      update consumption_session
      set
        end_time = ${endTime},
        total_energy = ${totalEnergy},
        peak_power = ${peakPower},
        status = 'CLOSED',
        updated_at = now()
      where session_id = ${sessionId} and status = 'OPEN'
      returning *
    `;
    return rows[0] ? toConsumptionSession(rows[0]) : null;
  },

  async seed(): Promise<void> {
    const [existing] = await sql`select count(*)::int as total from meters`;
    if (Number(existing.total) === 0) {
      const now = new Date().toISOString();
      const clusterMeters = [
        { id: "meter-001", customerId: "cust-1001", serialNumber: "SMRT-2026-001", location: "Cluster-A / Feeder-1" },
        { id: "meter-002", customerId: "cust-1001", serialNumber: "SMRT-2026-002", location: "Cluster-A / Feeder-2" },
        { id: "meter-003", customerId: "cust-1001", serialNumber: "SMRT-2026-003", location: "Cluster-A / Feeder-3" },
        { id: "meter-004", customerId: "cust-1002", serialNumber: "SMRT-2026-004", location: "Cluster-B / Feeder-1" },
        { id: "meter-005", customerId: "cust-1002", serialNumber: "SMRT-2026-005", location: "Cluster-B / Feeder-2" },
        { id: "meter-006", customerId: "cust-1002", serialNumber: "SMRT-2026-006", location: "Cluster-B / Feeder-3" }
      ];

      for (const meter of clusterMeters) {
        await this.saveMeter({
          id: meter.id,
          customerId: meter.customerId,
          serialNumber: meter.serialNumber,
          location: meter.location,
          status: "active",
          installedAt: now
        });

        await this.addReading({ id: `rd-${meter.id}-1`, meterId: meter.id, timestamp: "2026-03-01T00:00:00.000Z", kwh: 10 + Number(meter.id.slice(-1)), voltage: 228, current: 5.1, source: "iot" });
        await this.addReading({ id: `rd-${meter.id}-2`, meterId: meter.id, timestamp: "2026-03-02T00:00:00.000Z", kwh: 11 + Number(meter.id.slice(-1)), voltage: 229, current: 5.4, source: "iot" });
        await this.addReading({ id: `rd-${meter.id}-3`, meterId: meter.id, timestamp: "2026-03-03T00:00:00.000Z", kwh: 12 + Number(meter.id.slice(-1)), voltage: 227, current: 5.2, source: "iot" });
      }

      for (const meter of clusterMeters) {
        const region = meter.location.startsWith("Cluster-A") ? "Cluster-A" : "Cluster-B";
        const coordinates =
          meter.id === "meter-001"
            ? { latitude: 17.481, longitude: 78.441 }
            : meter.id === "meter-002"
              ? { latitude: 17.482, longitude: 78.442 }
              : meter.id === "meter-003"
                ? { latitude: 17.483, longitude: 78.443 }
                : meter.id === "meter-004"
                  ? { latitude: 17.512, longitude: 78.455 }
                  : meter.id === "meter-005"
                    ? { latitude: 17.513, longitude: 78.456 }
                    : { latitude: 17.514, longitude: 78.457 };

        await this.upsertMeterRegionRegistration({
          meterId: meter.id,
          regionId: region,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          updatedAt: new Date().toISOString()
        });
      }

      await this.addFraudAlert({
        id: "alert-1",
        meterId: "meter-006",
        readingId: "rd-meter-006-3",
        severity: "high",
        reason: "Seeded high-risk demo alert on Cluster-B",
        detectedAt: "2026-03-03T00:05:00.000Z"
      });
    }

    await sql`delete from users where username in ('operator', 'customer')`;
    const createdAt = new Date().toISOString();
    const users = [
      { id: "user-admin", username: "admin", password: "admin123", role: "admin", customerId: null },
      { id: "user-customer-a", username: "customer_a", password: "customerA123", role: "customer", customerId: "cust-1001" },
      { id: "user-customer-b", username: "customer_b", password: "customerB123", role: "customer", customerId: "cust-1002" }
    ] as const;

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await sql`
        insert into users (id, username, password_hash, role, customer_id, created_at)
        values (${user.id}, ${user.username}, ${passwordHash}, ${user.role}, ${user.customerId}, ${createdAt})
        on conflict (username) do update set
          password_hash = excluded.password_hash,
          role = excluded.role,
          customer_id = excluded.customer_id
      `;
    }

    const profiles = [
      {
        customerId: "cust-1001",
        customerName: "Ravi Kumar",
        serviceNumber: "USC-510701",
        address: "HNO 7-4-261/1, Ferozguda, Hyderabad"
      },
      {
        customerId: "cust-1002",
        customerName: "Lakshmi Devi",
        serviceNumber: "USC-510702",
        address: "HNO 3-10-45, Bowenpally, Hyderabad"
      }
    ] as const;

    for (const profile of profiles) {
      await sql`
        insert into customer_profiles (customer_id, customer_name, service_number, address)
        values (${profile.customerId}, ${profile.customerName}, ${profile.serviceNumber}, ${profile.address})
        on conflict (customer_id) do update set
          customer_name = excluded.customer_name,
          service_number = excluded.service_number,
          address = excluded.address
      `;
    }

    const [planCount] = await sql`select count(*)::int as total from tariff_plans`;
    if (Number(planCount.total) === 0) {
      await this.upsertTariff({
        id: "tariff-default",
        name: "Default Slab",
        slabs: [
          { upto: 100, rate: 6 },
          { upto: 200, rate: 8 },
          { upto: null, rate: 10 }
        ],
        fixedCharge: 120,
        taxRate: 0.05,
        active: true,
        updatedAt: new Date().toISOString()
      });
    }

    const seasonalProfiles: SeasonalProfile[] = [
      { regionId: "Cluster-A", season: "Summer", avgConsumptionKwh: 18, updatedAt: new Date().toISOString() },
      { regionId: "Cluster-A", season: "Monsoon", avgConsumptionKwh: 14, updatedAt: new Date().toISOString() },
      { regionId: "Cluster-A", season: "Winter", avgConsumptionKwh: 11, updatedAt: new Date().toISOString() },
      { regionId: "Cluster-B", season: "Summer", avgConsumptionKwh: 20, updatedAt: new Date().toISOString() },
      { regionId: "Cluster-B", season: "Monsoon", avgConsumptionKwh: 15, updatedAt: new Date().toISOString() },
      { regionId: "Cluster-B", season: "Winter", avgConsumptionKwh: 12, updatedAt: new Date().toISOString() }
    ];

    for (const profile of seasonalProfiles) {
      await this.upsertSeasonalProfile(profile);
    }
  }
};
