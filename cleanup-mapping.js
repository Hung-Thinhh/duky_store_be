const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./dist/generated/prisma/client');

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/duky-store?sslmode=disable";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Cleaning up wrong UrlMapping for '/' pointing to blog post...");
  try {
    // Delete the wrong mapping
    const deleteMapping = await prisma.urlMapping.deleteMany({
      where: {
        oldUrl: "/",
        newUrl: "/blog/3-bi-quyet-mix-match-cung-ao-khoac-da-nang-tam-phong-cach-thoi-trang"
      }
    });
    console.log("Deleted Url Mappings count:", deleteMapping.count);

    // Also delete any wrong redirect for '/' pointing to that blog post
    const deleteRedirect = await prisma.redirect.deleteMany({
      where: {
        sourcePath: "/",
        targetPath: "/blog/3-bi-quyet-mix-match-cung-ao-khoac-da-nang-tam-phong-cach-thoi-trang"
      }
    });
    console.log("Deleted Redirects count:", deleteRedirect.count);

    console.log("Cleanup finished successfully!");
  } catch (error) {
    console.error("Cleanup failed:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
