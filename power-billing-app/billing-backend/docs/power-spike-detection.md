# Real-Time Power Spike Detection

## Spike detection algorithm

For each incoming 1-second meter sample (`meter_id`, `timestamp`, `power_kw`):

1. Fetch per-meter threshold from `meter_spike_threshold`.
2. If missing, use `DEFAULT_POWER_SPIKE_KW`.
3. Compare:
   - If `power_kw <= threshold_kw`: no spike.
   - If `power_kw > threshold_kw`: classify as `POWER_SPIKE`.
4. On spike:
   - create event with `excess_kw = power_kw - threshold_kw`
   - store event in `spike_table`
   - publish `spike.alert` to dashboard stream.

## Database schema

```sql
create table if not exists meter_spike_threshold (
  meter_id text primary key references meters(id) on delete cascade,
  threshold_kw double precision not null,
  updated_at timestamptz not null default now(),
  constraint chk_meter_spike_threshold_value check (threshold_kw > 0)
);

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
);
```

## Configurable threshold

- Global default: `DEFAULT_POWER_SPIKE_KW` (in `.env`)
- Per meter override:
  - `POST /admin/meters/:meterId/spike-threshold`
  - `GET /admin/meters/:meterId/spike-threshold`

## API endpoint

- Ingest 1-second power samples:
  - `POST /api/meters/:meterId/power-samples`

Request body:

```json
{
  "timestamp": "2026-04-19T12:30:01.000Z",
  "powerKw": 9.8
}
```

Response contains applied threshold and optional `spike` object.
