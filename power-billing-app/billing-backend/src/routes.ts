import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { AuthUser, Meter, Reading, TariffPlan, TariffSlab } from "./domain.js";
import { authenticate, getAuthUser, requireRoles } from "./auth.js";
import { eventBus } from "./events.js";
import { repository } from "./repository.js";
import { buildBillDetail, buildConsumptionTrend, calculateMonthlyBill, filterReadingsForMonth } from "./services/billing.js";
import { detectFraud } from "./services/fraud.js";
import { buildBillPdf } from "./services/pdf.js";
import { logDuplicateSessionFraud } from "./services/sessionFraud.js";
import { detectSeasonalReplayFraud, logSeasonalReplayAlert } from "./services/seasonalFraud.js";
import { validateRegionalMismatch } from "./services/regionValidation.js";
import { processPowerSpike } from "./services/powerSpike.js";
import { processNonUsageAlert } from "./services/nonUsage.js";
import { logInvalidReading, validateReadingValue } from "./services/readingValidation.js";
import { processFraudEngine } from "./services/fraudEngine.js";

const meterSchema = z.object({
  customerId: z.string().min(1),
  serialNumber: z.string().min(1),
  location: z.string().min(1)
});

const readingSchema = z.object({
  timestamp: z.string().datetime(),
  kwh: z.number().positive(),
  voltage: z.number().positive(),
  current: z.number().positive(),
  source: z.enum(["iot", "manual"]).default("iot")
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const streamQuerySchema = z.object({ token: z.string().min(1) });

const tariffSchema = z.object({
  name: z.string().min(1),
  slabs: z.array(z.object({ upto: z.number().positive().nullable(), rate: z.number().positive() })).min(1),
  fixedCharge: z.number().nonnegative(),
  taxRate: z.number().nonnegative()
});

const seasonalProfileSchema = z.object({
  regionId: z.string().min(1),
  season: z.enum(["Summer", "Winter", "Monsoon"]),
  avgConsumptionKwh: z.number().nonnegative()
});

const powerSessionSchema = z
  .object({
    sessionId: z.string().min(1),
    meterId: z.string().min(1),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    regionId: z.string().min(1)
  })
  .superRefine((value, ctx) => {
    if (new Date(value.endTime).getTime() <= new Date(value.startTime).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime must be later than startTime"
      });
    }
  });

