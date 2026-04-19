import dotenv from "dotenv";

dotenv.config();

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
const meterIds = (process.env.METER_IDS ?? "meter-001,meter-002,meter-003,meter-004,meter-005,meter-006")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const intervalMs = Number(process.env.INTERVAL_MS ?? 600000);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clusterForMeter = (meterId: string): "cluster-a" | "cluster-b" => {
  const num = Number(meterId.split("-").pop() ?? "1");
  return num <= 3 ? "cluster-a" : "cluster-b";
};

const readingForTick = (meterId: string, tick: number) => {
  const cluster = clusterForMeter(meterId);
  const meterNum = Number(meterId.split("-").pop() ?? "1");
  const baseOffset = cluster === "cluster-a" ? 0 : 3;
  const baseKwh = 8 + baseOffset + (tick % 6) * 1.1 + meterNum * 0.2;
  const fraudSpike = tick > 0 && tick % 12 === 0 && meterId === "meter-006" ? 14 : 0;

  return {
    timestamp: new Date().toISOString(),
    kwh: Number((baseKwh + fraudSpike).toFixed(2)),
    voltage: tick % 10 === 0 && meterId === "meter-006" ? 205 : 228 + (tick % 3),
    current: tick % 10 === 0 && meterId === "meter-006" ? 8.8 : Number((4.8 + (tick % 4) * 0.35).toFixed(2)),
    source: "iot"
  } as const;
};

const publishReading = async (meterId: string, tick: number): Promise<void> => {
  const reading = readingForTick(meterId, tick);
  const response = await fetch(`${apiBaseUrl}/api/iot/meters/${meterId}/readings`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(reading)
  });

  const body = await response.json() as { alert?: { severity: string; reason: string } };

  if (!response.ok) {
    throw new Error(`Reading publish failed for ${meterId}: ${response.status} ${JSON.stringify(body)}`);
  }

  const alertSuffix = body.alert ? ` | alert=${body.alert.severity}` : "";
  console.log(`[${new Date().toISOString()}] ${meterId} (${clusterForMeter(meterId)}) kwh=${reading.kwh}${alertSuffix}`);
};

const main = async (): Promise<void> => {
  if (meterIds.length === 0) {
    throw new Error("No meter IDs configured. Set METER_IDS in .env");
  }

  console.log(`Simulator started for ${meterIds.length} meters -> ${apiBaseUrl} at ${(intervalMs / 1000).toFixed(0)}s interval`);

  let tick = 1;
  while (true) {
    await Promise.all(meterIds.map((meterId) => publishReading(meterId, tick)));
    tick += 1;
    await delay(intervalMs);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});