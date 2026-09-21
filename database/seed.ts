import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.branch.create({
    data: {
      name: "Rocher Mutuel Financial — Monaco",
      city: "Monaco",
      country: "Monaco",
      address: "Monaco"
    }
  });

  const user = await prisma.user.create({
    data: {
      email: "investor-demo@rocher-mutuel.example",
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

  console.log(`Seeded demo user: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
