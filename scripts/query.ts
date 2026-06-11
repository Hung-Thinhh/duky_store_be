import { PrismaClient } from '../generated/prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const terms = await prisma.productAttributeTerm.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    console.log('--- RECENT TERMS ---');
    console.log(JSON.stringify(terms, null, 2));
  } catch (err) {
    console.error('Error querying:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
