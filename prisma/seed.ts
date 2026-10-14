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

  const category3 = await prisma.category.create({
    data: {
      name: "Batters",
      slug: "batters",
      description: "Fresh ready-to-cook batters",
    },
  });

  const category4 = await prisma.category.create({
    data: {
      name: "Spices & Oils",
      slug: "spices-and-oils",
      description: "Pure spice powders and cold-pressed oils",
    },
  });

  const extraProducts = [
    {
      name: "RAGI HEALTH MIX / ராகி சத்துமாவு",
      slug: "ragi-health-mix",
      description: "Sprouted ragi health mix, rich in calcium and iron, ideal for growing kids.",
      price: 180,
      salePrice: 165,
      sku: "HM250R",
      categoryId: category1.id,
      isFeatured: true,
      weight: 250,
      unit: "g",
      tags: ["ragi", "health mix", "kids"],
    },
    {
      name: "SPROUTED MILLET MIX / முளைகட்டிய சிறுதானிய மாவு",
      slug: "sprouted-millet-mix",
      description: "A blend of sprouted millets for easy digestion and sustained energy.",
      price: 220,
      salePrice: 200,
      sku: "HM250M",
      categoryId: category1.id,
      weight: 250,
      unit: "g",
      tags: ["millet", "health mix"],
    },
    {
      name: "WHITE RICE FLAKES / அரிசி அவல்",
      slug: "white-rice-flakes",
      description: "Light and easy-to-digest white rice flakes for quick breakfasts.",
      price: 70,
      salePrice: 65,
      sku: "FLWR250",
      categoryId: category2.id,
      weight: 250,
      unit: "g",
      tags: ["flakes", "breakfast"],
    },
    {
      name: "KAVUNI RICE FLAKES / கவுனி அரிசி அவல்",
      slug: "kavuni-rice-flakes",
      description: "Antioxidant-rich black Kavuni rice flakes, a traditional Tamil superfood.",
      price: 130,
      salePrice: 120,
      sku: "FLKV250",
      categoryId: category2.id,
      isFeatured: true,
      weight: 250,
      unit: "g",
      tags: ["flakes", "kavuni", "black rice"],
    },
    {
      name: "IDLI DOSA BATTER / இட்லி தோசை மாவு",
      slug: "idli-dosa-batter",
      description: "Freshly ground, naturally fermented idli and dosa batter with no preservatives.",
      price: 60,
      stock: 50,
      sku: "BT500",
      categoryId: category3.id,
      isPopularBatter: true,
      weight: 500,
      unit: "g",
      tags: ["batter", "idli", "dosa"],
    },
    {
      name: "RAGI DOSA BATTER / ராகி தோசை மாவு",
      slug: "ragi-dosa-batter",
      description: "Nutritious fermented ragi dosa batter, made fresh in small batches.",
      price: 80,
      salePrice: 75,
      stock: 40,
      sku: "BT500R",
      categoryId: category3.id,
      isPopularBatter: true,
      weight: 500,
      unit: "g",
      tags: ["batter", "ragi", "dosa"],
    },
    {
      name: "TURMERIC POWDER / மஞ்சள் தூள்",
      slug: "turmeric-powder",
      description: "Pure sun-dried turmeric powder with high curcumin content, no added colour.",
      price: 90,
      salePrice: 80,
      sku: "SP100T",
      categoryId: category4.id,
      isSpiceOil: true,
      weight: 100,
      unit: "g",
      tags: ["spice", "turmeric"],
    },
    {
      name: "SAMBAR POWDER / சாம்பார் பொடி",
      slug: "sambar-powder",
      description: "Aromatic home-style sambar powder made from freshly roasted spices.",
      price: 110,
      salePrice: 100,
      sku: "SP200S",
      categoryId: category4.id,
      isSpiceOil: true,
      weight: 200,
      unit: "g",
      tags: ["spice", "sambar"],
    },
    {
      name: "COLD PRESSED COCONUT OIL / தேங்காய் எண்ணெய்",
      slug: "cold-pressed-coconut-oil",
      description: "Wood cold-pressed virgin coconut oil, chemical free and full of natural aroma.",
      price: 350,
      salePrice: 330,
      sku: "OL500C",
      categoryId: category4.id,
      isSpiceOil: true,
      isFeatured: true,
      weight: 500,
      unit: "ml",
      tags: ["oil", "coconut", "cold pressed"],
    },
    {
      name: "COLD PRESSED GROUNDNUT OIL / கடலை எண்ணெய்",
      slug: "cold-pressed-groundnut-oil",
      description: "Traditional wood cold-pressed groundnut oil, ideal for everyday cooking.",
      price: 280,
      salePrice: 260,
      sku: "OL500G",
      categoryId: category4.id,
      isSpiceOil: true,
      weight: 500,
      unit: "ml",
      tags: ["oil", "groundnut", "cold pressed"],
    },
  ];

  for (const p of extraProducts) {
    await prisma.product.create({ data: { stock: 100, isActive: true, ...p } });
  }

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
