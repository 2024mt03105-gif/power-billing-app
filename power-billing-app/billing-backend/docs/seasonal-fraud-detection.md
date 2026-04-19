# Seasonal Consumption Anomaly Fraud Detection

## Database schema

```sql
create table if not exists seasonal_profile (
  region_id text not null,
  season text not null,
  avg_consumption_kwh double precision not null,
  updated_at timestamptz not null default now(),
  primary key (region_id, season),
  constraint chk_seasonal_profile_season check (season in ('Summer', 'Winter', 'Monsoon')),
  constraint chk_seasonal_profile_avg check (avg_consumption_kwh >= 0)
);

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
);
```

## Seasonal comparison algorithm

1. Determine season from reading timestamp (UTC month):
   - `Summer`: March to June
   - `Monsoon`: July to October
   - `Winter`: November to February
2. Derive `region_id` from meter location (prefix before `/`).
3. Fetch `seasonal_profile(region_id, season)`.
4. Let:
   - `observed = reading.kwh`
   - `expected = profile.avg_consumption_kwh`
   - `threshold = seasonalReplayThreshold` (default `0.5`)
5. Fraud condition:
   - `expected >= seasonalMinExpectedKwh`
   - `observed < expected * threshold`
6. If true, classify as `seasonal_replay`.

## Alert generation logic

When condition matches:

1. Create `fraud_log` row with meter, reading, region, season, observed/expected values, threshold, and reason.
2. Emit warning log entry for backend observability.
3. Broadcast SSE event `fraud.seasonal_replay` to monitoring dashboard stream.
4. Include `seasonalFraud` in reading ingestion API response.

## Configuration parameters

- `SEASONAL_REPLAY_THRESHOLD` (default `0.5`)
  - Percentage multiplier for low-usage trigger.
- `SEASONAL_MIN_EXPECTED_KWH` (default `5`)
  - Guardrail to skip anomaly checks where expected usage is too small.
