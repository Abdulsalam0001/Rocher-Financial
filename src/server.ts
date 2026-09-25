import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3000);
const prisma = new PrismaClient();
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const secret = process.env.SESSION_SECRET ?? "prototype-session-secret";
const cookieName = "rm_session";


const loginChallenges = new Map<string, { answer: string; expiresAt: number }>();

function createLoginChallenge() {
  const a = Math.floor(Math.random() * 9) + 2;
  const b = Math.floor(Math.random() * a) + 1;
  const operation = Math.random() > 0.5 ? "+" : "−";
  const answer = operation === "+" ? a + b : a - b;
  const id = randomBytes(18).toString("hex");
  loginChallenges.set(id, { answer: String(answer), expiresAt: Date.now() + 5 * 60 * 1000 });
  return { id, question: `${a} ${operation} ${b} = ?` };
}

function consumeLoginChallenge(id: string, answer: string) {
  const challenge = loginChallenges.get(id);
  if (!challenge || challenge.expiresAt < Date.now()) {
    if (id) loginChallenges.delete(id);
    return false;
  }
  loginChallenges.delete(id);
  return challenge.answer === String(answer).trim();
}


app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'"], connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "32kb" }));
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

const authAttempts = new Map<string, { count: number; resetAt: number }>();
function allowAuthAttempt(key: string) {
  const now=Date.now(), current=authAttempts.get(key);
  if(!current||current.resetAt<=now){authAttempts.set(key,{count:1,resetAt:now+600000});return true;}
  if(current.count>=12)return false; current.count++; return true;
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

app.get("/api/auth/login-challenge", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(createLoginChallenge());
});


app.post("/api/contact", async (req, res) => {
  const name=String(req.body?.name??"").trim(), email=String(req.body?.email??"").trim().toLowerCase(), subject=String(req.body?.subject??"").trim(), message=String(req.body?.message??"").trim();
  if(!name||!email||!subject||!message)return res.status(400).json({error:"Name, email, subject and message are required."});
  if(name.length>120||email.length>254||subject.length>120||message.length>4000)return res.status(400).json({error:"One or more fields are too long."});
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return res.status(400).json({error:"Please enter a valid email address."});
  const ticket=await prisma.contactMessage.create({data:{name,email,subject,message}});
  res.status(201).json({ok:true,id:ticket.id});
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "rocher-mutuel-financial", environment: process.env.NODE_ENV ?? "development" });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, area, challengeId, challengeAnswer } = req.body as { email?: string; password?: string; area?: "customer" | "admin"; challengeId?: string; challengeAnswer?: string };
  if (!email || !password || !area) return res.status(400).json({ error: "Email, password and login area are required." });
  if (!allowAuthAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many login attempts. Please wait a few minutes and try again." });
  if (area === "customer") {
    if (!challengeId || challengeAnswer === undefined) return res.status(400).json({ error: "Email, password and security check are required." });
    if (!consumeLoginChallenge(String(challengeId), String(challengeAnswer))) return res.status(401).json({ error: "Security check failed. Please complete a new challenge." });
  }

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

app.post("/api/customer/change-password", requireRole("CUSTOMER"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required." });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  if (String(currentPassword) === String(newPassword)) {
    return res.status(400).json({ error: "New password must be different from your current password." });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE") {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!verifyPassword(String(currentPassword), user.passwordHash)) {
    await prisma.securityEvent.create({ data: { userId: session.userId, event: "PASSWORD_CHANGE_FAILED" } });
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: hashPassword(String(newPassword)) }
  });
  await prisma.securityEvent.create({ data: { userId: session.userId, event: "PASSWORD_CHANGED" } });
  await audit(session.userId, "CHANGE_PASSWORD", "USER", session.userId);

  res.json({ ok: true, message: "Password changed successfully." });
});

