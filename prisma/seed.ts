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

  // Create dummy categories
  const category1 = await prisma.category.create({
    data: {
      name: "Health Mix",
      slug: "health-mix",
      description: "Nutritious health mix for all ages",
    },
  });

  const category2 = await prisma.category.create({
    data: {
      name: "Flakes",
      slug: "flakes",
      description: "Healthy flakes for breakfast",
    },
  });

  // Create dummy products
  await prisma.product.create({
    data: {
      name: "ALL IN ONE BLEND (40 INGREDIENTS) / சத்துமாவு",
      slug: "all-in-one-blend-40-ingredients",
      description: "Kiddos Foods All-in-One Blend Health Mix is a 100% natural nutritional mix.",
      price: 210,
      salePrice: 195,
      stock: 100,
      sku: "HM250",
      categoryId: category1.id,
      isActive: true,
      weight: 250,
      unit: "g",
    },
  });

  await prisma.product.create({
    data: {
      name: "RED MATTA RICE FLAKES / சிவப்பு மட்டா அரிசி அவல்",
      slug: "red-matta-rice-flakes",
      description: "Kiddos Foods Red Matta Rice Flakes are made from premium Red Matta Rice.",
      price: 100,
      salePrice: 90,
      stock: 100,
      sku: "FLRM250",
      categoryId: category2.id,
      isActive: true,
      weight: 250,
      unit: "g",
    },
  });

  console.log("Database seeded successfully with admin credentials, categories, and products.");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
