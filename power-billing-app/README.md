# Power Billing App

This repository is organized as:

```text
power-billing-app/
|-- meter-simulator/
|-- billing-backend/
|-- frontend-dashboard/
|-- docker/
|-- ci-cd/
`-- README.md
```

## Folder purpose

- `meter-simulator/`: sends sample smart meter readings into the backend API
- `billing-backend/`: Fastify + TypeScript API with PostgreSQL-backed persistence
- `frontend-dashboard/`: React + Vite dashboard for bills, usage, and fraud alerts
- `docker/`: local PostgreSQL and service compose files
- `ci-cd/`: pipeline examples and delivery notes

## Quick start in VS Code

1. Open this repository in VS Code
2. Start PostgreSQL from `power-billing-app/docker/docker-compose.yml`
3. Open `power-billing-app/billing-backend`
4. Copy `.env.example` to `.env`
5. Run `npm install` and `npm run dev`
6. Open `power-billing-app/frontend-dashboard`
7. Copy `.env.example` to `.env`
8. Run `npm install` and `npm run dev`
9. Open `power-billing-app/meter-simulator`
10. Copy `.env.example` to `.env`
11. Run `npm install` and `npm run dev`

## Current status

- backend: implemented and build verified
- frontend: implemented and build verified after env typing support
- simulator: implemented and TypeScript build verified
