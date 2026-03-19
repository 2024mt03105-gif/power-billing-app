import dotenv from "dotenv";

dotenv.config();

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
const meterId = process.env.METER_ID ?? "meter-001";
const intervalMs = Number(process.env.INTERVAL_MS ?? 600000);
const autoRegister = (process.env.AUTO_REGISTER ?? "false").toLowerCase() === "true";
const simulatorToken = process.env.SIMULATOR_TOKEN ?? "";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readingForTick = (tick: number) => {
  const baseKwh = 10 + (tick % 6) * 1.2;
  const fraudSpike = tick > 0 && tick % 12 === 0 ? 18 : 0;

  return {
    timestamp: new Date().toISOString(),
    kwh: Number((baseKwh + fraudSpike).toFixed(2)),
    voltage: tick % 10 === 0 ? 205 : 228 + (tick % 3),
    current: tick % 10 === 0 ? 8.9 : Number((5 + (tick % 4) * 0.4).toFixed(1)),
    source: "iot"
  } as const;
};

const authHeaders = (): HeadersInit => simulatorToken
  ? { Authorization: `Bearer ${simulatorToken}` }
  : {};

const ensureMeter = async (): Promise<void> => {
  if (!autoRegister) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/meters`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error(`Unable to list meters: ${response.status}. Set SIMULATOR_TOKEN if AUTO_REGISTER is enabled.`);
  }

  const payload = await response.json() as { items: Array<{ id: string }> };
  const exists = payload.items.some((meter) => meter.id === meterId);

  if (exists) {
    return;
  }

  const createResponse = await fetch(`${apiBaseUrl}/api/meters`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify({
      customerId: `cust-${meterId}`,
      serialNumber: `SIM-${meterId}`,
      location: "Simulator Feed"
    })
  });

  if (!createResponse.ok) {
    throw new Error(`Unable to auto-register meter: ${createResponse.status}`);
  }
};

const publishReading = async (tick: number): Promise<void> => {
  const reading = readingForTick(tick);
  const response = await fetch(`${apiBaseUrl}/api/iot/meters/${meterId}/readings`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(reading)
  });

  const body = await response.json() as { alert?: { severity: string; reason: string } };

  if (!response.ok) {
    throw new Error(`Reading publish failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const alertSuffix = body.alert ? ` | alert=${body.alert.severity} ${body.alert.reason}` : "";
  console.log(`[${new Date().toISOString()}] sent kwh=${reading.kwh} voltage=${reading.voltage} current=${reading.current}${alertSuffix}`);
};

const main = async (): Promise<void> => {
  await ensureMeter();
  console.log(`Simulator started for meter ${meterId} -> ${apiBaseUrl} at ${intervalMs / 60000} minute interval`);

  let tick = 1;
  while (true) {
    await publishReading(tick);
    tick += 1;
    await delay(intervalMs);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
