# CI/CD

This folder holds pipeline definitions and deployment notes.

Packages covered:

- `billing-backend`
- `meter-simulator`
- `frontend-dashboard`

Pipeline stages:

1. install dependencies per package
2. build and type-check backend
3. build simulator
4. build frontend dashboard
5. build Docker images
6. deploy to staging or production

The runnable GitHub Actions workflow lives in `.github/workflows/ci.yml` because GitHub only executes workflows from that folder.
