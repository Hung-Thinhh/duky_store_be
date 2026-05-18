import { existsSync, readFileSync } from 'node:fs';
import { Client } from 'pg';

type TableInfo = {
  name: string;
  columns: string[];
  jsonColumns: Set<string>;
};

const CONFIRMATION = 'copy-all-data';
const ALWAYS_EXCLUDED_TABLES = new Set(['_prisma_migrations']);
const PRODUCT_DATA_TABLES = new Set([
  'blog_post_tags',
  'brands',
  'campaign_categories',
  'campaign_products',
  'campaigns',
  'cart_items',
  'carts',
  'categories',
  'coupon_categories',
  'coupon_products',
  'coupon_usages',
  'coupons',
  'homepage_items',
  'inventories',
  'inventory_logs',
  'media',
  'migration_batches',
  'migration_records',
  'order_items',
  'order_status_histories',
  'orders',
  'payments',
  'product_attribute_terms',
  'product_attributes',
  'product_brands',
  'product_categories',
  'product_images',
  'product_option_groups',
  'product_option_values',
  'product_reviews',
  'product_shipping_profiles',
  'product_tags',
  'product_variant_option_values',
  'product_variants',
  'products',
  'related_products',
  'seo_metadata',
  'shipments',
  'shipping_addresses',
  'shipping_rates',
  'shipping_zones',
  'sitemap_entries',
  'tags',
  'url_mappings',
  'wishlist_items',
  'wishlists',
]);

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    process.env[key] ??= value;
  }
}

function maskDatabaseUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.password) {
      parsedUrl.password = '***';
    }

    if (parsedUrl.username) {
      parsedUrl.username = '***';
    }

    return parsedUrl.toString();
  } catch {
    return '<invalid-url>';
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function qualifiedTable(tableName: string) {
  return `${quoteIdentifier('public')}.${quoteIdentifier(tableName)}`;
}

function isCopyMode() {
  return process.env.MIGRATE_MODE === 'copy';
}

function getExcludedTables() {
  const excludedTables = new Set<string>(ALWAYS_EXCLUDED_TABLES);

  if (process.env.MIGRATE_SKIP_PRODUCT_DATA === 'true') {
    for (const tableName of PRODUCT_DATA_TABLES) {
      excludedTables.add(tableName);
    }
  }

  const extraTables = process.env.MIGRATE_EXCLUDE_TABLES?.split(',') ?? [];

  for (const tableName of extraTables) {
    const normalizedTableName = tableName.trim();

    if (normalizedTableName) {
      excludedTables.add(normalizedTableName);
    }
  }

  return excludedTables;
}

function ensureEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function getPublicTables(client: Client, excludedTables: Set<string>) {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
  );

  return result.rows
    .map((row) => row.table_name)
    .filter((tableName) => !excludedTables.has(tableName));
}

