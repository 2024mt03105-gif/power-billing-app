# Non-Usage Monitoring Feature

## Detection logic

For each meter:

1. Find the last timestamp where `kwh > 0`.
2. Inspect readings after that point until `asOf`.
3. If all of these are true:
   - there are readings in the window
   - `kwh` is never above 0
   - voltage is present in the window (`voltage > 0`)
   - elapsed time from first zero reading is greater than 24 hours
4. Then:
   - mark meter status as `NON_USAGE`
   - generate and store a non-usage alert
   - notify dashboard/admin channels

## Database query

```sql
with last_positive as (
  select max(timestamp) as ts
  from readings
  where meter_id = $1
    and timestamp <= $2
    and kwh > 0
),
window_readings as (
  select timestamp, kwh, voltage
  from readings
  where meter_id = $1
    and timestamp > coalesce((select ts from last_positive), '1970-01-01T00:00:00.000Z'::timestamptz)
    and timestamp <= $2
)
select
  min(timestamp) as first_ts,
  max(timestamp) as last_ts,
  count(*)::int as sample_count,
  count(*) filter (where kwh > 0)::int as positive_count,
  count(*) filter (where voltage > 0)::int as voltage_present_count,
  coalesce(extract(epoch from ($2::timestamptz - min(timestamp))) / 3600, 0)::float as hours_since_first_zero
from window_readings;
```

## Alert generation

- Alert table: `non_usage_alerts`
- Broadcast events:
  - `meter.non_usage` for dashboard monitoring
  - `admin.notification` for administrator notification
- API integration:
  - automatic check during `POST /api/meters/:meterId/readings`
  - batch monitor trigger: `POST /admin/monitor/non-usage?asOf=<ISO_DATETIME>`
