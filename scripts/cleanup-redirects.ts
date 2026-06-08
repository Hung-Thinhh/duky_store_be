import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RedirectStatus } from '../generated/prisma/client';

type RedirectItem = {
  id: string;
  sourcePath: string;
  targetPath: string;
  statusCode: number;
  hitCount: number;
};

const DEFAULT_REPORT_PATH = 'docs/seo/broken-redirects-report.csv';

function getArgValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = hasFlag(args, 'dry-run') || hasFlag(args, 'dryRun');
  const disableBroken = hasFlag(args, 'disable-broken') || hasFlag(args, 'disableBroken');
  const reportPathArg = getArgValue(args, 'output') ?? DEFAULT_REPORT_PATH;
  const reportPath = resolve(reportPathArg);

  if (hasFlag(args, 'help') || hasFlag(args, 'h')) {
    console.log(`
Redirect Cleanup Script.

Usage:
  npx tsx scripts/cleanup-redirects.ts [options]

Options:
  --dry-run          Analyze redirects and generate the report, but do not modify the database.
  --disable-broken   Automatically set status of broken redirects to INACTIVE in the database.
  --output <path>    Custom CSV report path (default: ${DEFAULT_REPORT_PATH})
  --help, -h         Show this help message.
`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in env.');
  }

  console.log(`Initializing Prisma Client...`);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Fetching active redirects...');
    const redirects = await prisma.redirect.findMany({
      where: {
        status: RedirectStatus.ACTIVE,
      },
    });

    console.log(`Found ${redirects.length} active redirects.`);

    // 1. Handle sourcePath = "/"
    const rootRedirects = redirects.filter((r) => r.sourcePath === '/');
    console.log(`Found ${rootRedirects.length} redirects matching sourcePath = "/".`);

    if (rootRedirects.length > 0) {
      if (dryRun) {
        console.log(`[Dry-Run] Would disable ${rootRedirects.length} root redirect(s).`);
      } else {
        const rootIds = rootRedirects.map((r) => r.id);
        await prisma.redirect.updateMany({
          where: {
            id: { in: rootIds },
          },
          data: {
            status: RedirectStatus.INACTIVE,
          },
        });
        console.log(`Successfully disabled ${rootRedirects.length} root redirect(s).`);
      }
    }

    // 2. Fetch all published products and blog posts to match slugs
    console.log('Fetching product slugs...');
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      select: { slug: true },
    });
    const productSlugs = new Set(products.map((p) => p.slug.trim().toLowerCase()));

    console.log('Fetching blog post slugs...');
    const blogPosts = await prisma.blogPost.findMany({
      where: { deletedAt: null },
      select: { slug: true },
    });
    const blogSlugs = new Set(blogPosts.map((b) => b.slug.trim().toLowerCase()));

    // Fetch categories to verify category targets if any
    console.log('Fetching category slugs...');
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      select: { slug: true },
    });
    const categorySlugs = new Set(categories.map((c) => c.slug.trim().toLowerCase()));

    const brokenProductRedirects: RedirectItem[] = [];
    const brokenBlogRedirects: RedirectItem[] = [];
    const otherBrokenRedirects: RedirectItem[] = [];

    // Analyze each redirect target
    for (const redirect of redirects) {
      if (redirect.sourcePath === '/') continue;

      const targetPath = redirect.targetPath.trim();
      
      // Determine if it points to product
      if (targetPath.startsWith('/san-pham/') || targetPath.startsWith('/products/')) {
        const slug = targetPath
          .replace(/^\/san-pham\//, '')
          .replace(/^\/products\//, '')
          .replace(/\/$/, '')
          .split('?')[0]
          .split('#')[0]
          .trim()
          .toLowerCase();
        
        if (slug && !productSlugs.has(slug)) {
          brokenProductRedirects.push({
            id: redirect.id,
            sourcePath: redirect.sourcePath,
            targetPath: redirect.targetPath,
            statusCode: redirect.statusCode,
            hitCount: redirect.hitCount,
          });
        }
      } 
      // Determine if it points to blog post
      else if (targetPath.startsWith('/blog/')) {
        // Exclude category targets if it's blog category
        if (targetPath.startsWith('/blog/categories/')) {
          const catSlug = targetPath
            .replace(/^\/blog\/categories\//, '')
            .replace(/\/$/, '')
            .split('?')[0]
            .split('#')[0]
            .trim()
            .toLowerCase();
          // We can also verify blog category slugs, but let's focus on main blog posts.
          continue;
        }

        const slug = targetPath
          .replace(/^\/blog\//, '')
          .replace(/\/$/, '')
          .split('?')[0]
          .split('#')[0]
          .trim()
          .toLowerCase();
        
        if (slug && !blogSlugs.has(slug)) {
          brokenBlogRedirects.push({
            id: redirect.id,
            sourcePath: redirect.sourcePath,
            targetPath: redirect.targetPath,
            statusCode: redirect.statusCode,
            hitCount: redirect.hitCount,
          });
        }
      }
      // Determine if it points to category
      else if (targetPath.startsWith('/danh-muc/')) {
        const slug = targetPath
          .replace(/^\/danh-muc\//, '')
          .replace(/\/$/, '')
          .split('?')[0]
          .split('#')[0]
          .trim()
          .toLowerCase();
        
        if (slug && !categorySlugs.has(slug)) {
          otherBrokenRedirects.push({
            id: redirect.id,
            sourcePath: redirect.sourcePath,
            targetPath: redirect.targetPath,
            statusCode: redirect.statusCode,
            hitCount: redirect.hitCount,
          });
        }
      }
    }

    console.log(`\nAnalysis Results:`);
    console.log(`- Broken Product Redirects: ${brokenProductRedirects.length}`);
    console.log(`- Broken Blog Redirects: ${brokenBlogRedirects.length}`);
    console.log(`- Broken Category/Other Redirects: ${otherBrokenRedirects.length}`);

    // Generate CSV report
    const csvRows = [
      ['ID', 'Type', 'Source Path', 'Target Path', 'Status Code', 'Hit Count', 'Recommended Action'],
    ];

    brokenProductRedirects.forEach((r) => {
      csvRows.push([r.id, 'PRODUCT', r.sourcePath, r.targetPath, String(r.statusCode), String(r.hitCount), 'Disable or point to similar active product']);
    });

    brokenBlogRedirects.forEach((r) => {
      csvRows.push([r.id, 'BLOG_POST', r.sourcePath, r.targetPath, String(r.statusCode), String(r.hitCount), 'Disable or point to blog home / active article']);
    });

    otherBrokenRedirects.forEach((r) => {
      csvRows.push([r.id, 'CATEGORY', r.sourcePath, r.targetPath, String(r.statusCode), String(r.hitCount), 'Disable or point to category home']);
    });

    const csvContent = csvRows.map((row) => row.map((val) => `"${val.replace(/"/g, '""')}"`).join(',')).join('\n');
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, csvContent, 'utf8');
    console.log(`Report written to ${reportPathArg}`);

    // If disable-broken flag is set, deactivate them
    const allBroken = [...brokenProductRedirects, ...brokenBlogRedirects, ...otherBrokenRedirects];
    
    if (allBroken.length > 0) {
      if (disableBroken) {
        if (dryRun) {
          console.log(`[Dry-Run] Would disable ${allBroken.length} broken redirects in DB.`);
        } else {
          const brokenIds = allBroken.map((r) => r.id);
          await prisma.redirect.updateMany({
            where: {
              id: { in: brokenIds },
            },
            data: {
              status: RedirectStatus.INACTIVE,
            },
          });
          console.log(`Successfully disabled ${allBroken.length} broken redirects in DB.`);
        }
      } else {
        console.log(`\nRun with --disable-broken to automatically disable these ${allBroken.length} broken redirects in the database.`);
      }
    }

  } catch (error) {
    console.error('Error during cleanup analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
