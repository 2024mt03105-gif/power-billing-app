# Meter Simulator

This package sends sample smart meter readings to the backend.

## Run

1. Copy `.env.example` to `.env`
2. Run `npm install`
3. Run `npm run dev`

## Notes

- default interval is every 10 minutes (`INTERVAL_MS=600000`)
- for demo purposes set `INTERVAL_MS=10000` to see terminal logs every 10 seconds
- if `AUTO_REGISTER=false`, no token is needed and the simulator sends directly to `meter-001`
- if `AUTO_REGISTER=true`, set `SIMULATOR_TOKEN` from an operator or admin login
- every 12th reading creates a large spike to help test fraud alerts
