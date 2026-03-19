const round = (value) => Math.round(value * 100) / 100;
const applySlabs = (units, slabs) => {
    const sorted = [...slabs].sort((a, b) => {
        if (a.upto === null)
            return 1;
        if (b.upto === null)
            return -1;
        return a.upto - b.upto;
    });
    let remaining = units;
    let prev = 0;
    const parts = [];
    for (const slab of sorted) {
        const cap = slab.upto ?? Number.POSITIVE_INFINITY;
        const slabUnits = Math.max(0, Math.min(remaining, cap - prev));
        const charge = round(slabUnits * slab.rate);
        parts.push({ upto: slab.upto, rate: slab.rate, units: round(slabUnits), charge });
        remaining -= slabUnits;
        prev = cap;
        if (remaining <= 0)
            break;
    }
    const total = round(parts.reduce((sum, s) => sum + s.charge, 0));
    return { parts, total };
};
export const calculateMonthlyBill = (meterId, month, monthlyReadings, config, plan) => {
    const totalKwh = monthlyReadings.reduce((sum, reading) => sum + reading.kwh, 0);
    if (plan) {
        const slabResult = applySlabs(totalKwh, plan.slabs);
        const energyCharge = slabResult.total;
        const taxes = round(energyCharge * plan.taxRate);
        const totalAmount = round(energyCharge + plan.fixedCharge + taxes);
        return {
            month,
            meterId,
            totalKwh: round(totalKwh),
            unitRate: 0,
            energyCharge,
            fixedCharge: plan.fixedCharge,
            taxes,
            totalAmount
        };
    }
    const energyCharge = round(totalKwh * config.unitRate);
    const taxes = round(energyCharge * config.taxRate);
    const totalAmount = round(energyCharge + config.fixedCharge + taxes);
    return {
        month,
        meterId,
        totalKwh: round(totalKwh),
        unitRate: config.unitRate,
        energyCharge,
        fixedCharge: config.fixedCharge,
        taxes,
        totalAmount
    };
};
export const filterReadingsForMonth = (readings, month) => readings.filter((reading) => reading.timestamp.startsWith(month));
export const buildConsumptionTrend = (readings) => {
    const buckets = new Map();
    readings.forEach((reading) => {
        const day = reading.timestamp.slice(0, 10);
        buckets.set(day, round((buckets.get(day) ?? 0) + reading.kwh));
    });
    return Array.from(buckets.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([day, totalKwh]) => ({ day, totalKwh }));
};
export const buildBillDetail = (meterId, month, monthlyReadings, plan, config) => {
    const sorted = [...monthlyReadings].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const lastReading = sorted[0] ?? null;
    const currentReading = sorted[sorted.length - 1] ?? null;
    const totalKwh = monthlyReadings.reduce((sum, r) => sum + r.kwh, 0);
    const maxDemandKwh = monthlyReadings.reduce((max, r) => Math.max(max, r.kwh), 0);
    const { parts, total } = applySlabs(totalKwh, plan.slabs);
    const taxes = round(total * plan.taxRate);
    const totalAmount = round(total + plan.fixedCharge + taxes);
    return {
        month,
        meterId,
        totalKwh: round(totalKwh),
        unitRate: 0,
        energyCharge: total,
        fixedCharge: plan.fixedCharge,
        taxes,
        totalAmount,
        slabs: parts,
        lastReading,
        currentReading,
        maxDemandKwh: round(maxDemandKwh),
        planName: plan.name
    };
};
