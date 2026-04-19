# Fraud Detection Engine (Cloud Billing)

## Microservice architecture

Recommended cloud deployment:

1. `ingestion-service`
   - receives meter payloads from IoT/API gateway
   - forwards payloads to fraud engine
2. `fraud-engine-service`
   - applies rule-based checks
   - writes normalized events to `fraud_events`
3. `billing-core-service`
   - maintains meters, readings, billing, tariff
4. `alert-service`
   - consumes fraud events
   - pushes websocket/SSE dashboard alerts and admin notifications
5. `dashboard-service`
   - reads `GET /api/fraud-engine/events` feed

Current implementation in this repo runs these concerns in one backend process while preserving service boundaries in modules/routes.

## Rule engine logic

Engine endpoint: `POST /api/fraud-engine/process`

Input can include one or more of:

- `reading`
- `powerSampleKw`
- `session`
- `regionCheck`

Applied rules:

1. `METER_TAMPERING`
   - voltage below nominal and high current (`voltage < 210` and `current > 8`)
2. `BYPASS_CONNECTION`
   - zero energy while electrical flow exists (`kwh == 0`, `voltage > 200`, `current > 2`)
3. `DUPLICATE_SESSION_ID`
   - incoming `sessionId` already present
4. `SEASONAL_REPLAY`
   - consumption below seasonal threshold profile
5. `REGIONAL_MISMATCH`
   - incoming region differs from registered meter region
6. `NON_USAGE`
   - zero consumption for over 24h with voltage present
7. `SUDDEN_CONSUMPTION_SPIKE`
   - consumption spike / high power sample above threshold

For each detection, engine stores a normalized event in `fraud_events` and emits dashboard event `fraud.engine.events`.

## Database schema

```sql
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
);

create index if not exists idx_fraud_events_meter_detected
on fraud_events (meter_id, detected_at desc);
```

The engine also reuses supporting rule tables already present:

- `power_session`, `session_fraud_events`
- `seasonal_profile`, `fraud_log`
- `meter_region_registry`, `region_replay_fraud`
- `non_usage_alerts`
- `meter_spike_threshold`, `spike_table`

## REST API

1. `POST /api/fraud-engine/process`
   - runs all relevant rules on incoming payload
   - stores fraud events
   - emits alerts
2. `GET /api/fraud-engine/events?meterId=<id>&limit=<n>`
   - returns unified fraud event stream for dashboards

Example payload:

```json
{
  "meterId": "meter-001",
  "timestamp": "2026-04-19T12:00:01.000Z",
  "reading": {
    "kwh": 0,
    "voltage": 228,
    "current": 3.4,
    "source": "iot"
  },
  "powerSampleKw": 9.2,
  "session": {
    "sessionId": "sess-001",
    "startTime": "2026-04-19T11:59:00.000Z",
    "endTime": "2026-04-19T12:00:00.000Z",
    "regionId": "Cluster-A"
  },
  "regionCheck": {
    "regionId": "Cluster-B",
    "latitude": 17.51,
    "longitude": 78.45
  }
}
```