async function getTableColumns(client: Client, tableName: string) {
  const result = await client.query<{
    column_name: string;
    data_type: string;
  }>(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return {
    columns: result.rows.map((row) => row.column_name),
    jsonColumns: new Set(
      result.rows
        .filter((row) => row.data_type === 'json' || row.data_type === 'jsonb')
        .map((row) => row.column_name),
    ),
  };
}

async function getTablesInfo(
  client: Client,
  excludedTables: Set<string>,
): Promise<TableInfo[]> {
  const tableNames = await getPublicTables(client, excludedTables);
  const tables: TableInfo[] = [];

  for (const name of tableNames) {
    const columnInfo = await getTableColumns(client, name);

    tables.push({
      name,
      columns: columnInfo.columns,
      jsonColumns: columnInfo.jsonColumns,
    });
  }

  return tables;
}

async function getRowCounts(client: Client, tables: string[]) {
  const counts = new Map<string, number>();

  for (const tableName of tables) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${qualifiedTable(tableName)}`,
    );

    counts.set(tableName, Number(result.rows[0]?.count ?? 0));
  }

  return counts;
}

function assertTargetHasSourceTables(sourceTables: TableInfo[], targetTables: TableInfo[]) {
  const targetTableNames = new Set(targetTables.map((table) => table.name));
  const missingTables = sourceTables
    .map((table) => table.name)
    .filter((tableName) => !targetTableNames.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      `Target DB is missing tables: ${missingTables.join(', ')}. Run prisma migrate deploy on the target first.`,
    );
  }

  const targetColumnsByTable = new Map(
    targetTables.map((table) => [table.name, new Set(table.columns)]),
  );

  for (const sourceTable of sourceTables) {
    const targetColumns = targetColumnsByTable.get(sourceTable.name);
    const missingColumns = sourceTable.columns.filter(
      (column) => !targetColumns?.has(column),
    );

    if (missingColumns.length > 0) {
      throw new Error(
        `Target table ${sourceTable.name} is missing columns: ${missingColumns.join(', ')}`,
      );
    }
  }
}

async function truncateTargetTables(client: Client, tableNames: string[]) {
  if (tableNames.length === 0) {
    return;
  }

  const tableList = tableNames.map(qualifiedTable).join(', ');

  await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

async function copyTable(source: Client, target: Client, table: TableInfo) {
  const columns = table.columns;

  if (columns.length === 0) {
    return 0;
  }

  const sourceRows = await source.query(
    `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${qualifiedTable(table.name)}`,
  );

  if (sourceRows.rowCount === 0) {
    return 0;
  }

  const columnList = columns.map(quoteIdentifier).join(', ');
  const chunkSize = 500;

  for (let offset = 0; offset < sourceRows.rows.length; offset += chunkSize) {
    const chunk = sourceRows.rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const rowPlaceholders = chunk.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(
          table.jsonColumns.has(column) && row[column] !== null
            ? JSON.stringify(row[column])
            : row[column],
        );
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });

      return `(${placeholders.join(', ')})`;
    });

    await target.query(
      `
        INSERT INTO ${qualifiedTable(table.name)} (${columnList})
        VALUES ${rowPlaceholders.join(', ')}
      `,
      values,
    );
  }

  return sourceRows.rowCount;
}

async function resetSequences(client: Client, tableNames: string[]) {
  for (const tableName of tableNames) {
    const result = await client.query<{
      column_name: string;
      sequence_name: string | null;
    }>(
      `
        SELECT
          column_name,
          pg_get_serial_sequence($1, column_name) AS sequence_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $2
      `,
      [`public.${tableName}`, tableName],
    );

    for (const row of result.rows) {
      if (!row.sequence_name) {
        continue;
      }

      await client.query(
        `
          SELECT setval(
            $1::regclass,
            COALESCE((SELECT MAX(${quoteIdentifier(row.column_name)}) FROM ${qualifiedTable(tableName)}), 1),
            EXISTS(SELECT 1 FROM ${qualifiedTable(tableName)})
          )
        `,
        [row.sequence_name],
      );
    }
  }
}

async function main() {
  loadDotEnv();

  const sourceUrl = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
  const targetUrl = ensureEnv('TARGET_DATABASE_URL');

  if (!sourceUrl) {
    throw new Error('SOURCE_DATABASE_URL or DATABASE_URL is required');
  }

  if (sourceUrl === targetUrl) {
    throw new Error('Source and target database URLs are the same');
  }

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  const excludedTables = getExcludedTables();

  await source.connect();
  await target.connect();

  try {
    const sourceTables = await getTablesInfo(source, excludedTables);
    const targetTables = await getTablesInfo(target, excludedTables);
    assertTargetHasSourceTables(sourceTables, targetTables);

    const tableNames = sourceTables.map((table) => table.name);
    const sourceCounts = await getRowCounts(source, tableNames);
    const targetCounts = await getRowCounts(target, tableNames);

    console.log(`Source: ${maskDatabaseUrl(sourceUrl)}`);
    console.log(`Target: ${maskDatabaseUrl(targetUrl)}`);
    console.log(`Tables: ${tableNames.length}`);
    console.log(
      `Excluded tables: ${
        excludedTables.size > 0
          ? Array.from(excludedTables).sort().join(', ')
          : 'none'
      }`,
    );

    for (const tableName of tableNames) {
      console.log(
        `${tableName}: source=${sourceCounts.get(tableName) ?? 0}, target=${targetCounts.get(tableName) ?? 0}`,
      );
    }

    if (!isCopyMode()) {
      console.log(
        `Dry run only. Set MIGRATE_MODE=copy and MIGRATE_CONFIRM=${CONFIRMATION} to copy data.`,
      );
      return;
    }

    if (process.env.MIGRATE_CONFIRM !== CONFIRMATION) {
      throw new Error(`MIGRATE_CONFIRM must be ${CONFIRMATION}`);
    }

    await target.query('BEGIN');

    try {
      await target.query('SET session_replication_role = replica');
      await truncateTargetTables(target, tableNames);

      for (const table of sourceTables) {
        const copiedRows = await copyTable(source, target, table);
        console.log(`Copied ${copiedRows} rows from ${table.name}`);
      }

      await resetSequences(target, tableNames);
      await target.query('SET session_replication_role = DEFAULT');
      await target.query('COMMIT');
    } catch (error) {
      await target.query('ROLLBACK');
      throw error;
    }

    console.log('Data migration completed.');
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
