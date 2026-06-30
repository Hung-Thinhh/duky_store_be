const { Client } = require('pg');

const INTEM_DB = process.env.INTEM_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/intem-cantho?sslmode=disable';
const DUKY_DB = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/duky-store?sslmode=disable';

async function testDatabase(dbUrl, label) {
  console.log(`\n=================== TESTING ${label} DATABASE ===================`);
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log(`Connected to ${label} database successfully.`);
    
    // Check if tables exist in the public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const existingTables = tablesRes.rows.map(r => r.table_name);
    console.log('Existing tables in public schema:', existingTables.join(', ') || '(none)');
    
    const tablesToCheck = [
      { name: 'products', query: 'SELECT COUNT(*) FROM products WHERE "deletedAt" IS NULL AND status = \'PUBLISHED\'' },
      { name: 'blog_posts', query: 'SELECT COUNT(*) FROM blog_posts WHERE "deletedAt" IS NULL AND status = \'PUBLISHED\'' },
      { name: 'categories', query: 'SELECT COUNT(*) FROM categories WHERE "deletedAt" IS NULL AND status = \'ACTIVE\'' },
      { name: 'sitemap_entries', query: 'SELECT COUNT(*) FROM sitemap_entries WHERE "isActive" = true' },
      { name: 'redirects', query: 'SELECT COUNT(*) FROM redirects WHERE status = \'ACTIVE\'' },
      { name: 'url_mappings', query: 'SELECT COUNT(*) FROM url_mappings' },
      { name: 'seo_metadata', query: 'SELECT COUNT(*) FROM seo_metadata' },
      { name: 'media', query: 'SELECT COUNT(*) FROM media WHERE "deletedAt" IS NULL AND ("altText" IS NULL OR "altText" = \'\')' },
      { name: 'gsc_inspections', query: 'SELECT COUNT(*) FROM gsc_inspections' }
    ];

    for (const table of tablesToCheck) {
      if (!existingTables.includes(table.name)) {
        console.error(`- Table "${table.name}": MISSING IN DATABASE!`);
        continue;
      }
      try {
        const res = await client.query(table.query);
        console.log(`- Table "${table.name}": OK, count = ${res.rows[0].count}`);
      } catch (err) {
        console.error(`- Table "${table.name}" query FAILED:`, err.message);
      }
    }
    
  } catch (err) {
    console.error(`Failed to connect or test ${label} database:`, err.message || err);
  } finally {
    await client.end();
  }
}

async function run() {
  await testDatabase(DUKY_DB, 'DUKY STORE');
  await testDatabase(INTEM_DB, 'INTEM CANTHO');
}

run();