app.delete("/api/admin/customers/:customerId", requireRole("ADMIN"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const customerId = String(req.params.customerId);
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, include: { user: { select: { id: true, staff: true } }, accounts: { include: { account: true } } } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  if (customer.user.staff) return res.status(400).json({ error: "Staff accounts cannot be deleted from customer management." });
  await prisma.$transaction(async tx => {
    const accountIds = customer.accounts.map(h => h.accountId);
    if (accountIds.length) {
      await tx.ledgerEntry.deleteMany({ where: { accountId: { in: accountIds } } });
      await tx.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
      await tx.account.deleteMany({ where: { id: { in: accountIds } } });
    }
    await tx.customer.delete({ where: { id: customerId } });
    await tx.user.delete({ where: { id: customer.user.id } });
  });
  await audit(session.userId, "DELETE_CUSTOMER", "CUSTOMER", customerId);
  res.json({ ok: true, message: "Customer and associated account records deleted." });
});

app.post("/api/admin/customers/:customerId/password", requireRole("ADMIN"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const { customerId } = req.params;
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword) return res.status(400).json({ error: "New password is required." });
  if (String(newPassword).length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });

  const customer = await prisma.customer.findUnique({
    where: { id: String(customerId) }
  });
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const customerUser = await prisma.user.findUnique({
    where: { id: customer.userId },
    select: { id: true, status: true }
  });
  if (!customerUser) return res.status(404).json({ error: "Customer login account not found." });
  if (customerUser.status !== "ACTIVE") return res.status(400).json({ error: "This customer's account is not active." });

  await prisma.user.update({
    where: { id: customer.userId },
    data: { passwordHash: hashPassword(String(newPassword)) }
  });

  await prisma.securityEvent.create({
    data: { userId: customer.userId, event: "PASSWORD_RESET_BY_ADMIN", metadata: { adminUserId: session.userId } }
  });
  await audit(session.userId, "RESET_CUSTOMER_PASSWORD", "USER", customer.userId);

  res.json({ ok: true, message: "Customer password has been changed successfully." });
});

app.get("/api/customer/me", requireRole("CUSTOMER"), async (_req, res) => {
  const session = res.locals.session as { userId: string };
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  try {
    const customer = await prisma.customer.findUnique({
      where: { userId: session.userId },
      include: { user: { select: { email: true, status: true, lastLoginAt: true } } }
    });
    if (!customer) return res.status(404).json({ error: "Customer profile not found for this login." });

    // Load the customer's accounts directly through AccountHolder so the dashboard
    // is not dependent on Prisma's nested relation serialization.
    const accounts = await prisma.account.findMany({
      where: { holders: { some: { customerId: customer.id } } },
      orderBy: { createdAt: "asc" }
    });

    const ids = accounts.map((account) => account.id);
    const transactions = ids.length
      ? await prisma.transaction.findMany({ where: { accountId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 10 })
      : [];

    const balancesByCurrency = accounts.reduce<Record<string, string>>((result, account) => {
      const current = BigInt(result[account.currency] ?? "0");
      result[account.currency] = (current + account.balanceMinor).toString();
      return result;
    }, {});

    return res.json({
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.user.email,
        phone: customer.phone,
        country: customer.country
      },
      accounts: accounts.map((account) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        type: account.type,
        currency: account.currency,
        status: account.status,
        balanceMinor: account.balanceMinor.toString()
      })),
      balancesByCurrency,
      // Keep the primary available balance explicit for the customer dashboard.
      // The UI should not have to infer the displayed balance from the currency map.
      availableBalanceMinor: accounts[0]?.balanceMinor.toString() ?? "0",
      availableBalanceCurrency: accounts[0]?.currency ?? null,
      transactions: transactions.map((transaction) => ({
        reference: transaction.reference,
        type: transaction.type,
        status: transaction.status,
        amountMinor: transaction.amountMinor.toString(),
        currency: transaction.currency,
        description: transaction.description,
        createdAt: transaction.createdAt
      }))
    });
  } catch (error) {
    console.error("CUSTOMER_DASHBOARD_LOAD_ERROR", error);
    return res.status(500).json({ error: "Unable to load your customer banking data. Please try again." });
  }
});


const DEFAULT_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "NGN", "CAD", "AUD"];

