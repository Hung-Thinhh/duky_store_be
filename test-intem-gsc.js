const { Client } = require('pg');

const DATABASE_URL = process.env.INTEM_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/intem-cantho?sslmode=disable';

async function test() {
  console.log('Testing GSC Service inputs and DB connection...');
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('Connected to DB successfully.');
    
    const tables = [
      { name: 'products', query: 'SELECT id, name, slug FROM products WHERE "deletedAt" IS NULL AND status = \'PUBLISHED\'' },
      { name: 'blog_posts', query: 'SELECT id, title, slug FROM blog_posts WHERE "deletedAt" IS NULL AND status = \'PUBLISHED\'' },
      { name: 'categories', query: 'SELECT id, name, slug FROM categories WHERE "deletedAt" IS NULL AND status = \'ACTIVE\'' },
      { name: 'sitemap_entries', query: 'SELECT url FROM sitemap_entries WHERE "isActive" = true' },
      { name: 'redirects', query: 'SELECT id, "sourcePath", "targetPath", status, "statusCode" FROM redirects WHERE status = \'ACTIVE\' ORDER BY "createdAt" DESC' },
      { name: 'url_mappings', query: 'SELECT "entityId", "entityType", "newUrl", "oldUrl", source FROM url_mappings ORDER BY "createdAt" DESC' },
      { name: 'seo_metadata', query: 'SELECT "entityId", "entityType", "metaDescription", "canonicalUrl", "noIndex" FROM seo_metadata' },
      { name: 'media', query: 'SELECT id, url, title FROM media WHERE "deletedAt" IS NULL AND ("altText" IS NULL OR "altText" = \'\')' },
      { name: 'gsc_inspections', query: 'SELECT "inspectionUrl" FROM gsc_inspections' }
    ];

    for (const table of tables) {
      try {
        const res = await client.query(table.query);
        console.log(`- Table "${table.name}": OK, returned ${res.rowCount} rows`);
      } catch (err) {
        console.error(`- Table "${table.name}" FAILED:`, err.message);
      }
    }
    
  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    await client.end();
  }

  console.log('\nTesting live sitemap fetch...');
  try {
    const res = await fetch('https://intemcantho.vn/sitemap.xml', { signal: AbortSignal.timeout(10000) });
    console.log('Sitemap fetch status:', res.status);
    const body = await res.text();
    console.log('Sitemap body starts with:', body.slice(0, 200));
  } catch (err) {
    console.error('Sitemap fetch FAILED:', err.message);
  }
}

test();
