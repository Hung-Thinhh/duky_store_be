import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const updatedRows = await prisma.$executeRaw`
    UPDATE products AS p
    SET sku = first_variant.sku
    FROM (
      SELECT DISTINCT ON ("productId")
        "productId",
        sku
      FROM product_variants
      WHERE sku IS NOT NULL
        AND "deletedAt" IS NULL
      ORDER BY "productId", "sortOrder", sku
    ) AS first_variant
    WHERE p.id = first_variant."productId"
      AND p.sku IS NULL
  `;

  console.log(`Updated parent product SKUs: ${updatedRows}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
