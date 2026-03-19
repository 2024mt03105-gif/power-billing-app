const average = (values) => {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};
export const detectFraud = (meterId, reading, historicalReadings, config) => {
    const previousKwh = historicalReadings.map((entry) => entry.kwh);
    const baselineKwh = average(previousKwh);
    if (baselineKwh === 0) {
        return null;
    }
    const spikeDetected = reading.kwh >= baselineKwh * config.fraudSpikeFactor;
    const lowVoltageHighCurrent = reading.voltage < 210 && reading.current > 8;
    if (!spikeDetected && !lowVoltageHighCurrent) {
        return null;
    }
    const reasons = [];
    if (spikeDetected) {
        reasons.push(`Consumption spike ${reading.kwh.toFixed(2)} kWh vs baseline ${baselineKwh.toFixed(2)} kWh`);
    }
    if (lowVoltageHighCurrent) {
        reasons.push(`Possible line tap pattern with voltage ${reading.voltage}V and current ${reading.current}A`);
    }
    return {
        id: `alert-${reading.id}`,
        meterId,
        readingId: reading.id,
        severity: spikeDetected && lowVoltageHighCurrent ? "high" : "medium",
        reason: reasons.join("; "),
        detectedAt: new Date().toISOString()
    };
};
