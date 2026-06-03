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

  // Create categories
  const batterCat = await prisma.category.create({
    data: { name: "Batter", slug: "batter", isActive: true },
  });
  const spiceCat = await prisma.category.create({
    data: { name: "Spice Blends", slug: "spice-blends", isActive: true },
  });
  const oilCat = await prisma.category.create({
    data: { name: "Oils", slug: "oils", isActive: true },
  });
  const gheeCat = await prisma.category.create({
    data: { name: "Ghee", slug: "ghee", isActive: true },
  });
  console.log("Seeded categories: Batter, Spice Blends, Oils, Ghee");

  // Seed Products
  const products = [
    {
      name: "Sprouted Ragi Dosa Batter",
      slug: "sprouted-ragi-dosa-batter",
      description: "High-calcium sprouted finger millet batter. Zero soda, zero preservatives.",
      price: 120,
      salePrice: 99,
      stock: 100,
      sku: "BAT-01",
      categoryId: batterCat.id,
      isActive: true,
      isFeatured: true,
      isPopularBatter: true,
      isSpiceOil: false,
      weight: 1.0,
      unit: "kg",
      tags: ["Millet", "Gluten-Free", "Healthy"],
    },
    {
      name: "Classic Homestyle Idli Batter",
      slug: "classic-homestyle-idli-batter",
      description: "Perfectly fermented stone-ground batter for pillowy-soft idlis.",
      price: 90,
      stock: 150,
      sku: "BAT-02",
      categoryId: batterCat.id,
      isActive: true,
      isFeatured: false,
      isPopularBatter: true,
      isSpiceOil: false,
      weight: 1.0,
      unit: "kg",
      tags: ["Traditional", "Fermented"],
    },
    {
      name: "Beetroot & Carrot Idli Batter",
      slug: "beetroot-carrot-idli-batter",
      description: "Naturally colorful and packed with vitamins. Kids' absolute favorite!",
      price: 110,
      stock: 80,
      sku: "BAT-03",
      categoryId: batterCat.id,
      isActive: true,
      isFeatured: false,
      isPopularBatter: true,
      isSpiceOil: false,
      weight: 0.8,
      unit: "kg",
      tags: ["Kids Special", "Vitamins"],
    },
    {
      name: "Premium Gunpowder (Podi)",
      slug: "premium-gunpowder-podi",
      description: "Traditional spicy lentil powder roasted in pure sesame oil.",
      price: 150,
      salePrice: 125,
      stock: 200,
      sku: "SPC-01",
      categoryId: spiceCat.id,
      isActive: true,
      isFeatured: true,
      isPopularBatter: false,
      isSpiceOil: true,
      weight: 0.25,
      unit: "kg",
      tags: ["Spicy", "Authentic"],
    },
    {
      name: "Cold-Pressed Sesame Oil",
      slug: "cold-pressed-sesame-oil",
      description: "Traditional wood-pressed (Marachekku) oil made with organic palm jaggery.",
      price: 350,
      stock: 100,
      sku: "OIL-01",
      categoryId: oilCat.id,
      isActive: true,
      isFeatured: false,
      isPopularBatter: false,
      isSpiceOil: true,
      weight: 0.5,
      unit: "L",
      tags: ["Wood-Pressed", "Organic Jaggery"],
    },
    {
      name: "Cold-Pressed Coconut Oil",
      slug: "cold-pressed-coconut-oil",
      description: "Pure, edible-grade cold-pressed coconut oil from sun-dried copra.",
      price: 310,
      stock: 120,
      sku: "OIL-02",
      categoryId: oilCat.id,
      isActive: true,
      isFeatured: false,
      isPopularBatter: false,
      isSpiceOil: true,
      weight: 0.5,
      unit: "L",
      tags: ["Pure", "Edible Grade"],
    },
    {
      name: "A2 Desi Cow Ghee (Premium)",
      slug: "a2-desi-cow-ghee-premium",
      description: "Pure Bilona method ghee from grass-fed Gir cows. Golden and granular.",
      price: 650,
      salePrice: 599,
      stock: 150,
      sku: "GHE-01",
      categoryId: gheeCat.id,
      isActive: true,
      isFeatured: true,
      isPopularBatter: false,
      isSpiceOil: false,
      weight: 0.5,
      unit: "L",
      tags: ["Gir Cow A2", "Bilona Method", "Premium"],
    },
  ];

  for (const prod of products) {
    await prisma.product.create({
      data: prod,
    });
  }

  console.log(`Seeded ${products.length} products successfully.`);
  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
