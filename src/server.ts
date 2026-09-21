import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const prisma = new PrismaClient();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const secret = process.env.SESSION_SECRET ?? "prototype-session-secret";
const cookieName = "rm_session";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(morgan("combined"));
app.use(express.static(publicDir));

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenFor(userId: string, role: "CUSTOMER" | "ADMIN") {
  const body = Buffer.from(JSON.stringify({ userId, role, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function sessionFrom(req: Request) {
  const raw = req.headers.cookie?.split(";").find((v) => v.trim().startsWith(`${cookieName}=`))?.split("=")[1];
  if (!raw) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString()) as { userId: string; role: "CUSTOMER" | "ADMIN"; exp: number };
    return value.exp > Date.now() ? value : null;
  } catch { return null; }
}

function setSession(res: Response, userId: string, role: "CUSTOMER" | "ADMIN") {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=${tokenFor(userId, role)}; HttpOnly; Path=/; SameSite=Lax${secure}`);
}

function requireRole(role: "CUSTOMER" | "ADMIN") {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = sessionFrom(req);
    if (!session || session.role !== role) return res.status(401).json({ error: "Authentication required." });
    res.locals.session = session;
    next();
  };
}

async function audit(userId: string, action: string, resource: string, resourceId?: string) {
  await prisma.auditLog.create({ data: { userId, action, resource, resourceId } });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "rocher-mutuel-financial", environment: process.env.NODE_ENV ?? "development" });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, area } = req.body as { email?: string; password?: string; area?: "customer" | "admin" };
  if (!email || !password || !area) return res.status(400).json({ error: "Email, password and login area are required." });

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { customer: true, staff: true } });
  if (!user || user.status !== "ACTIVE" || !verifyPassword(password, user.passwordHash)) {
    if (user) await prisma.securityEvent.create({ data: { userId: user.id, event: "LOGIN_FAILED" } });
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const role = area === "admin" ? "ADMIN" : "CUSTOMER";
  if (role === "ADMIN" && (!user.staff || !user.staff.active)) return res.status(403).json({ error: "Admin access is not enabled for this account." });
  if (role === "CUSTOMER" && !user.customer) return res.status(403).json({ error: "Customer access is not enabled for this account." });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.securityEvent.create({ data: { userId: user.id, event: "LOGIN_SUCCESS" } });
  await audit(user.id, "LOGIN", role === "ADMIN" ? "ADMIN_SESSION" : "CUSTOMER_SESSION");
  setSession(res, user.id, role);
  res.json({ redirect: role === "ADMIN" ? "/admin/dashboard.html" : "/dashboard.html" });
});

app.post("/api/auth/logout", async (req, res) => {
  const session = sessionFrom(req);
  if (session) await audit(session.userId, "LOGOUT", "SESSION");
  res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get("/api/customer/me", requireRole("CUSTOMER"), async (_req, res) => {
  const session = res.locals.session as { userId: string };
  const customer = await prisma.customer.findUnique({
    where: { userId: session.userId },
    include: { user: { select: { email: true, status: true, lastLoginAt: true } }, accounts: { include: { account: true } } }
  });
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const ids = customer.accounts.map((h) => h.account.id);
  const transactions = await prisma.transaction.findMany({ where: { accountId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 10 });
  res.json({
    customer: { firstName: customer.firstName, lastName: customer.lastName, email: customer.user.email, phone: customer.phone, country: customer.country },
    accounts: customer.accounts.map((h) => ({ accountNumber: h.account.accountNumber, type: h.account.type, currency: h.account.currency, status: h.account.status, balanceMinor: h.account.balanceMinor.toString() })),
    transactions: transactions.map((t) => ({ reference: t.reference, type: t.type, status: t.status, amountMinor: t.amountMinor.toString(), currency: t.currency, description: t.description, createdAt: t.createdAt }))
  });
});

app.get("/api/admin/overview", requireRole("ADMIN"), async (_req, res) => {
  const [customers, accounts, transactions, auditLogs] = await Promise.all([
    prisma.customer.count(), prisma.account.count(), prisma.transaction.count(), prisma.auditLog.count()
  ]);
  res.json({ customers, accounts, transactions, auditLogs });
});

app.get("/api/admin/customers", requireRole("ADMIN"), async (_req, res) => {
  const customers = await prisma.customer.findMany({
    include: { user: { select: { email: true, status: true, createdAt: true, lastLoginAt: true } }, accounts: { include: { account: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(customers.map((c) => ({
    id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.user.email, phone: c.phone, country: c.country,
    status: c.user.status, createdAt: c.createdAt, lastLoginAt: c.user.lastLoginAt,
    accounts: c.accounts.map((h) => ({ accountNumber: h.account.accountNumber, type: h.account.type, currency: h.account.currency, status: h.account.status, balanceMinor: h.account.balanceMinor.toString() }))
  })));
});

app.post("/api/admin/customers", requireRole("ADMIN"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const { firstName, lastName, email, password, phone, country, accountType = "CURRENT", currency = "EUR" } = req.body;
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ error: "First name, last name, email and temporary password are required." });
  if (String(password).length < 8) return res.status(400).json({ error: "Temporary password must be at least 8 characters." });
  const normalizedEmail = String(email).trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) return res.status(409).json({ error: "A user with this email already exists." });

  const customer = await prisma.customer.create({
    data: {
      firstName, lastName, phone, country,
      user: { create: { email: normalizedEmail, passwordHash: hashPassword(String(password)) } },
      accounts: { create: { account: { create: { accountNumber: `RM${Date.now().toString().slice(-10)}`, type: accountType, currency } } } }
    },
    include: { accounts: { include: { account: true } } }
  });
  await audit(session.userId, "CREATE_CUSTOMER", "CUSTOMER", customer.id);
  res.status(201).json({ ok: true, customerId: customer.id, accountNumber: customer.accounts[0]?.account.accountNumber });
});

app.get("/api/admin/history", requireRole("ADMIN"), async (_req, res) => {
  const [transactions, auditLogs, securityEvents] = await Promise.all([
    prisma.transaction.findMany({ include: { account: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true } } } }),
    prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true } } } })
  ]);
  res.json({
    transactions: transactions.map((t) => ({ reference: t.reference, type: t.type, status: t.status, amountMinor: t.amountMinor.toString(), currency: t.currency, description: t.description, accountNumber: t.account.accountNumber, createdAt: t.createdAt })),
    auditLogs, securityEvents
  });
});

app.get("*splat", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(port, () => console.log(`Rocher Mutuel Financial listening on port ${port}`));
