# Session-Based Consumption Tracking

## Session table schema

```sql
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
);
```

Required fields are included:

- `session_id`
- `meter_id`
- `start_time`
- `end_time`
- `total_energy`
- `peak_power`
- `region_id`

## Session lifecycle logic

1. Start consumption:
   - create new session with `status='OPEN'`
   - set `end_time = null`, `total_energy = 0`, `peak_power = 0`
   - reject if another open session exists for the meter
2. Stop consumption:
   - find open session by `session_id`
   - validate `end_time > start_time`
   - compute metrics from readings in `[start_time, end_time]`:
     - `total_energy = sum(kwh)`
     - `peak_power = max((voltage * current) / 1000)`
   - update session with metrics and set `status='CLOSED'`

## API endpoints

1. Start session
   - `POST /api/consumption-sessions/start`
   - body:

```json
{
  "sessionId": "sess-1001",
  "meterId": "meter-001",
  "startTime": "2026-04-19T10:00:00.000Z",
  "regionId": "Cluster-A"
}
```

2. Stop session
   - `POST /api/consumption-sessions/:sessionId/stop`
   - body:

```json
{
  "endTime": "2026-04-19T11:00:00.000Z"
}
```

3. Get session by ID
   - `GET /api/consumption-sessions/:sessionId`

4. List sessions by meter
   - `GET /api/meters/:meterId/consumption-sessions?limit=50`
