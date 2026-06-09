import { prisma } from '../src/lib/prisma';

async function main() {
  const products = await prisma.product.findMany();
  let migratedCount = 0;

  for (const product of products) {
    // Check if variant already exists
    const existingVariants = await prisma.productVariant.findMany({
      where: { productId: product.id }
    });

    if (existingVariants.length === 0) {
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          weight: product.weight,
          unit: product.unit,
          price: product.price || 0,
          salePrice: product.salePrice,
          stock: product.stock,
          sku: product.sku
        }
      });
      migratedCount++;
    }
  }

  console.log(`Migrated ${migratedCount} products to have base variants.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
