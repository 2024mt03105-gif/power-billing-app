# Regional Mismatch Validation Module

## Database schema

```sql
create table if not exists meter_region_registry (
  meter_id text primary key references meters(id) on delete cascade,
  region_id text not null,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now(),
  constraint chk_meter_region_lat check (latitude >= -90 and latitude <= 90),
  constraint chk_meter_region_long check (longitude >= -180 and longitude <= 180)
);

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
);
```

## Validation function

- Function: `validateRegionalMismatch(payload, logger)`
- Input: `meterId`, `regionId`, `latitude`, `longitude`
- Steps:
  1. Fetch registered meter region from `meter_region_registry`.
  2. Compare incoming `regionId` with registered `regionId`.
  3. If mismatch, create `REGION_REPLAY` fraud record.
  4. If match, return `VALID`.

## REST API endpoint

- `POST /api/validation/region-check`
  - Body:

```json
{
  "meterId": "meter-001",
  "regionId": "Cluster-B",
  "latitude": 17.501,
  "longitude": 78.452
}
```

- Responses:
  - `200`: `{ status: "VALID", registration: ... }`
  - `409`: `{ status: "REGION_REPLAY", fraudRecord: ... }`

Registry maintenance endpoints:

- `POST /admin/meter-region-registry`
- `GET /admin/meter-region-registry/:meterId`

## Logging mechanism

On mismatch:

1. Persist record in `region_replay_fraud`.
2. Emit structured error log with meter and region details.
3. Broadcast `admin.notification` and `fraud.region_replay` events to notify administrators/monitoring.
