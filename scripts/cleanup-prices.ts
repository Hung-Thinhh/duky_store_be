import { PrismaClient } from '../generated/prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Starting price cleanup...');

    // Update Product salePrice
    const updatedProducts = await prisma.product.updateMany({
      where: {
        salePrice: 0,
      },
      data: {
        salePrice: null,
      },
    });
    console.log(`Updated ${updatedProducts.count} products from salePrice=0 to salePrice=null.`);

    // Update ProductVariant salePrice
    const updatedVariants = await prisma.productVariant.updateMany({
      where: {
        salePrice: 0,
      },
      data: {
        salePrice: null,
      },
    });
    console.log(`Updated ${updatedVariants.count} variants from salePrice=0 to salePrice=null.`);

    console.log('Cleanup finished successfully.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
