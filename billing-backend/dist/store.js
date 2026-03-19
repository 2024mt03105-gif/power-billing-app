const meters = new Map();
const readings = new Map();
const fraudAlerts = new Map();
export const store = {
    listMeters() {
        return Array.from(meters.values());
    },
    getMeter(meterId) {
        return meters.get(meterId);
    },
    saveMeter(meter) {
        meters.set(meter.id, meter);
        return meter;
    },
    addReading(reading) {
        const existing = readings.get(reading.meterId) ?? [];
        existing.push(reading);
        existing.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
        readings.set(reading.meterId, existing);
        return reading;
    },
    listReadings(meterId) {
        return readings.get(meterId) ?? [];
    },
    addFraudAlert(alert) {
        const existing = fraudAlerts.get(alert.meterId) ?? [];
        existing.push(alert);
        fraudAlerts.set(alert.meterId, existing);
        return alert;
    },
    listFraudAlerts(meterId) {
        if (meterId) {
            return fraudAlerts.get(meterId) ?? [];
        }
        return Array.from(fraudAlerts.values()).flat();
    },
    seed(config) {
        if (meters.size > 0) {
            return;
        }
        const now = new Date().toISOString();
        const meter = {
            id: "meter-001",
            customerId: "cust-1001",
            serialNumber: "SMRT-2026-001",
            location: "Hyderabad Sector 4",
            status: "active",
            installedAt: now
        };
        meters.set(meter.id, meter);
        const sampleReadings = [
            { id: "rd-1", meterId: meter.id, timestamp: "2026-03-01T00:00:00.000Z", kwh: 12, voltage: 228, current: 5.1, source: "iot" },
            { id: "rd-2", meterId: meter.id, timestamp: "2026-03-02T00:00:00.000Z", kwh: 14, voltage: 229, current: 5.5, source: "iot" },
            { id: "rd-3", meterId: meter.id, timestamp: "2026-03-03T00:00:00.000Z", kwh: 13, voltage: 227, current: 5.0, source: "iot" }
        ];
        readings.set(meter.id, sampleReadings);
        if (config.fraudSpikeFactor < 3) {
            fraudAlerts.set(meter.id, [
                {
                    id: "alert-1",
                    meterId: meter.id,
                    readingId: "rd-3",
                    severity: "medium",
                    reason: "Baseline alert seeded for demo mode",
                    detectedAt: now
                }
            ]);
        }
    }
};
