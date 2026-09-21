import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  await prisma.branch.upsert({
    where: { id: "demo-monaco-branch" },
    update: {},
    create: {
      id: "demo-monaco-branch",
      name: "Rocher Mutuel Financial — Monaco",
      city: "Monaco",
      country: "Monaco",
      address: "Monaco"
    }
  });

  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "change-me-admin";
  const customerPassword = process.env.DEMO_CUSTOMER_PASSWORD ?? "change-me-customer";

  const admin = await prisma.user.upsert({
    where: { email: "admin@rocher-mutuel.example" },
    update: { passwordHash: hashPassword(adminPassword) },
    create: {
      email: "admin@rocher-mutuel.example",
      passwordHash: hashPassword(adminPassword),
      staff: { create: { role: "SUPER_ADMIN" } }
    }
  });

  const customer = await prisma.user.upsert({
    where: { email: "investor-demo@rocher-mutuel.example" },
    update: { passwordHash: hashPassword(customerPassword) },
    create: {
      email: "investor-demo@rocher-mutuel.example",
      passwordHash: hashPassword(customerPassword),
      customer: {
        create: {
          firstName: "Investor",
          lastName: "Demo",
          country: "Monaco"
        }
      }
    },
    include: { customer: true }
  });

  if (customer.customer) {
    const existingHolder = await prisma.accountHolder.findFirst({ where: { customerId: customer.customer.id } });
    if (!existingHolder) {
      const account = await prisma.account.create({
        data: {
          accountNumber: "RM00010001",
          type: "PRIVATE",
          currency: "EUR",
          balanceMinor: 125000000
        }
      });
      await prisma.accountHolder.create({ data: { accountId: account.id, customerId: customer.customer.id } });
      await prisma.transaction.create({
        data: {
          reference: "RM-DEMO-0001",
          accountId: account.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amountMinor: 125000000,
          currency: "EUR",
          description: "Opening demo balance"
        }
      });
    }
  }

  console.log(`Seeded admin: ${admin.email}`);
  console.log(`Seeded customer: ${customer.email}`);
  console.log("Set DEMO_ADMIN_PASSWORD and DEMO_CUSTOMER_PASSWORD in .env before seeding.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => prisma.$disconnect());
