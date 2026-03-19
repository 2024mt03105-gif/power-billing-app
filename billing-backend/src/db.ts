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
      source text not null
    )
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
};

export const closeDatabase = async (): Promise<void> => {
  await sql.end({ timeout: 5 });
};