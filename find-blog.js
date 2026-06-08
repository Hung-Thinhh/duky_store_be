const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./dist/generated/prisma/client');

const connectionString = "postgresql://postgres:mzfnoyxufjxro8me@149.56.44.22:5401/duky-store?sslmode=disable";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Searching details for blog post: 3-bi-quyet-mix-match-cung-ao-khoac-da-nang-tam-phong-cach-thoi-trang...");
  try {
    const slug = "3-bi-quyet-mix-match-cung-ao-khoac-da-nang-tam-phong-cach-thoi-trang";

    // 1. Find blog post
    const post = await prisma.blogPost.findFirst({
      where: { slug },
      select: { id: true, title: true, slug: true, status: true, deletedAt: true }
    });
    console.log("Blog Post matching slug:", JSON.stringify(post, null, 2));

    // 2. Find redirects
    const redirects = await prisma.redirect.findMany({
      where: {
        OR: [
          { sourcePath: { contains: slug } },
          { targetPath: { contains: slug } },
          { sourcePath: "/" }
        ]
      }
    });
    console.log("Related Redirects:", JSON.stringify(redirects, null, 2));

    // 3. Find url mappings
    const mappings = await prisma.urlMapping.findMany({
      where: {
        OR: [
          { oldUrl: { contains: slug } },
          { newUrl: { contains: slug } },
          { oldUrl: "/" }
        ]
      }
    });
    console.log("Related Url Mappings:", JSON.stringify(mappings, null, 2));

  } catch (error) {
    console.error("Query failed:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
