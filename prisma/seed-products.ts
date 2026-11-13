/**
 * Replace ALL products with a small demo catalogue of 10 products in 4 categories.
 *
 *   npx tsx prisma/seed-products.ts
 *
 * - Deletes every product (their images, variants and wishlist entries go with them).
 * - Categories are kept and updated by slug; missing ones are created.
 * - Refuses to run if any order contains a product (order history must never be deleted),
 *   and refuses when NODE_ENV=production unless you pass --production.
 * - Runs in one transaction: either everything is replaced or nothing changes.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const CATEGORIES = [
  { slug: "batters", name: "Batters", description: "Fresh, naturally fermented stone-ground batters.", sortOrder: 0 },
  { slug: "flakes", name: "Flakes", description: "Traditional rice flakes (aval) for quick, healthy meals.", sortOrder: 1 },
  { slug: "health-mix", name: "Health Mix", description: "Sprouted grain and millet health mixes.", sortOrder: 2 },
  { slug: "spices-and-oils", name: "Spices & Oils", description: "Wood cold-pressed oils and home-style spice powders.", sortOrder: 3 },
];

type Seed = {
  name: string; slug: string; sku: string; category: string; description: string;
  price: number; salePrice?: number; stock: number; weight: number; unit: "g" | "ml";
  tags: string[]; featured?: boolean; popularBatter?: boolean; spiceOil?: boolean; offer?: boolean; combo?: boolean;
  ingredients?: string; shelfLife?: string; storageInstructions?: string;
};

// Every homepage section (featured, popular batters, spices & oils, offers, combos) gets at least one product
const PRODUCTS: Seed[] = [
  {
    name: "IDLI DOSA BATTER / இட்லி தோசை மாவு", slug: "idli-dosa-batter", sku: "KF-BAT-001", category: "batters",
    description: "Freshly stone-ground, naturally fermented idli and dosa batter. No soda, no preservatives — soft idlis and crisp dosas every time.",
    price: 70, stock: 60, weight: 500, unit: "g", tags: ["Fermented", "No Preservatives"], featured: true, popularBatter: true,
    ingredients: "Idli rice, urad dal, fenugreek, rock salt", shelfLife: "5 days refrigerated", storageInstructions: "Keep refrigerated below 4°C.",
  },
  {
    name: "RAGI DOSA BATTER / ராகி தோசை மாவு", slug: "ragi-dosa-batter", sku: "KF-BAT-002", category: "batters",
    description: "Calcium-rich finger millet batter, fermented the traditional way for soft, tasty ragi dosas.",
    price: 85, salePrice: 75, stock: 40, weight: 500, unit: "g", tags: ["Millet", "High Calcium"], popularBatter: true,
    ingredients: "Ragi, idli rice, urad dal, fenugreek, rock salt", shelfLife: "4 days refrigerated", storageInstructions: "Keep refrigerated below 4°C.",
  },
  {
    name: "MULTI MILLET DOSA BATTER / சிறுதானிய தோசை மாவு", slug: "multi-millet-dosa-batter", sku: "KF-BAT-003", category: "batters",
    description: "A fibre-rich blend of kodo, foxtail, barnyard and little millets for a wholesome breakfast.",
    price: 95, salePrice: 85, stock: 35, weight: 500, unit: "g", tags: ["Millets", "High Fibre"], popularBatter: true, offer: true,
    ingredients: "Kodo, foxtail, barnyard and little millets, urad dal, fenugreek, rock salt", shelfLife: "4 days refrigerated", storageInstructions: "Keep refrigerated below 4°C.",
  },
  {
    name: "RED MATTA RICE FLAKES / சிவப்பு மட்டா அரிசி அவல்", slug: "red-matta-rice-flakes", sku: "KF-FLK-001", category: "flakes",
    description: "Hand-pounded red matta rice flakes, rich in fibre and iron. Ready in minutes for poha or sweet aval.",
    price: 100, salePrice: 90, stock: 80, weight: 250, unit: "g", tags: ["Iron Rich", "Quick Cook"],
    ingredients: "Red matta rice", shelfLife: "6 months", storageInstructions: "Store in an airtight container in a cool, dry place.",
  },
  {
    name: "KAVUNI RICE FLAKES / கவுனி அரிசி அவல்", slug: "kavuni-rice-flakes", sku: "KF-FLK-002", category: "flakes",
    description: "Antioxidant-rich black kavuni rice flakes with a naturally nutty taste.",
    price: 140, salePrice: 120, stock: 50, weight: 250, unit: "g", tags: ["Antioxidants", "Heritage Rice"], featured: true,
    ingredients: "Black kavuni rice", shelfLife: "6 months", storageInstructions: "Store in an airtight container in a cool, dry place.",
  },
  {
    name: "RAGI HEALTH MIX / ராகி சத்துமாவு", slug: "ragi-health-mix", sku: "KF-HM-001", category: "health-mix",
    description: "Sprouted ragi health mix, rich in calcium and iron. A warm, filling drink for kids and adults.",
    price: 185, salePrice: 165, stock: 70, weight: 250, unit: "g", tags: ["Sprouted", "Kids Friendly"], featured: true,
    ingredients: "Sprouted ragi, almonds, cardamom", shelfLife: "4 months", storageInstructions: "Store in an airtight container. Use a dry spoon.",
  },
  {
    name: "ALL IN ONE BLEND (40 INGREDIENTS) / சத்துமாவு", slug: "all-in-one-blend-health-mix", sku: "KF-HM-002", category: "health-mix",
    description: "Our signature health mix of 40 sprouted grains, millets, pulses and nuts in every spoon.",
    price: 220, salePrice: 195, stock: 45, weight: 250, unit: "g", tags: ["40 Ingredients", "Protein Rich"], offer: true,
    ingredients: "Sprouted millets, grains, pulses, nuts and spices (40 ingredients)", shelfLife: "4 months", storageInstructions: "Store in an airtight container. Use a dry spoon.",
  },
  {
    name: "COLD PRESSED GROUNDNUT OIL / கடலை எண்ணெய்", slug: "cold-pressed-groundnut-oil", sku: "KF-OIL-001", category: "spices-and-oils",
    description: "Traditional wood cold-pressed (marachekku) groundnut oil with its natural aroma and nutrients intact.",
    price: 280, salePrice: 260, stock: 55, weight: 500, unit: "ml", tags: ["Wood Pressed", "Unrefined"], spiceOil: true,
    ingredients: "Groundnuts", shelfLife: "9 months", storageInstructions: "Store away from direct sunlight.",
  },
  {
    name: "COLD PRESSED SESAME OIL / நல்லெண்ணெய்", slug: "cold-pressed-sesame-oil", sku: "KF-OIL-002", category: "spices-and-oils",
    description: "Wood cold-pressed gingelly oil made with palm jaggery, the traditional way.",
    price: 320, salePrice: 290, stock: 40, weight: 500, unit: "ml", tags: ["Wood Pressed", "Palm Jaggery"], spiceOil: true, featured: true,
    ingredients: "Sesame seeds, palm jaggery", shelfLife: "9 months", storageInstructions: "Store away from direct sunlight.",
  },
  {
    name: "BREAKFAST COMBO (IDLI BATTER + SAMBAR POWDER) / காலை உணவு காம்போ", slug: "breakfast-combo-idli-batter-sambar-powder", sku: "KF-CMB-001", category: "spices-and-oils",
    description: "Everything for a South Indian breakfast: 500 g idli dosa batter with 200 g home-style sambar powder.",
    price: 180, salePrice: 160, stock: 30, weight: 700, unit: "g", tags: ["Combo", "Value Pack"], spiceOil: true, combo: true, offer: true,
    ingredients: "Idli dosa batter; sambar powder (coriander, chilli, toor dal, cumin, turmeric, curry leaves)", shelfLife: "Batter 5 days refrigerated; powder 6 months", storageInstructions: "Refrigerate the batter. Keep the powder in an airtight container.",
  },
];

async function main() {
  const url = process.env.DATABASE_URL || "";
  const host = url.replace(/^.*@/, "").replace(/\/.*$/, "");
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--production")) {
    throw new Error("NODE_ENV=production: refusing to replace products. Pass --production if you really mean it.");
  }

  const ordered = await prisma.orderItem.count();
  if (ordered > 0) {
    throw new Error(`${ordered} order item(s) reference products. Products that were ordered can't be deleted (order history). Nothing changed.`);
  }

  const before = await prisma.product.count();
  console.log(`Database: ${host} — replacing ${before} product(s) with ${PRODUCTS.length}.`);

  await prisma.$transaction(async (tx) => {
    // Images, variants and wishlist rows are removed by ON DELETE CASCADE
    await tx.product.deleteMany({});

    const categoryIds: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const row = await tx.category.upsert({
        where: { slug: c.slug },
        update: { name: c.name, description: c.description, sortOrder: c.sortOrder, isActive: true },
        create: { ...c, isActive: true },
      });
      categoryIds[c.slug] = row.id;
    }

    for (const p of PRODUCTS) {
      await tx.product.create({
        data: {
          name: p.name, slug: p.slug, sku: p.sku, description: p.description,
          price: p.price, salePrice: p.salePrice ?? null, stock: p.stock,
          weight: p.weight, unit: p.unit, tags: p.tags,
          categoryId: categoryIds[p.category], isActive: true,
          isFeatured: !!p.featured, isPopularBatter: !!p.popularBatter, isSpiceOil: !!p.spiceOil,
          isOffer: !!p.offer, isCombo: !!p.combo,
          ingredients: p.ingredients ?? null, shelfLife: p.shelfLife ?? null, storageInstructions: p.storageInstructions ?? null,
        },
      });
    }
  });

  const rows = await prisma.category.findMany({
    where: { slug: { in: CATEGORIES.map((c) => c.slug) } },
    orderBy: { sortOrder: "asc" },
    select: { name: true, _count: { select: { products: true } } },
  });
  console.log("Done:");
  for (const r of rows) console.log(`  ${r.name}: ${r._count.products} product(s)`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
