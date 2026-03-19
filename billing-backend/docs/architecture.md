# Architecture Blueprint

## Business goals

The platform needs to support three core flows:

1. ingest meter readings from smart energy meters
2. compute monthly bills from validated consumption data
3. detect abnormal power consumption that can indicate theft, illegal taps, or meter bypass

## Recommended cloud design

### Edge and ingestion

- Smart meters publish telemetry to AWS IoT Core over MQTT.
- Each message includes `meterId`, timestamp, energy consumed, voltage, current, and firmware metadata.
- AWS IoT Rules route the messages into a backend ingestion service.

### Backend services

- `Meter Registry API`: manages customers, meters, tariff plans, and installation details.
- `Reading Ingestion API`: validates incoming readings and stores them in a time-series friendly database.
- `Billing Service`: calculates monthly charges using tariff rules, taxes, fixed charges, and rebates.
- `Fraud Monitoring Service`: runs anomaly detection rules and optionally ML-based scoring.
- `Notification Service`: pushes alerts to operations staff and customers.

### Storage

- `PostgreSQL`: customer master data, tariff plans, invoices, alerts, audit events.
- `TimescaleDB` or `Amazon Timestream`: high-volume time-series meter readings.
- `S3`: raw telemetry archive for audit and analytics replay.

### API layer

- Public REST APIs for mobile/web dashboards.
- Internal APIs for operations, billing, and fraud investigation.
- WebSocket or server-sent events for live consumption monitoring dashboards.

## Fraud monitoring examples

Start with deterministic rules before adding ML:

- sudden daily consumption spike compared to 30-day average
- voltage drop with unusually high current draw
- zero usage during business hours followed by sudden night spikes
- meter offline patterns that correlate with unbilled supply periods
- neighboring transformer load not matching summed meter consumption

## CI/CD recommendation

Use one pipeline for code quality and one for deployment:

1. GitHub Actions for lint, type-check, tests, and build
2. Infrastructure as code using Terraform or AWS CDK
3. Deploy APIs to ECS Fargate, Lambda, or Kubernetes
4. Use separate environments: `dev`, `staging`, `prod`
5. Add database migrations and smoke tests to the release pipeline

## API design starter

Core entities:

- `Customer`
- `Meter`
- `MeterReading`
- `TariffPlan`
- `Invoice`
- `FraudAlert`

Useful API endpoints:

- `POST /api/meters`
- `GET /api/meters`
- `POST /api/meters/{meterId}/readings`
- `GET /api/meters/{meterId}/readings`
- `GET /api/meters/{meterId}/bills/{yyyy-mm}`
- `GET /api/fraud-alerts?meterId={meterId}`

## Next production steps

- replace the in-memory store with PostgreSQL and a time-series store
- add authentication and role-based authorization
- add tariff slabs, peak-hour pricing, and subsidies
- add unit and integration tests
- add a dashboard frontend for consumption analytics and fraud investigation
