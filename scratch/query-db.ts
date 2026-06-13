import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Querying variants starting with DKG077...');
  const variants = await prisma.productVariant.findMany({
    where: {
      sku: {
        startsWith: 'DKG077',
      },
    },
    include: {
      product: true,
    },
  });
  console.log('Found variants:', JSON.stringify(variants, null, 2));

  console.log('Querying product attributes and terms...');
  const attributes = await prisma.productAttribute.findMany({
    include: {
      terms: true,
    },
  });
  console.log('Attributes:', JSON.stringify(attributes, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
