# Duplicate Session Detection Module

## SQL table schema

```sql
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
);

create index if not exists idx_power_session_meter_start
on power_session (meter_id, start_time desc);
```

## API endpoint

- `POST /api/power-sessions`

Request body:

```json
{
  "sessionId": "sess-11001",
  "meterId": "meter-001",
  "startTime": "2026-04-19T10:00:00.000Z",
  "endTime": "2026-04-19T10:30:00.000Z",
  "regionId": "region-south"
}
```

Response behavior:

- New `sessionId`: returns `201` with status `ACCEPTED`, inserts record in `power_session`.
- Existing `sessionId`: returns `409` with status `DUPLICATE`, marks record as duplicate, logs fraud event, sends monitoring alert.

## Validation logic

- `sessionId`, `meterId`, `regionId` are required non-empty strings.
- `startTime`, `endTime` must be valid ISO datetimes.
- `endTime` must be strictly later than `startTime`.

## Logging function

- Service function: `logDuplicateSessionFraud(session, logger)`
- Persists entry into `session_fraud_events`
- Writes structured warning log
- Broadcasts dashboard alert event `session.duplicate` via SSE event bus