const meterRegionRegistrySchema = z.object({
  meterId: z.string().min(1),
  regionId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

const regionValidationSchema = z.object({
  meterId: z.string().min(1),
  regionId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

const spikeThresholdSchema = z.object({
  thresholdKw: z.number().positive()
});

const powerSampleSchema = z.object({
  timestamp: z.string().datetime(),
  powerKw: z.number().positive()
});

const fraudEnginePayloadSchema = z.object({
  meterId: z.string().min(1),
  timestamp: z.string().datetime(),
  reading: z
    .object({
      kwh: z.number(),
      voltage: z.number().positive(),
      current: z.number().positive(),
      source: z.enum(["iot", "manual"]).default("iot")
    })
    .optional(),
  powerSampleKw: z.number().positive().optional(),
  session: z
    .object({
      sessionId: z.string().min(1),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      regionId: z.string().min(1)
    })
    .optional(),
  regionCheck: z
    .object({
      regionId: z.string().min(1),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180)
    })
    .optional()
});

const sessionStartSchema = z.object({
  sessionId: z.string().min(1),
  meterId: z.string().min(1),
  startTime: z.string().datetime(),
  regionId: z.string().min(1)
});

const sessionStopSchema = z.object({
  endTime: z.string().datetime()
});

const ensureMeterAccess = (user: AuthUser, meter: Meter | null): Meter | null => {
  if (!meter) return null;
  if (user.role === "customer" && user.customerId !== meter.customerId) return null;
  return meter;
};

const calculateDueDate = (month: string): string => {
  const due = new Date(`${month}-01T00:00:00.000Z`);
  due.setUTCMonth(due.getUTCMonth() + 1);
  due.setUTCDate(due.getUTCDate() + 10);
  return due.toISOString().slice(0, 10);
};

export const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/health", async () => ({ status: "ok", service: "billing-backend" }));

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await repository.getUserByUsername(body.username);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ message: "Invalid username or password" });
    }
    const authUser: AuthUser = { sub: user.id, username: user.username, role: user.role, customerId: user.customerId };
    const token = await reply.jwtSign(authUser, { expiresIn: "12h" });
    return { token, user: authUser };
  });

  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => ({ user: getAuthUser(request) }));

  app.get("/api/meters", { preHandler: [authenticate] }, async (request) => {
    const user = getAuthUser(request);
    return { items: await repository.listMeters(user.role === "customer" ? user.customerId : undefined) };
  });

  app.post("/api/meters", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const body = meterSchema.parse(request.body);
    const meter: Meter = {
      id: `meter-${crypto.randomUUID()}`,
      customerId: body.customerId,
      serialNumber: body.serialNumber,
      location: body.location,
      status: "active",
      installedAt: new Date().toISOString()
    };
    const saved = await repository.saveMeter(meter);
    eventBus.broadcast("meter.created", saved);
    return reply.code(201).send(saved);
  });

  app.get("/api/meters/:meterId/readings", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    return { meter, items: await repository.listReadings(params.meterId) };
  });

  app.get("/api/meters/:meterId/customer-profile", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const profile = await repository.getCustomerProfile(meter.customerId);
    if (!profile) return reply.code(404).send({ message: "Customer profile not found" });
    return { meter, profile };
  });

  app.get("/api/meters/:meterId/consumption/:month", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.params);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    const trend = buildConsumptionTrend(filterReadingsForMonth(await repository.listReadings(params.meterId), params.month));
    return { meter, month: params.month, items: trend };
  });

  app.post("/api/meters/:meterId/readings", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const body = readingSchema.parse(request.body);
    const meter = await repository.getMeter(params.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const previousReading = await repository.getLatestValidReading(params.meterId);
    const validation = validateReadingValue(body.kwh, previousReading, config.readingMaxDeltaKwh);

    const reading: Reading = {
      id: `reading-${crypto.randomUUID()}`,
      meterId: params.meterId,
      timestamp: body.timestamp,
      kwh: body.kwh,
      voltage: body.voltage,
      current: body.current,
      source: body.source,
      status: validation.status
    };

    const savedReading = await repository.addReading(reading);
    let validationError = null;
    let alert = null;
    let seasonalFraudEvent = null;
    let nonUsageAlert = null;

    if (validation.status === "INVALID") {
      validationError = await logInvalidReading(
        params.meterId,
        savedReading,
        previousReading,
        config.readingMaxDeltaKwh,
        validation.errorCodes,
        request.log
      );
    } else {
      const historicalReadings = await repository.listHistoricalReadingsBefore(params.meterId, body.timestamp);
      alert = detectFraud(params.meterId, savedReading, historicalReadings, config.billing);
      const seasonalFraud = await detectSeasonalReplayFraud(meter, savedReading, config.billing);
      nonUsageAlert = await processNonUsageAlert(meter, savedReading.timestamp, request.log);
      if (alert) {
        await repository.addFraudAlert(alert);
        eventBus.broadcast("fraud.alert", alert);
      }
      seasonalFraudEvent = seasonalFraud ? await logSeasonalReplayAlert(seasonalFraud, request.log) : null;
    }

    eventBus.broadcast("reading.created", savedReading);
    return reply.code(201).send({
      reading: savedReading,
      validation: { status: validation.status, thresholdKwh: config.readingMaxDeltaKwh, errorCodes: validation.errorCodes },
      validationError,
      alert,
      seasonalFraud: seasonalFraudEvent,
      nonUsageAlert
    });
  });

  app.get("/api/meters/:meterId/bills/:month", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.params);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const monthlyReadings = filterReadingsForMonth(await repository.listReadings(params.meterId), params.month);
    const plan = await repository.getActiveTariff();
    return calculateMonthlyBill(params.meterId, params.month, monthlyReadings, config.billing, plan ?? undefined);
  });

  app.get("/api/meters/:meterId/bills/history", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(36).default(12) }).parse(request.query);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const months = await repository.listBillingMonths(params.meterId, query.limit);
    const allReadings = await repository.listReadings(params.meterId);
    const plan = await repository.getActiveTariff();

    const items = months.map((monthKey) => {
      const monthReadings = filterReadingsForMonth(allReadings, monthKey);
      const bill = calculateMonthlyBill(params.meterId, monthKey, monthReadings, config.billing, plan ?? undefined);
      return {
        month: monthKey,
        totalKwh: bill.totalKwh,
        totalAmount: bill.totalAmount,
        dueDate: calculateDueDate(monthKey),
        pdfUrl: `/api/meters/${params.meterId}/bills/${monthKey}/pdf`
      };
    });

    return { meter, items };
  });

  app.get("/api/meters/:meterId/bills/:month/detail", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.params);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    const plan = await repository.getActiveTariff();
    if (!plan) return reply.code(500).send({ message: "No active tariff plan" });
    const monthlyReadings = filterReadingsForMonth(await repository.listReadings(params.meterId), params.month);
    return buildBillDetail(params.meterId, params.month, monthlyReadings, plan);
  });

  app.get("/api/meters/:meterId/bills/:month/pdf", { preHandler: [authenticate] }, async (request, reply) => {
    const user = getAuthUser(request);
    const params = z.object({ meterId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.params);
    const meter = ensureMeterAccess(user, await repository.getMeter(params.meterId));
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    const plan = await repository.getActiveTariff();
    if (!plan) return reply.code(500).send({ message: "No active tariff plan" });
    const monthlyReadings = filterReadingsForMonth(await repository.listReadings(params.meterId), params.month);
    const detail = buildBillDetail(params.meterId, params.month, monthlyReadings, plan);
    const pdf = buildBillPdf(detail, meter);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename=Bill-${params.meterId}-${params.month}.pdf`);
    return reply.send(pdf);
  });

  app.get("/api/fraud-alerts", { preHandler: [authenticate] }, async (request) => {
    const user = getAuthUser(request);
    const query = z.object({ meterId: z.string().optional() }).parse(request.query);
    const meterId = query.meterId;
    if (user.role === "customer" && meterId) {
      const meter = await repository.getMeter(meterId);
      if (!meter || meter.customerId !== user.customerId) return { items: [] };
    }
    if (user.role === "customer") {
      const meters = await repository.listMeters(user.customerId);
      const alerts = await Promise.all(meters.map((m) => repository.listFraudAlerts(m.id)));
      return { items: alerts.flat().sort((l, r) => r.detectedAt.localeCompare(l.detectedAt)) };
    }
    return { items: await repository.listFraudAlerts(meterId) };
  });

  app.get("/api/dashboard/overview/:month", { preHandler: [authenticate] }, async (request) => {
    const user = getAuthUser(request);
    const params = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.params);
    return repository.getDashboardOverview(params.month, user.role === "customer" ? user.customerId : undefined);
  });

  app.get("/api/dashboard/fraud/:month", { preHandler: [authenticate] }, async (request) => {
    const user = getAuthUser(request);
    const params = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.params);
    return repository.getFraudInsights(params.month, user.role === "customer" ? user.customerId : undefined);
  });

  app.get("/api/stream", async (request, reply) => {
    const query = streamQuerySchema.parse(request.query);
    try {
      await app.jwt.verify(query.token);
    } catch {
      return reply.code(401).send({ message: "Invalid stream token" });
    }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    reply.hijack();
    const subscriber = eventBus.subscribe(reply);
    subscriber.send("connected", { timestamp: new Date().toISOString() });
    request.raw.on("close", () => subscriber.close());
  });

  app.post("/api/iot/meters/:meterId/readings", async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const body = readingSchema.parse(request.body);
    const response = await app.inject({
      method: "POST",
      url: `/api/meters/${params.meterId}/readings`,
      headers: { authorization: `Bearer ${await app.jwt.sign({ sub: "user-admin", username: "admin", role: "admin", customerId: null })}` },
      payload: body
    });
    return reply.code(response.statusCode).send(response.json());
  });

  app.post("/api/validation/meters/:meterId/readings", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const body = readingSchema.parse(request.body);
    const response = await app.inject({
      method: "POST",
      url: `/api/meters/${params.meterId}/readings`,
      headers: { authorization: request.headers.authorization ?? "" },
      payload: body
    });
    return reply.code(response.statusCode).send(response.json());
  });

  app.post("/api/fraud-engine/process", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const body = fraudEnginePayloadSchema.parse(request.body);
    const meter = await repository.getMeter(body.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const result = await processFraudEngine(body, meter, request.log);
    return reply.code(201).send({
      meterId: body.meterId,
      timestamp: body.timestamp,
      reading: result.reading ?? null,
      eventsDetected: result.fraudEvents.length,
      fraudEvents: result.fraudEvents
    });
  });

  app.get("/api/fraud-engine/events", { preHandler: [authenticate] }, async (request) => {
    const user = getAuthUser(request);
    const query = z.object({ meterId: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(request.query);
    if (user.role === "customer" && query.meterId) {
      const meter = await repository.getMeter(query.meterId);
      if (!meter || meter.customerId !== user.customerId) return { items: [] };
    }
    if (user.role === "customer") {
      const meters = await repository.listMeters(user.customerId);
      const itemsPerMeter = await Promise.all(meters.map((m) => repository.listFraudEvents(m.id, query.limit)));
      return { items: itemsPerMeter.flat().sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, query.limit) };
    }
    return { items: await repository.listFraudEvents(query.meterId, query.limit) };
  });

  app.post("/api/meters/:meterId/power-samples", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const body = powerSampleSchema.parse(request.body);
    const meter = await repository.getMeter(params.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const threshold = await repository.getSpikeThreshold(params.meterId);
    const thresholdKw = threshold?.thresholdKw ?? config.defaultPowerSpikeKw;

    const spike = await processPowerSpike(
      {
        meterId: params.meterId,
        timestamp: body.timestamp,
        powerKw: body.powerKw
      },
      thresholdKw,
      request.log
    );

    eventBus.broadcast("meter.power_sample", {
      meterId: params.meterId,
      timestamp: body.timestamp,
      powerKw: body.powerKw,
      thresholdKw
    });

    return reply.code(201).send({
      meterId: params.meterId,
      timestamp: body.timestamp,
      powerKw: body.powerKw,
      thresholdKw,
      spike
    });
  });

  app.post("/api/iot/meters/:meterId/power-samples", async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const body = powerSampleSchema.parse(request.body);
    const response = await app.inject({
      method: "POST",
      url: `/api/meters/${params.meterId}/power-samples`,
      headers: { authorization: `Bearer ${await app.jwt.sign({ sub: "user-admin", username: "admin", role: "admin", customerId: null })}` },
      payload: body
    });
    return reply.code(response.statusCode).send(response.json());
  });

  app.post("/api/power-sessions", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const body = powerSessionSchema.parse(request.body);
    const existing = await repository.getPowerSessionById(body.sessionId);

    if (existing) {
      const duplicateSession = await repository.markPowerSessionAsDuplicate(body.sessionId);
      if (!duplicateSession) {
        return reply.code(500).send({ message: "Failed to mark duplicate session" });
      }

      const fraudEvent = await logDuplicateSessionFraud(duplicateSession, request.log);
      return reply.code(409).send({
        message: "Duplicate session ID detected",
        status: "DUPLICATE",
        session: duplicateSession,
        fraudEvent
      });
    }

    const savedSession = await repository.createPowerSession({
      sessionId: body.sessionId,
      meterId: body.meterId,
      startTime: body.startTime,
      endTime: body.endTime,
      regionId: body.regionId,
      status: "ACCEPTED"
    });

    eventBus.broadcast("session.created", savedSession);
    return reply.code(201).send({ status: "ACCEPTED", session: savedSession });
  });

  app.post("/api/consumption-sessions/start", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const body = sessionStartSchema.parse(request.body);
    const meter = await repository.getMeter(body.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const existingSessionId = await repository.getConsumptionSession(body.sessionId);
    if (existingSessionId) return reply.code(409).send({ message: "Session ID already exists" });

    const openSession = await repository.getOpenConsumptionSessionByMeterId(body.meterId);
    if (openSession) {
      return reply.code(409).send({ message: "An open session already exists for this meter", session: openSession });
    }

    const session = await repository.createConsumptionSession({
      sessionId: body.sessionId,
      meterId: body.meterId,
      startTime: body.startTime,
      endTime: null,
      totalEnergy: 0,
      peakPower: 0,
      regionId: body.regionId,
      status: "OPEN"
    });

    eventBus.broadcast("consumption.session.started", session);
    return reply.code(201).send({ session });
  });

  app.post("/api/consumption-sessions/:sessionId/stop", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
    const body = sessionStopSchema.parse(request.body);
    const session = await repository.getConsumptionSession(params.sessionId);
    if (!session) return reply.code(404).send({ message: "Session not found" });
    if (session.status === "CLOSED") return reply.code(409).send({ message: "Session already closed", session });
    if (new Date(body.endTime).getTime() <= new Date(session.startTime).getTime()) {
      return reply.code(400).send({ message: "endTime must be greater than startTime" });
    }

    const metrics = await repository.calculateConsumptionSessionMetrics(session.meterId, session.startTime, body.endTime);
    const closed = await repository.closeConsumptionSession(params.sessionId, body.endTime, metrics.totalEnergy, metrics.peakPower);
    if (!closed) return reply.code(500).send({ message: "Failed to close session" });

    eventBus.broadcast("consumption.session.closed", closed);
    return reply.code(200).send({ session: closed });
  });

  app.get("/api/consumption-sessions/:sessionId", { preHandler: [authenticate] }, async (request, reply) => {
    const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
    const session = await repository.getConsumptionSession(params.sessionId);
    if (!session) return reply.code(404).send({ message: "Session not found" });
    const user = getAuthUser(request);
    if (user.role === "customer") {
      const meter = await repository.getMeter(session.meterId);
      if (!meter || meter.customerId !== user.customerId) return reply.code(404).send({ message: "Session not found" });
    }
    return { session };
  });

  app.get("/api/meters/:meterId/consumption-sessions", { preHandler: [authenticate] }, async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    const meter = await repository.getMeter(params.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    const user = getAuthUser(request);
    if (user.role === "customer" && meter.customerId !== user.customerId) return reply.code(404).send({ message: "Meter not found" });
    return { meterId: params.meterId, items: await repository.listConsumptionSessions(params.meterId, query.limit) };
  });

  app.post("/api/validation/region-check", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const body = regionValidationSchema.parse(request.body);
    const meter = await repository.getMeter(body.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });

    const result = await validateRegionalMismatch(body, request.log);
    if (!result) {
      return reply.code(404).send({ message: "Meter region registration not found" });
    }

    if (result.status === "REGION_REPLAY") {
      return reply.code(409).send({
        status: "REGION_REPLAY",
        message: "Incoming region does not match registered region",
        registration: result.registration,
        fraudRecord: result.fraudRecord
      });
    }

    return reply.code(200).send({
      status: "VALID",
      registration: result.registration
    });
  });

  app.get("/admin/seasonal-profile", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const query = z.object({ regionId: z.string().min(1), season: z.enum(["Summer", "Winter", "Monsoon"]) }).parse(request.query);
    const profile = await repository.getSeasonalProfile(query.regionId, query.season);
    if (!profile) return reply.code(404).send({ message: "Seasonal profile not found" });
    return { profile };
  });

  app.post("/admin/seasonal-profile", { preHandler: [authenticate, requireRoles("admin")] }, async (request) => {
    const body = seasonalProfileSchema.parse(request.body);
    const profile = await repository.upsertSeasonalProfile({
      regionId: body.regionId,
      season: body.season,
      avgConsumptionKwh: body.avgConsumptionKwh,
      updatedAt: new Date().toISOString()
    });
    return { profile };
  });

  app.get("/admin/meter-region-registry/:meterId", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const registration = await repository.getMeterRegionRegistration(params.meterId);
    if (!registration) return reply.code(404).send({ message: "Meter region registration not found" });
    return { registration };
  });

  app.post("/admin/meter-region-registry", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const body = meterRegionRegistrySchema.parse(request.body);
    const meter = await repository.getMeter(body.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    const registration = await repository.upsertMeterRegionRegistration({
      meterId: body.meterId,
      regionId: body.regionId,
      latitude: body.latitude,
      longitude: body.longitude,
      updatedAt: new Date().toISOString()
    });
    return reply.code(201).send({ registration });
  });

  app.get("/admin/meters/:meterId/spike-threshold", { preHandler: [authenticate, requireRoles("admin")] }, async (request) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const threshold = await repository.getSpikeThreshold(params.meterId);
    return {
      meterId: params.meterId,
      thresholdKw: threshold?.thresholdKw ?? config.defaultPowerSpikeKw,
      source: threshold ? "meter" : "default"
    };
  });

  app.post("/admin/meters/:meterId/spike-threshold", { preHandler: [authenticate, requireRoles("admin")] }, async (request, reply) => {
    const params = z.object({ meterId: z.string().min(1) }).parse(request.params);
    const body = spikeThresholdSchema.parse(request.body);
    const meter = await repository.getMeter(params.meterId);
    if (!meter) return reply.code(404).send({ message: "Meter not found" });
    const threshold = await repository.upsertSpikeThreshold({
      meterId: params.meterId,
      thresholdKw: body.thresholdKw,
      updatedAt: new Date().toISOString()
    });
    return reply.code(201).send({ threshold });
  });

  app.post("/admin/monitor/non-usage", { preHandler: [authenticate, requireRoles("admin")] }, async (request) => {
    const query = z.object({ asOf: z.string().datetime().optional() }).parse(request.query);
    const asOf = query.asOf ?? new Date().toISOString();
    const meters = await repository.listMeters();

    const alerts = [];
    for (const meter of meters) {
      const alert = await processNonUsageAlert(meter, asOf, request.log);
      if (alert) {
        alerts.push(alert);
      }
    }

    return { asOf, checkedMeters: meters.length, nonUsageCount: alerts.length, items: alerts };
  });

  app.get("/admin/tariff", { preHandler: [authenticate, requireRoles("admin")] }, async () => {
    return { plan: await repository.getActiveTariff() };
  });

  app.post("/admin/tariff", { preHandler: [authenticate, requireRoles("admin")] }, async (request) => {
    const body = tariffSchema.parse(request.body);
    const plan: TariffPlan = {
      id: `tariff-${crypto.randomUUID()}`,
      name: body.name,
      slabs: body.slabs,
      fixedCharge: body.fixedCharge,
      taxRate: body.taxRate,
      active: true,
      updatedAt: new Date().toISOString()
    };
    return { plan: await repository.upsertTariff(plan) };
  });
};
