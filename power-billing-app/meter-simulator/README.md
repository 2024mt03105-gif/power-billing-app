# Meter Simulator

This package sends sample smart meter readings to the backend.

## Run

1. Copy `.env.example` to `.env`
2. If authentication is enabled, set `SIMULATOR_TOKEN` from an operator or admin login
3. Run `npm install`
4. Run `npm run dev`

## Notes

- default interval is every 10 minutes (`INTERVAL_MS=600000`)
- for demo purposes you can lower the interval to `10000`
- set `METER_ID` to an existing backend meter like `meter-001`
- set `AUTO_REGISTER=true` if you want the simulator to create a meter when it is missing
- every 12th reading creates a large spike to help test fraud alerts
