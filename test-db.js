const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./dist/generated/prisma/client');
const { ProductStatus, ContentStatus, CategoryStatus, RedirectStatus } = require('./dist/generated/prisma/enums');

const connectionString = "postgresql://postgres:mzfnoyxufjxro8me@149.56.44.22:5401/duky-store?sslmode=disable";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting DB query test using pg adapter...");
  try {
    const products = await prisma.product.findMany({
      where: { deletedAt: null, status: ProductStatus.PUBLISHED },
      select: { id: true, name: true, slug: true },
    });
    console.log("Products count:", products.length);

    const blogPosts = await prisma.blogPost.findMany({
      where: { deletedAt: null, status: ContentStatus.PUBLISHED },
      select: { id: true, title: true, slug: true },
    });
    console.log("BlogPosts count:", blogPosts.length);

    const categories = await prisma.category.findMany({
      where: { deletedAt: null, status: CategoryStatus.ACTIVE },
      select: { id: true, name: true, slug: true },
    });
    console.log("Categories count:", categories.length);

    const sitemapEntries = await prisma.sitemapEntry.findMany({
      where: { isActive: true },
      select: { url: true },
    });
    console.log("SitemapEntries count:", sitemapEntries.length);

    const redirects = await prisma.redirect.findMany({
      where: { status: RedirectStatus.ACTIVE },
      select: {
        id: true,
        sourcePath: true,
        targetPath: true,
        status: true,
        statusCode: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log("Redirects count:", redirects.length);

    const urlMappings = await prisma.urlMapping.findMany({
      select: {
        entityId: true,
        entityType: true,
        newUrl: true,
        oldUrl: true,
        source: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log("UrlMappings count:", urlMappings.length);

    const seoMetadata = await prisma.seoMetadata.findMany({
      select: {
        entityId: true,
        entityType: true,
        metaDescription: true,
        canonicalUrl: true,
        noIndex: true,
      },
    });
    console.log("SeoMetadata count:", seoMetadata.length);

    const relativeCanonicals = await prisma.seoMetadata.count({
      where: { canonicalUrl: { startsWith: '/' } },
    });
    console.log("RelativeCanonicals count:", relativeCanonicals);

    const mediaMissingAltText = await prisma.media.count({
      where: {
        deletedAt: null,
        OR: [{ altText: null }, { altText: '' }],
      },
    });
    console.log("MediaMissingAltText count:", mediaMissingAltText);

    console.log("All baseline queries succeeded!");
  } catch (error) {
    console.error("Baseline query failed with error:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
