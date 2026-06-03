import { PrismaClient, Role, CouponType, BannerPosition } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Start seeding...");

  // 1. Clean existing data (optional but good for a fresh start)
  await prisma.setting.deleteMany({});
  await prisma.banner.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.oTP.deleteMany({}); // Delete OTPs if model exists
  await prisma.user.deleteMany({});

  // 2. Hash passwords
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  // 3. Create Users
  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@kiddosfood.com",
      password: adminPassword,
      role: Role.ADMIN,
      isVerified: true,
      phone: "+1234567890",
    },
  });

  const customer = await prisma.user.create({
    data: {
      name: "John Customer",
      email: "user@kiddosfood.com",
      password: userPassword,
      role: Role.USER,
      isVerified: true,
      phone: "+9876543210",
    },
  });

  console.log("Seeded Users: admin@kiddosfood.com, user@kiddosfood.com");

  // 4. Create Categories
  const batters = await prisma.category.create({
    data: {
      name: "Batters",
      slug: "batters",
      description: "Traditional and healthy dosa & idli batters",
      sortOrder: 1,
    },
  });

  const snacks = await prisma.category.create({
    data: {
      name: "Healthy Snacks",
      slug: "healthy-snacks",
      description: "Nutrition-rich snacks for children and families",
      sortOrder: 2,
    },
  });

  const spices = await prisma.category.create({
    data: {
      name: "Organic Spices",
      slug: "organic-spices",
      description: "Handcrafted pure spices and podis",
      sortOrder: 3,
    },
  });

  console.log("Seeded Categories");

  // 5. Create Products
  const prod1 = await prisma.product.create({
    data: {
      name: "Traditional Dosa Batter",
      slug: "traditional-dosa-batter",
      description: "Perfectly fermented stone-ground batter for crispy golden dosas.",
      price: 120.00,
      salePrice: 99.00,
      stock: 50,
      sku: "BAT-DOS-01",
      categoryId: batters.id,
      isFeatured: true,
      weight: 1.000,
      unit: "kg",
      tags: ["natural", "breakfast", "gluten-free"],
    },
  });

  await prisma.productImage.create({
    data: {
      productId: prod1.id,
      url: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=500&auto=format&fit=crop",
      isPrimary: true,
    },
  });

  const prod2 = await prisma.product.create({
    data: {
      name: "Organic Ragi Batter",
      slug: "organic-ragi-batter",
      description: "Fiber-rich finger millet (Ragi) batter. Nutritious and diabetic friendly.",
      price: 140.00,
      stock: 30,
      sku: "BAT-RAG-02",
      categoryId: batters.id,
      isFeatured: true,
      weight: 1.000,
      unit: "kg",
      tags: ["ragi", "healthy", "millets"],
    },
  });

  await prisma.productImage.create({
    data: {
      productId: prod2.id,
      url: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500&auto=format&fit=crop",
      isPrimary: true,
    },
  });

  const prod3 = await prisma.product.create({
    data: {
      name: "Garlic Kara Podi",
      slug: "garlic-kara-podi",
      description: "Traditional spicy garlic powder. Best paired with hot idli and ghee.",
      price: 90.00,
      salePrice: 79.00,
      stock: 100,
      sku: "SPI-GAR-01",
      categoryId: spices.id,
      isFeatured: false,
      weight: 0.250,
      unit: "kg",
      tags: ["spicy", "podi", "traditional"],
    },
  });

  await prisma.productImage.create({
    data: {
      productId: prod3.id,
      url: "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=500&auto=format&fit=crop",
      isPrimary: true,
    },
  });

  console.log("Seeded Products & Product Images");

  // 6. Create Coupons
  await prisma.coupon.create({
    data: {
      code: "WELCOME10",
      type: CouponType.PERCENTAGE,
      value: 10.00,
      minOrderAmount: 200.00,
      maxUses: 100,
      isActive: true,
    },
  });

  await prisma.coupon.create({
    data: {
      code: "FREESHIP",
      type: CouponType.FIXED,
      value: 50.00,
      minOrderAmount: 300.00,
      maxUses: 500,
      isActive: true,
    },
  });

  console.log("Seeded Coupons");

  // 7. Create Banners
  await prisma.banner.create({
    data: {
      title: "Amma's Traditional Batters",
      subtitle: "Experience 20+ varieties of fresh batters, delivered to your door.",
      image: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=1200&auto=format&fit=crop",
      link: "/category/batters",
      sortOrder: 1,
      position: BannerPosition.HOME,
      isActive: true,
    },
  });

  console.log("Seeded Banners");

  // 8. Create Settings
  await prisma.setting.createMany({
    data: [
      { key: "site_name", value: "Kiddos Food", group: "general" },
      { key: "contact_email", value: "care@kiddosfood.com", group: "general" },
      { key: "currency", value: "INR", group: "general" },
      { key: "delivery_charge", value: "40", group: "shipping" },
      { key: "free_delivery_threshold", value: "350", group: "shipping" },
    ],
  });

  console.log("Seeded Settings");

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
