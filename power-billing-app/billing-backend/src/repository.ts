import { CustomerProfile, DashboardOverview, FraudAlert, FraudInsight, Meter, Reading, TariffPlan, TariffSlab, User } from "./domain.js";
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
  source: row.source as Reading["source"]
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
      insert into readings (id, meter_id, timestamp, kwh, voltage, current, source)
      values (${reading.id}, ${reading.meterId}, ${reading.timestamp}, ${reading.kwh}, ${reading.voltage}, ${reading.current}, ${reading.source})
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
          select count(f.*)::int as total_alerts
          from fraud_alerts f
          join meters m on m.id = f.meter_id
          where m.customer_id = ${customerId} and f.detected_at >= ${monthStart} and f.detected_at < ${monthEnd.toISOString()}
        `
      : await sql`
          select count(*)::int as total_alerts
          from fraud_alerts
          where detected_at >= ${monthStart} and detected_at < ${monthEnd.toISOString()}
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
          select f.severity, count(*)::int as total
          from fraud_alerts f
          join meters m on m.id = f.meter_id
          where m.customer_id = ${customerId} and f.detected_at >= ${monthStart} and f.detected_at < ${monthEnd.toISOString()}
          group by f.severity
          order by f.severity
        `
      : await sql`
          select severity, count(*)::int as total
          from fraud_alerts
          where detected_at >= ${monthStart} and detected_at < ${monthEnd.toISOString()}
          group by severity
          order by severity
        `;

    const riskyMeterRows = customerId
      ? await sql`
          select m.id as meter_id, m.location, count(f.*)::int as alert_count
          from meters m
          join fraud_alerts f on f.meter_id = m.id
          where m.customer_id = ${customerId} and f.detected_at >= ${monthStart} and f.detected_at < ${monthEnd.toISOString()}
          group by m.id, m.location
          order by alert_count desc, m.id asc
          limit 5
        `
      : await sql`
          select m.id as meter_id, m.location, count(f.*)::int as alert_count
          from meters m
          join fraud_alerts f on f.meter_id = m.id
          where f.detected_at >= ${monthStart} and f.detected_at < ${monthEnd.toISOString()}
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
  }
};
