import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, {
  max: 5,
  idle_timeout: 10,
  connect_timeout: 10
});

export const initializeDatabase = async (): Promise<void> => {
  await sql`
    create table if not exists meters (
      id text primary key,
      customer_id text not null,
      serial_number text not null unique,
      location text not null,
      status text not null,
      installed_at timestamptz not null
    )
  `;

  await sql`
    create table if not exists readings (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      timestamp timestamptz not null,
      kwh double precision not null,
      voltage double precision not null,
      current double precision not null,
      source text not null,
      status text not null default 'VALID'
    )
  `;

  await sql`
    alter table readings
    add column if not exists status text not null default 'VALID'
  `;

  await sql`
    create index if not exists idx_readings_meter_timestamp
    on readings (meter_id, timestamp desc)
  `;

  await sql`
    create table if not exists fraud_alerts (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      reading_id text not null references readings(id) on delete cascade,
      severity text not null,
      reason text not null,
      detected_at timestamptz not null
    )
  `;

  await sql`
    create index if not exists idx_fraud_alerts_meter_detected
    on fraud_alerts (meter_id, detected_at desc)
  `;

  await sql`
    create table if not exists users (
      id text primary key,
      username text not null unique,
      password_hash text not null,
      role text not null,
      customer_id text,
      created_at timestamptz not null
    )
  `;

  await sql`
    create table if not exists customer_profiles (
      customer_id text primary key,
      customer_name text not null,
      service_number text not null unique,
      address text not null
    )
  `;

  await sql`
    create table if not exists tariff_plans (
      id text primary key,
      name text not null,
      slabs jsonb not null,
      fixed_charge double precision not null,
      tax_rate double precision not null,
      active boolean not null default false,
      updated_at timestamptz not null
    )
  `;

  await sql`create index if not exists idx_tariff_active on tariff_plans (active)`;

  await sql`
    create table if not exists power_session (
      session_id text primary key,
      meter_id text not null,
      start_time timestamptz not null,
      end_time timestamptz not null,
      region_id text not null,
      status text not null default 'ACCEPTED',
      created_at timestamptz not null default now(),
      constraint chk_power_session_status check (status in ('ACCEPTED', 'DUPLICATE')),
      constraint chk_power_session_time check (end_time > start_time)
    )
  `;

  await sql`
    create index if not exists idx_power_session_meter_start
    on power_session (meter_id, start_time desc)
  `;

  await sql`
    create table if not exists session_fraud_events (
      id text primary key,
      session_id text not null references power_session(session_id) on delete cascade,
      meter_id text not null,
      region_id text not null,
      reason text not null,
      detected_at timestamptz not null
    )
  `;

  await sql`
    create index if not exists idx_session_fraud_detected
    on session_fraud_events (detected_at desc)
  `;

  await sql`
    create table if not exists seasonal_profile (
      region_id text not null,
      season text not null,
      avg_consumption_kwh double precision not null,
      updated_at timestamptz not null default now(),
      primary key (region_id, season),
      constraint chk_seasonal_profile_season check (season in ('Summer', 'Winter', 'Monsoon')),
      constraint chk_seasonal_profile_avg check (avg_consumption_kwh >= 0)
    )
  `;

  await sql`
    create table if not exists fraud_log (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      reading_id text not null references readings(id) on delete cascade,
      region_id text not null,
      season text not null,
      observed_kwh double precision not null,
      expected_kwh double precision not null,
      threshold_percent double precision not null,
      fraud_type text not null,
      message text not null,
      detected_at timestamptz not null,
      constraint chk_fraud_log_season check (season in ('Summer', 'Winter', 'Monsoon')),
      constraint chk_fraud_log_threshold check (threshold_percent > 0 and threshold_percent < 1),
      constraint chk_fraud_log_fraud_type check (fraud_type in ('seasonal_replay'))
    )
  `;

  await sql`
    create index if not exists idx_fraud_log_meter_detected
    on fraud_log (meter_id, detected_at desc)
  `;

  await sql`
    create table if not exists meter_region_registry (
      meter_id text primary key references meters(id) on delete cascade,
      region_id text not null,
      latitude double precision not null,
      longitude double precision not null,
      updated_at timestamptz not null default now(),
      constraint chk_meter_region_lat check (latitude >= -90 and latitude <= 90),
      constraint chk_meter_region_long check (longitude >= -180 and longitude <= 180)
    )
  `;

  await sql`
    create table if not exists region_replay_fraud (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      incoming_region_id text not null,
      registered_region_id text not null,
      incoming_latitude double precision not null,
      incoming_longitude double precision not null,
      event_type text not null,
      message text not null,
      detected_at timestamptz not null,
      constraint chk_region_replay_event_type check (event_type in ('REGION_REPLAY'))
    )
  `;

  await sql`
    create index if not exists idx_region_replay_meter_detected
    on region_replay_fraud (meter_id, detected_at desc)
  `;

  await sql`
    create table if not exists meter_spike_threshold (
      meter_id text primary key references meters(id) on delete cascade,
      threshold_kw double precision not null,
      updated_at timestamptz not null default now(),
      constraint chk_meter_spike_threshold_value check (threshold_kw > 0)
    )
  `;

  await sql`
    create table if not exists spike_table (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      power_kw double precision not null,
      threshold_kw double precision not null,
      excess_kw double precision not null,
      sample_time timestamptz not null,
      detected_at timestamptz not null,
      event_type text not null,
      constraint chk_spike_table_event_type check (event_type in ('POWER_SPIKE')),
      constraint chk_spike_table_values check (power_kw > 0 and threshold_kw > 0 and excess_kw > 0)
    )
  `;

  await sql`
    create index if not exists idx_spike_table_meter_sample_time
    on spike_table (meter_id, sample_time desc)
  `;

  await sql`
    create table if not exists non_usage_alerts (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      severity text not null,
      reason text not null,
      detected_at timestamptz not null,
      constraint chk_non_usage_alert_severity check (severity in ('medium', 'high'))
    )
  `;

  await sql`
    create index if not exists idx_non_usage_alerts_meter_detected
    on non_usage_alerts (meter_id, detected_at desc)
  `;

  await sql`
    create table if not exists reading_validation_errors (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      reading_id text not null references readings(id) on delete cascade,
      previous_reading_id text references readings(id) on delete set null,
      previous_kwh double precision,
      current_kwh double precision not null,
      threshold_kwh double precision not null,
      error_codes text[] not null,
      message text not null,
      detected_at timestamptz not null
    )
  `;

  await sql`
    create index if not exists idx_reading_validation_errors_meter_detected
    on reading_validation_errors (meter_id, detected_at desc)
  `;

  await sql`
    create table if not exists fraud_events (
      id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      event_type text not null,
      severity text not null,
      source text not null,
      payload jsonb not null,
      detected_at timestamptz not null,
      constraint chk_fraud_events_type check (
        event_type in (
          'METER_TAMPERING',
          'BYPASS_CONNECTION',
          'DUPLICATE_SESSION_ID',
          'SEASONAL_REPLAY',
          'REGIONAL_MISMATCH',
          'NON_USAGE',
          'SUDDEN_CONSUMPTION_SPIKE'
        )
      ),
      constraint chk_fraud_events_severity check (severity in ('medium', 'high'))
    )
  `;

  await sql`
    create index if not exists idx_fraud_events_meter_detected
    on fraud_events (meter_id, detected_at desc)
  `;

  await sql`
    create table if not exists consumption_session (
      session_id text primary key,
      meter_id text not null references meters(id) on delete cascade,
      start_time timestamptz not null,
      end_time timestamptz,
      total_energy double precision not null default 0,
      peak_power double precision not null default 0,
      region_id text not null,
      status text not null default 'OPEN',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_consumption_session_status check (status in ('OPEN', 'CLOSED')),
      constraint chk_consumption_session_time check (end_time is null or end_time > start_time),
      constraint chk_consumption_session_total_energy check (total_energy >= 0),
      constraint chk_consumption_session_peak_power check (peak_power >= 0)
    )
  `;

  await sql`
    create index if not exists idx_consumption_session_meter_start
    on consumption_session (meter_id, start_time desc)
  `;
};

export const closeDatabase = async (): Promise<void> => {
  await sql.end({ timeout: 5 });
};
