# Incorrect Meter Reading Validation Module

## Validation rules

Incoming reading is marked `INVALID` when any rule matches:

1. `NEGATIVE_READING`: `current_kwh < 0`
2. `REGRESSION_READING`: `current_kwh < previous_valid_kwh`
3. `EXCEEDS_EXPECTED_THRESHOLD`:
   - with previous valid reading: `(current_kwh - previous_valid_kwh) > READING_MAX_DELTA_KWH`
   - without previous reading: `current_kwh > READING_MAX_DELTA_KWH`

Otherwise reading is marked `VALID`.

## Database schema

```sql
alter table readings
add column if not exists status text not null default 'VALID';

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
);
```

## API endpoint

- `POST /api/validation/meters/:meterId/readings`
- Uses the same payload as normal reading ingestion.
- Internally validates and writes to `readings` with `status`.
- Response includes:
  - `validation.status` (`VALID` or `INVALID`)
  - `validation.errorCodes`
  - `validationError` record when invalid

## Logging function

- `logInvalidReading(...)` in `src/services/readingValidation.ts`
- On invalid reading:
  1. writes `reading_validation_errors` record
  2. emits structured error log
  3. broadcasts system events:
     - `reading.invalid`
     - `admin.notification`

## Configurable threshold

- `READING_MAX_DELTA_KWH` (default `100`)
