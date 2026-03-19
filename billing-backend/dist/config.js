import dotenv from "dotenv";
dotenv.config();
const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toBoolean = (value, fallback) => {
    if (value === undefined) {
        return fallback;
    }
    return value.toLowerCase() === "true";
};
export const config = {
    port: toNumber(process.env.PORT, 3000),
    databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/power_billing",
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    jwtSecret: process.env.JWT_SECRET ?? "change-this-secret",
    seedDemoData: toBoolean(process.env.SEED_DEMO_DATA, true),
    billing: {
        unitRate: toNumber(process.env.DEFAULT_UNIT_RATE, 8.25),
        fixedCharge: toNumber(process.env.DEFAULT_FIXED_CHARGE, 120),
        taxRate: 0.05,
        fraudSpikeFactor: toNumber(process.env.DEFAULT_FRAUD_SPIKE_FACTOR, 2.5)
    }
};