async function getSupportedCurrencies() {
  let rows = await prisma.currencySetting.findMany({ where: { enabled: true }, orderBy: { code: "asc" } });
  if (!rows.length) {
    await prisma.currencySetting.createMany({ data: DEFAULT_CURRENCIES.map(code => ({ code, enabled: true })), skipDuplicates: true });
    rows = await prisma.currencySetting.findMany({ where: { enabled: true }, orderBy: { code: "asc" } });
  }
  return rows.map(row => row.code);
}

function validTransferType(value: unknown) {
  return ["WIRE", "SWIFT", "SEPA", "INTERNAL"].includes(String(value).toUpperCase());
}

app.get("/api/customer/currencies", requireRole("CUSTOMER"), async (_req, res) => {
  res.json({ currencies: await getSupportedCurrencies() });
});

app.get("/api/admin/currencies", requireRole("ADMIN"), async (_req, res) => {
  let currencies = await prisma.currencySetting.findMany({ orderBy: [{ enabled: "desc" }, { code: "asc" }] });
  if (!currencies.length) {
    await getSupportedCurrencies();
    currencies = await prisma.currencySetting.findMany({ orderBy: [{ enabled: "desc" }, { code: "asc" }] });
  }
  res.json(currencies);
});

app.post("/api/admin/currencies", requireRole("ADMIN"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const raw = Array.isArray(req.body?.currencies) ? req.body.currencies : String(req.body?.currencies ?? "").split(",");
  const codes: string[] = Array.from(new Set<string>(raw.map((v: unknown) => String(v).trim().toUpperCase()).filter((v: string) => /^[A-Z]{3}$/.test(v))));
  if (!codes.length) return res.status(400).json({ error: "Add at least one valid 3-letter currency code." });
  await prisma.$transaction(async tx => {
    await tx.currencySetting.updateMany({ data: { enabled: false } });
    for (const code of codes) {
      await tx.currencySetting.upsert({ where: { code }, create: { code, enabled: true }, update: { enabled: true } });
    }
  });
  await audit(session.userId, "UPDATE_SUPPORTED_CURRENCIES", "CURRENCY_SETTINGS", codes.join(","));
  res.json({ ok: true, currencies: await getSupportedCurrencies() });
});

app.get("/api/customer/transfer-pin", requireRole("CUSTOMER"), async (_req, res) => {
  const session = res.locals.session as { userId: string };
  const pin = await prisma.transferPin.findUnique({ where: { userId: session.userId } });
  res.json({
    configured: Boolean(pin),
    lockedUntil: pin?.lockedUntil ?? null
  });
});

app.get("/api/customer/beneficiaries", requireRole("CUSTOMER"), async (_req, res) => {
  const session = res.locals.session as { userId: string };
  const customer = await prisma.customer.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  const beneficiaries = await prisma.beneficiary.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } });
  res.json(beneficiaries);
});

app.post("/api/customer/beneficiaries", requireRole("CUSTOMER"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  try {
  const customer = await prisma.customer.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const body = (req.body ?? {}) as {
    name?: string; bankName?: string; country?: string; currency?: string;
    accountNumber?: string; iban?: string; swiftBic?: string; bankAddress?: string; transferType?: string;
  };
  const name = String(body.name ?? "").trim();
  const bankName = String(body.bankName ?? "").trim();
  const country = String(body.country ?? "").trim();
  const currency = String(body.currency ?? "EUR").trim().toUpperCase();
  const accountNumber = String(body.accountNumber ?? "").trim();
  const transferType = String(body.transferType ?? "WIRE").trim().toUpperCase();

  if (!name || !bankName || !country || !accountNumber) {
    return res.status(400).json({ error: "Beneficiary name, bank, country and account number are required." });
  }
  const supportedCurrencies = await getSupportedCurrencies();
  if (!supportedCurrencies.includes(currency)) return res.status(400).json({ error: "That currency is not currently enabled by administration." });
  if (!validTransferType(transferType)) return res.status(400).json({ error: "Unsupported transfer type." });

  const beneficiary = await prisma.beneficiary.create({
    data: {
      customerId: customer.id, name, bankName, country, currency, accountNumber,
      iban: String(body.iban ?? "").trim() || null, swiftBic: String(body.swiftBic ?? "").trim().toUpperCase() || null,
      bankAddress: String(body.bankAddress ?? "").trim() || null, transferType
    }
  });
  await audit(session.userId, "CREATE_BENEFICIARY", "BENEFICIARY", beneficiary.id);
  res.status(201).json(beneficiary);
  } catch (error) {
    console.error("BENEFICIARY_CREATE_ERROR", error);
    res.status(500).json({ error: "We could not save this beneficiary. Please try again." });
  }
});

