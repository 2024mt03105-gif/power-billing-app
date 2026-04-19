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

    const reading: Reading = {
      id: `reading-${crypto.randomUUID()}`,
      meterId: params.meterId,
      timestamp: body.timestamp,
      kwh: body.kwh,
      voltage: body.voltage,
      current: body.current,
      source: body.source
    };

    const historicalReadings = await repository.listHistoricalReadingsBefore(params.meterId, body.timestamp);
    const savedReading = await repository.addReading(reading);
    const alert = detectFraud(params.meterId, savedReading, historicalReadings, config.billing);
    if (alert) {
      await repository.addFraudAlert(alert);
      eventBus.broadcast("fraud.alert", alert);
    }
    eventBus.broadcast("reading.created", savedReading);
    return reply.code(201).send({ reading: savedReading, alert });
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
