# Billing Backend

Node.js + TypeScript API with SQL-backed persistence for:

- smart meter registration
- reading ingestion from APIs or cloud IoT bridge
- monthly bill calculation
- fraud and anomaly alerts
- dashboard summary metrics

## Run

1. Start PostgreSQL with the Docker file in `../docker`
2. Copy `.env.example` to `.env`
3. Run `npm install`
4. Run `npm run dev`

## Main endpoints

- `GET /health`
- `GET /api/meters`
- `POST /api/meters`
- `GET /api/meters/:meterId/readings`
- `POST /api/meters/:meterId/readings`
- `GET /api/meters/:meterId/bills/:month`
- `GET /api/fraud-alerts`
- `GET /api/dashboard/overview/:month`
- `POST /api/iot/meters/:meterId/readings`
- `POST /api/power-sessions` (duplicate session detection + fraud event logging + monitoring alert)
- `POST /admin/seasonal-profile` (maintain regional seasonal averages)
- `GET /admin/seasonal-profile?regionId=...&season=Summer|Winter|Monsoon`
- `POST /api/validation/region-check` (detect incoming `region_id` mismatch as `REGION_REPLAY`)
- `POST /admin/meter-region-registry` and `GET /admin/meter-region-registry/:meterId`
- `POST /api/meters/:meterId/power-samples` (real-time spike detection per second sample)
- `POST /admin/meters/:meterId/spike-threshold` and `GET /admin/meters/:meterId/spike-threshold`
- `POST /admin/monitor/non-usage` (detect meters with >24h zero consumption and voltage present)
- `POST /api/validation/meters/:meterId/readings` (invalid reading detection and error logging)
- `POST /api/fraud-engine/process` (run all fraud rules on incoming meter payload)
- `GET /api/fraud-engine/events` (unified fraud event feed for dashboard)
- `GET /api/fraud-engine/events/:eventId` (full event detail with meter + incident snapshot)
- `POST /admin/fraud-engine/initiate-cases` (initiate one fraud event for each detection case)
- `POST /api/consumption-sessions/start` and `POST /api/consumption-sessions/:sessionId/stop`
- `GET /api/consumption-sessions/:sessionId`
- `GET /api/meters/:meterId/consumption-sessions`

The backend uses PostgreSQL through `DATABASE_URL`.
