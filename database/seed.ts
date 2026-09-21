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

  const adminEmails = [
    "dre@admin.com",
    "dreshaw2012@gmail.com"
  ];

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash: hashPassword(adminPassword),
        status: "ACTIVE",
        staff: {
          upsert: {
            create: { role: "SUPER_ADMIN", active: true },
            update: { role: "SUPER_ADMIN", active: true }
          }
        }
      },
      create: {
        email,
        passwordHash: hashPassword(adminPassword),
        status: "ACTIVE",
        staff: {
          create: { role: "SUPER_ADMIN", active: true }
        }
      }
    });
  }

  console.log("Seeded admin: dre@admin.com");
  console.log("Seeded admin: dreshaw2012@gmail.com");
  console.log("Both accounts use DEMO_ADMIN_PASSWORD.");
  console.log("Set DEMO_ADMIN_PASSWORD in .env before seeding.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
