import { PrismaClient, Role } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Start seeding...");

  // Clean existing data
  await prisma.setting.deleteMany({});
  await prisma.banner.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.oTP.deleteMany({});
  await prisma.user.deleteMany({});

  const adminPassword = await bcrypt.hash("admin123", 10);

  // Create admin user
  await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@kiddosfood.com",
      password: adminPassword,
      role: Role.ADMIN,
      isVerified: true,
      phone: "+1234567890",
    },
  });
  console.log("Seeded admin user: admin@kiddosfood.com");
  console.log("Database seeded successfully with admin credentials.");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
