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

The backend uses PostgreSQL through `DATABASE_URL`.