app.post("/api/customer/transfers", requireRole("CUSTOMER"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const body = (req.body ?? {}) as { sourceAccountId?: string; beneficiaryId?: string; amount?: string|number; transferType?: string; transferPin?: string; reference?: string; recipientName?: string; recipientBankName?: string; recipientCountry?: string; recipientCurrency?: string; recipientAccountNumber?: string; recipientIban?: string; recipientSwiftBic?: string; recipientBankAddress?: string };
  if (!body.sourceAccountId || body.amount === undefined || !body.transferPin) return res.status(400).json({ error:"Source account, amount and Transfer PIN are required." });
  const type=String(body.transferType??"WIRE").toUpperCase();
  if(!validTransferType(type)) return res.status(400).json({error:"Unsupported transfer type."});
  const amount=Number(body.amount); if(!Number.isFinite(amount)||amount<=0) return res.status(400).json({error:"Transfer amount must be greater than zero."});
  const pin=await prisma.transferPin.findUnique({where:{userId:session.userId}});
  if(!pin) return res.status(409).json({error:"TRANSFER_PIN_NOT_SET",message:"Your Transfer PIN has not been issued yet. Please contact customer care."});
  if(pin.lockedUntil&&pin.lockedUntil>new Date()) return res.status(423).json({error:"Transfer authorization is temporarily locked.",lockedUntil:pin.lockedUntil});
  if(!verifyPassword(String(body.transferPin),pin.pinHash)){const failed=pin.failedAttempts+1;const locked=failed>=5?new Date(Date.now()+15*60*1000):null;await prisma.transferPin.update({where:{id:pin.id},data:{failedAttempts:failed,lockedUntil:locked}});return res.status(401).json({error:locked?"Too many incorrect PIN attempts. Transfers are locked for 15 minutes.":"Incorrect Transfer PIN."});}
  const customer=await prisma.customer.findUnique({where:{userId:session.userId},include:{accounts:{include:{account:true}}}});
  if(!customer)return res.status(404).json({error:"Customer not found."});
  const source=customer.accounts.find(h=>h.account.id===body.sourceAccountId)?.account;
  if(!source)return res.status(404).json({error:"Source account not found."});
  if(source.status!=="ACTIVE")return res.status(400).json({error:"This account cannot make transfers."});
  const beneficiaryId=String(body.beneficiaryId??"").trim();
  let recipient:{id:string|null;name:string;bankName:string;country:string;currency:string;accountNumber:string;iban:string|null;swiftBic:string|null;bankAddress:string|null};
  if(beneficiaryId && beneficiaryId!=="ONE_TIME"){
    const saved=await prisma.beneficiary.findFirst({where:{id:beneficiaryId,customerId:customer.id}});
    if(!saved)return res.status(404).json({error:"Beneficiary not found."});
    recipient={id:saved.id,name:saved.name,bankName:saved.bankName,country:saved.country,currency:saved.currency,accountNumber:saved.accountNumber,iban:saved.iban,swiftBic:saved.swiftBic,bankAddress:saved.bankAddress};
  }else{
    const name=String(body.recipientName??"").trim(),bankName=String(body.recipientBankName??"").trim(),country=String(body.recipientCountry??"").trim(),currency=String(body.recipientCurrency??"").trim().toUpperCase(),accountNumber=String(body.recipientAccountNumber??"").trim();
    if(!name||!bankName||!country||!currency||!accountNumber)return res.status(400).json({error:"One-time recipient name, bank, country, currency and account number are required."});
    const supportedCurrencies=await getSupportedCurrencies();
    if(!supportedCurrencies.includes(currency))return res.status(400).json({error:"That recipient currency is not currently enabled by administration."});
    recipient={id:null,name,bankName,country,currency,accountNumber,iban:String(body.recipientIban??"").trim()||null,swiftBic:String(body.recipientSwiftBic??"").trim().toUpperCase()||null,bankAddress:String(body.recipientBankAddress??"").trim()||null};
  }
  
  const amountMinor=BigInt(Math.round(amount*100)); if(amountMinor<=0n)return res.status(400).json({error:"Transfer amount is too small."});
  const reference=`RM-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const description=body.reference?.trim()||`${type} transfer to ${recipient.name}`;
  const conversion=recipient.currency!==source.currency;
  const tx=await prisma.$transaction(async db=>{
    const t=await db.transaction.create({data:{reference,accountId:source.id,type:"TRANSFER",status:"PROCESSING",amountMinor,currency:source.currency,description,metadata:{source:"prototype_transfer",transferType:type,beneficiaryId:recipient.id,oneTimeRecipient:recipient.id===null,sourceCurrency:source.currency,targetCurrency:recipient.currency,currencyConversion:conversion,conversionFeeNotice:conversion?"Service fee applies and will be confirmed before processing.":null,beneficiary:{name:recipient.name,bankName:recipient.bankName,country:recipient.country,accountNumber:recipient.accountNumber,iban:recipient.iban,swiftBic:recipient.swiftBic,bankAddress:recipient.bankAddress}}}});
    await db.transferPin.update({where:{id:pin.id},data:{failedAttempts:0,lockedUntil:null}});
    return t;
  });
  await audit(session.userId,"CREATE_TRANSFER","TRANSACTION",reference);
  await prisma.securityEvent.create({data:{userId:session.userId,event:"TRANSFER_PROCESSING",metadata:{reference,transferType:type,amount,currency:source.currency,oneTimeRecipient:recipient.id===null}}});
  res.status(201).json({ok:true,reference,status:"PROCESSING",currencyConversion:conversion,message:conversion?"Transfer received. Currency conversion service fee applies and will be confirmed before processing.":"Transfer received and is processing. Please contact customer care for assistance."});
});

app.post("/api/admin/customers/:customerId/transfer-pin", requireRole("ADMIN"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const customer = await prisma.customer.findUnique({ where: { id: String(req.params.customerId) }, select: { id: true, userId: true, firstName: true, lastName: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const pin = String(req.body?.pin ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "Transfer PIN must contain exactly 6 digits." });

  await prisma.transferPin.upsert({
    where: { userId: customer.userId },
    create: { userId: customer.userId, pinHash: hashPassword(pin), failedAttempts: 0, lockedUntil: null },
    update: { pinHash: hashPassword(pin), failedAttempts: 0, lockedUntil: null }
  });
  await audit(session.userId, "ISSUE_TRANSFER_PIN", "CUSTOMER", customer.id);
  await prisma.securityEvent.create({ data: { userId: customer.userId, event: "TRANSFER_PIN_ISSUED", metadata: { issuedBy: session.userId } } });

  res.json({ ok: true, message: "Transfer PIN issued for the customer." });
});

app.get("/api/admin/contact-messages", requireRole("ADMIN"), async (_req, res) => {
  const messages=await prisma.contactMessage.findMany({orderBy:{createdAt:"desc"},take:100});
  res.json(messages);
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
  const { firstName, lastName, email, password, phone, country, accountType = "CURRENT", currency = "EUR", generateHistory = false } = req.body;
  const supportedCurrencies = await getSupportedCurrencies();
  if (!supportedCurrencies.includes(String(currency).toUpperCase())) return res.status(400).json({ error: "That currency is not currently enabled by administration." });
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ error: "First name, last name, email and temporary password are required." });
  if (String(password).length < 8) return res.status(400).json({ error: "Temporary password must be at least 8 characters." });
  const normalizedEmail = String(email).trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) return res.status(409).json({ error: "A user with this email already exists." });

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        firstName, lastName, phone, country,
        user: { create: { email: normalizedEmail, passwordHash: hashPassword(String(password)) } },
        accounts: { create: { account: { create: { accountNumber: `RM${Date.now().toString().slice(-10)}`, type: accountType, currency } } } }
      },
      include: { accounts: { include: { account: true } } }
    });

    const account = created.accounts[0]?.account;
    if (!account) throw new Error("Unable to create customer account.");

    if (generateHistory === true) {
      let balance = BigInt(0);
      const now = Date.now();
      const events = [
        { type: "DEPOSIT" as const, min: 25000, max: 90000, descriptions: ["Initial funding", "Opening deposit", "Private client funding"] },
        { type: "DEPOSIT" as const, min: 3000, max: 18000, descriptions: ["Salary credit", "Incoming transfer", "Portfolio transfer", "Client deposit"] },
        { type: "WITHDRAWAL" as const, min: 700, max: 6500, descriptions: ["Card purchase", "Outgoing transfer", "Bill payment", "Service payment"] },
        { type: "DEPOSIT" as const, min: 2000, max: 12000, descriptions: ["Incoming transfer", "Funds received", "Account credit"] },
        { type: "WITHDRAWAL" as const, min: 500, max: 5000, descriptions: ["Card purchase", "Outgoing transfer", "Payment"] },
        { type: "WITHDRAWAL" as const, min: 800, max: 7500, descriptions: ["Transfer", "Payment", "Card purchase"] },
        { type: "DEPOSIT" as const, min: 1500, max: 10000, descriptions: ["Incoming transfer", "Account credit", "Funds received"] },
        { type: "WITHDRAWAL" as const, min: 600, max: 4500, descriptions: ["Payment", "Card purchase", "Outgoing transfer"] },
        { type: "DEPOSIT" as const, min: 2000, max: 14000, descriptions: ["Client deposit", "Incoming transfer", "Salary credit"] },
        { type: "WITHDRAWAL" as const, min: 500, max: 6000, descriptions: ["Outgoing transfer", "Payment", "Card purchase"] }
      ];

      for (let i = 0; i < events.length; i += 1) {
        const event = events[i];
        let amount = Math.round((event.min + Math.random() * (event.max - event.min)) * 100);
        let direction = event.type;

        if (direction === "WITHDRAWAL" && balance < BigInt(amount)) {
          direction = "DEPOSIT";
          amount = Math.round((5000 + Math.random() * 15000) * 100);
        }

        const amountMinor = BigInt(amount);
        balance = direction === "DEPOSIT" ? balance + amountMinor : balance - amountMinor;
        const createdAt = new Date(now - (events.length - i) * (3 + Math.floor(Math.random() * 10)) * 86400000);
        const description = event.descriptions[Math.floor(Math.random() * event.descriptions.length)];
        const reference = `RM-${createdAt.getTime()}-${randomBytes(3).toString("hex").toUpperCase()}`;

        const transaction = await tx.transaction.create({
          data: {
            reference,
            accountId: account.id,
            type: direction,
            status: "COMPLETED",
            amountMinor,
            currency,
            description,
            metadata: { source: "demo_history_generator" },
            createdAt
          }
        });

        await tx.ledgerEntry.create({
          data: {
            transactionId: transaction.id,
            accountId: account.id,
            amountMinor,
            currency,
            direction: direction === "DEPOSIT" ? "CREDIT" : "DEBIT",
            createdAt
          }
        });
      }

      await tx.account.update({
        where: { id: account.id },
        data: { balanceMinor: balance }
      });
    }

    return created;
  });

  await audit(session.userId, "CREATE_CUSTOMER", "CUSTOMER", customer.id);
  res.status(201).json({
    ok: true,
    customerId: customer.id,
    accountNumber: customer.accounts[0]?.account.accountNumber,
    historyGenerated: generateHistory === true
  });
});

app.get("/api/admin/balances", requireRole("ADMIN"), async (_req, res) => {
  const accounts = await prisma.account.findMany({
    include: { holders: { include: { customer: true } } },
    orderBy: { createdAt: "desc" }
  });
  const transactions = await prisma.transaction.findMany({
    where: { type: { in: ["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"] } },
    include: { account: { include: { holders: { include: { customer: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      type: a.type,
      currency: a.currency,
      status: a.status,
      balanceMinor: a.balanceMinor.toString(),
      customer: a.holders[0]?.customer ? {
        id: a.holders[0].customer.id,
        name: `${a.holders[0].customer.firstName} ${a.holders[0].customer.lastName}`
      } : null
    })),
    history: transactions.map((t) => ({
      id: t.id,
      reference: t.reference,
      accountId: t.accountId,
      accountNumber: t.account.accountNumber,
      customer: t.account.holders[0]?.customer ? `${t.account.holders[0].customer.firstName} ${t.account.holders[0].customer.lastName}` : "Unassigned",
      type: t.type,
      direction: t.type === "WITHDRAWAL" ? "DEBIT" : "CREDIT",
      status: t.status,
      amountMinor: t.amountMinor.toString(),
      currency: t.currency,
      description: t.description,
      createdAt: t.createdAt
    }))
  });
});

app.post("/api/admin/balances/adjust", requireRole("ADMIN"), async (req, res) => {
  const session = res.locals.session as { userId: string };
  const { accountId, direction, amount, description, effectiveAt } = req.body as {
    accountId?: string; direction?: "CREDIT" | "DEBIT"; amount?: string | number; description?: string; effectiveAt?: string;
  };
  if (!accountId || !direction || amount === undefined) return res.status(400).json({ error: "Account, direction and amount are required." });
  if (!["CREDIT", "DEBIT"].includes(direction)) return res.status(400).json({ error: "Direction must be CREDIT or DEBIT." });

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "Amount must be greater than zero." });

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: "Account not found." });

  const amountMinor = BigInt(Math.round(numericAmount * 100));
  if (amountMinor <= 0n) return res.status(400).json({ error: "Amount is too small." });
  if (direction === "DEBIT" && account.balanceMinor < amountMinor) return res.status(400).json({ error: "Insufficient balance for this debit." });

  const effectiveDate = effectiveAt ? new Date(String(effectiveAt)) : new Date();
  if (Number.isNaN(effectiveDate.getTime())) return res.status(400).json({ error: "Transaction date is invalid." });
  if (effectiveDate.getTime() > Date.now()) return res.status(400).json({ error: "Backdated history cannot use a future date." });

  const reference = `RM-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.account.update({
      where: { id: accountId },
      data: { balanceMinor: direction === "CREDIT" ? { increment: amountMinor } : { decrement: amountMinor } }
    });
    const transaction = await tx.transaction.create({
      data: {
        reference,
        accountId,
        type: direction === "CREDIT" ? "DEPOSIT" : "WITHDRAWAL",
        status: "COMPLETED",
        amountMinor,
        currency: account.currency,
        description: description?.trim() || (direction === "CREDIT" ? "Admin credit" : "Admin debit"),
        metadata: {
          source: effectiveAt ? "admin_backdated_adjustment" : "admin_balance_adjustment",
          direction,
          adminUserId: session.userId,
          backdated: Boolean(effectiveAt)
        },
        createdAt: effectiveDate
      }
    });
    await tx.ledgerEntry.create({
      data: {
        transactionId: transaction.id,
        accountId,
        amountMinor,
        currency: account.currency,
        direction,
        createdAt: effectiveDate
      }
    });
    return updated;
  });

  await audit(session.userId, `BALANCE_${direction}`, "ACCOUNT", accountId);
  res.status(201).json({
    ok: true,
    accountId,
    balanceMinor: result.balanceMinor.toString(),
    reference,
    effectiveAt: effectiveDate
  });
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
