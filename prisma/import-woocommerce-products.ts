import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CategoryStatus,
  InventoryChangeType,
  MediaProvider,
  MigrationEntityType,
  MigrationStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  ProductType,
  SeoEntityType,
  SizeGender,
  TagType,
} from '../generated/prisma/client';

type CsvRow = Record<string, string>;

type ImportStats = {
  rows: number;
  products: number;
  variants: number;
  categories: number;
  tags: number;
  media: number;
  redirects: number;
  skipped: number;
};

const csvPath =
  process.argv[2] ?? 'wc-product-export-10-5-2026-1778407980671.csv';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const productRows = rows.filter((row) => row['Loại'] !== 'variation');
  const variationRows = rows.filter((row) => row['Loại'] === 'variation');
  const variationsByParentId = groupBy(
    variationRows,
    (row) => parseParentId(row['Gốc']) ?? '',
  );
  const batch = await prisma.migrationBatch.create({
    data: {
      name: `woocommerce-products-${basename(csvPath)}-${Date.now()}`,
      source: 'woocommerce_csv',
      status: MigrationStatus.RUNNING,
      startedAt: new Date(),
      summary: { file: csvPath, rows: rows.length },
    },
  });
  const stats: ImportStats = {
    rows: rows.length,
    products: 0,
    variants: 0,
    categories: 0,
    tags: 0,
    media: 0,
    redirects: 0,
    skipped: 0,
  };

  try {
    for (const row of productRows) {
      const productId = await importProduct(
        row,
        variationsByParentId.get(row['ID']) ?? [],
        stats,
      );
      await writeMigrationRecord(batch.id, MigrationEntityType.PRODUCT, row, {
        status: MigrationStatus.SUCCESS,
        targetId: productId ?? undefined,
      });
    }

    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: MigrationStatus.SUCCESS,
        finishedAt: new Date(),
        summary: stats as unknown as Prisma.InputJsonValue,
      },
    });

    console.log('WooCommerce import completed');
    console.table(stats);
  } catch (error) {
    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: MigrationStatus.FAILED,
        finishedAt: new Date(),
        summary: stats as unknown as Prisma.InputJsonValue,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

async function importProduct(
  row: CsvRow,
  variationRows: CsvRow[],
  stats: ImportStats,
) {
  const name = normalizeText(row['Tên']);

  if (!name) {
    stats.skipped += 1;
    return;
  }

  const wpId = row['ID'];
  const type =
    row['Loại'] === 'variable' ? ProductType.VARIABLE : ProductType.SIMPLE;
  const slug = await prepareUniqueSlug(name, wpId);
  const sku = await prepareUniqueProductSku(row['Mã sản phẩm'], wpId);
  const regularPrice = parseMoney(row['Giá bán thường']);
  const salePrice = parseMoney(row['Giá khuyến mãi']);
  const variantPrices = variationRows
    .map((variant) => parseMoney(variant['Giá khuyến mãi']) ?? parseMoney(variant['Giá bán thường']))
    .filter((price): price is number => price !== null && price > 0);
  const originalPrice =
    regularPrice ?? (variantPrices.length ? Math.min(...variantPrices) : 0);
  const categories = await upsertCategories(row['Danh mục'], stats);
  const tags = await upsertTags(row['Từ khóa'], stats);
  const media = await upsertMediaList(row['Hình ảnh'], stats);
  const thumbnailMediaId = media[0]?.id ?? null;
  const status =
    row['Đã đăng'] === '1' ? ProductStatus.PUBLISHED : ProductStatus.DRAFT;

  const product = await prisma.product.upsert({
    where: { slug },
    create: {
      name,
      slug,
      sku,
      type,
      status,
      originalPrice,
      salePrice,
      shortDescription: normalizeHtml(row['Mô tả ngắn']),
      description: normalizeHtml(row['Mô tả']),
      thumbnailMediaId,
      isFeatured: row['Nhãn nổi bật?'] === '1',
      publishedAt: status === ProductStatus.PUBLISHED ? new Date() : null,
      additionalInfo: buildProductMetadata(row),
    },
    update: {
      name,
      sku,
      type,
      status,
      originalPrice,
      salePrice,
      shortDescription: normalizeHtml(row['Mô tả ngắn']),
      description: normalizeHtml(row['Mô tả']),
      thumbnailMediaId,
      isFeatured: row['Nhãn nổi bật?'] === '1',
      publishedAt: status === ProductStatus.PUBLISHED ? new Date() : null,
      additionalInfo: buildProductMetadata(row),
      deletedAt: null,
    },
  });

  await replaceProductRelations(product.id, categories, tags, media);
  await upsertProductSeo(product.id, row);
  await upsertRedirect(product.id, slug, name, stats);

  if (type === ProductType.VARIABLE) {
    await importVariants(product.id, row, variationRows, stats);
  } else {
    await upsertSimpleInventory(product.id, row);
  }

  stats.products += 1;
  return product.id;
}

async function importVariants(
  productId: string,
  parentRow: CsvRow,
  variationRows: CsvRow[],
  stats: ImportStats,
) {
  for (const [index, row] of variationRows.entries()) {
    const attributeOne = normalizeText(row['Giá trị thuộc tính 1']);
    const attributeTwo = normalizeText(row['Giá trị thuộc tính 2']);
    const attributeOneName = normalizeText(row['Tên thuộc tính 1']);
    const attributeTwoName = normalizeText(row['Tên thuộc tính 2']);
    const sizeLabel = resolveSizeLabel(attributeOneName, attributeOne, attributeTwoName, attributeTwo);
    const colorName = resolveColorName(attributeOneName, attributeOne, attributeTwoName, attributeTwo);
    const sku = normalizeText(row['Mã sản phẩm']) || `WC-VAR-${row['ID']}`;
    const price = parseMoney(row['Giá bán thường']);
    const salePrice = parseMoney(row['Giá khuyến mãi']);
    const isInStock = row['Còn hàng?'] === '1';
    const quantity = parseInteger(row['Kho']) ?? (isInStock ? 999 : 0);
    const variant = await prisma.productVariant.upsert({
      where: { sku },
      create: {
        productId,
        sku,
        name: buildVariantName(attributeOne, attributeTwo),
        sizeLabel,
        sizeGender: resolveSizeGender(parentRow, attributeOneName, attributeTwoName),
        colorName,
        price,
        salePrice,
        isActive: true,
        sortOrder: index,
      },
      update: {
        productId,
        name: buildVariantName(attributeOne, attributeTwo),
        sizeLabel,
        sizeGender: resolveSizeGender(parentRow, attributeOneName, attributeTwoName),
        colorName,
        price,
        salePrice,
        isActive: true,
        sortOrder: index,
        deletedAt: null,
      },
    });

    await upsertVariantInventory(variant.id, productId, quantity, !isInStock);
    await writeMigrationRecord('latest', MigrationEntityType.PRODUCT, row, {
      status: MigrationStatus.SUCCESS,
      targetId: variant.id,
    }).catch(() => undefined);
    stats.variants += 1;
  }
}

async function upsertSimpleInventory(productId: string, row: CsvRow) {
  const isInStock = row['Còn hàng?'] === '1';
  const quantity = parseInteger(row['Kho']) ?? (isInStock ? 999 : 0);
  const existing = await prisma.inventory.findUnique({ where: { productId } });

  if (existing) {
    await prisma.inventory.update({
      where: { id: existing.id },
      data: { quantity, soldOut: !isInStock || quantity <= 0 },
    });
    return;
  }

  await prisma.inventory.create({
    data: {
      productId,
      quantity,
      soldOut: !isInStock || quantity <= 0,
      logs: {
        create: {
          productId,
          changeType: InventoryChangeType.IMPORT,
          quantityBefore: 0,
          quantityChange: quantity,
          quantityAfter: quantity,
          note: 'Imported from WooCommerce CSV',
        },
      },
    },
  });
}

async function upsertVariantInventory(
  variantId: string,
  productId: string,
  quantity: number,
  soldOut: boolean,
) {
  const existing = await prisma.inventory.findUnique({ where: { variantId } });

  if (existing) {
    await prisma.inventory.update({
      where: { id: existing.id },
      data: { quantity, soldOut },
    });
    return;
  }

  await prisma.inventory.create({
    data: {
      variantId,
      quantity,
      soldOut,
      logs: {
        create: {
          productId,
          variantId,
          changeType: InventoryChangeType.IMPORT,
          quantityBefore: 0,
          quantityChange: quantity,
          quantityAfter: quantity,
          note: 'Imported from WooCommerce CSV',
        },
      },
    },
  });
}

async function replaceProductRelations(
  productId: string,
  categories: Array<{ id: string }>,
  tags: Array<{ id: string }>,
  media: Array<{ id: string }>,
) {
  await prisma.$transaction([
    prisma.productCategory.deleteMany({ where: { productId } }),
    prisma.productTag.deleteMany({ where: { productId } }),
    prisma.productImage.deleteMany({ where: { productId } }),
  ]);

  if (categories.length) {
    await prisma.productCategory.createMany({
      data: categories.map((category, index) => ({
        productId,
        categoryId: category.id,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
  }

  if (tags.length) {
    await prisma.productTag.createMany({
      data: tags.map((tag) => ({ productId, tagId: tag.id })),
      skipDuplicates: true,
    });
  }

  if (media.length) {
    await prisma.productImage.createMany({
      data: media.map((item, index) => ({
        productId,
        mediaId: item.id,
        sortOrder: index,
        isPrimary: index === 0,
      })),
      skipDuplicates: true,
    });
  }
}

async function upsertCategories(value: string, stats: ImportStats) {
  const categoryPaths = splitList(value).map((item) =>
    item.split('>').map((part) => normalizeText(part)).filter(Boolean),
  );
  const categories: Array<{ id: string }> = [];

  for (const path of categoryPaths) {
    let parentId: string | null = null;
    let category: { id: string } | null = null;

    for (const [index, name] of path.entries()) {
      const slug = await prepareUniqueCategorySlug(name, parentId);
      category = await prisma.category.upsert({
        where: { slug },
        create: {
          name,
          slug,
          parentId,
          sortOrder: index,
          status: CategoryStatus.ACTIVE,
        },
        update: {
          name,
          parentId,
          deletedAt: null,
          status: CategoryStatus.ACTIVE,
        },
      });
      parentId = category.id;
    }

    if (category) {
      categories.push(category);
      stats.categories += 1;
    }
  }

  return uniqueBy(categories, (category) => category.id);
}

async function upsertTags(value: string, stats: ImportStats) {
  const tags: Array<{ id: string }> = [];

  for (const name of splitList(value)) {
    const slug = await prepareUniqueTagSlug(name);
    const tag = await prisma.tag.upsert({
      where: { slug },
      create: {
        name,
        slug,
        type: TagType.PRODUCT,
      },
      update: {
        name,
        deletedAt: null,
      },
    });
    tags.push(tag);
    stats.tags += 1;
  }

  return uniqueBy(tags, (tag) => tag.id);
}

async function upsertMediaList(value: string, stats: ImportStats) {
  const media: Array<{ id: string }> = [];

  for (const url of splitList(value)) {
    const existing = await prisma.media.findFirst({ where: { url } });

    if (existing) {
      media.push(existing);
      continue;
    }

    const created = await prisma.media.create({
      data: {
        provider: MediaProvider.EXTERNAL,
        providerKey: url,
        url,
        secureUrl: url,
        fileName: fileNameFromUrl(url),
        originalName: fileNameFromUrl(url),
        mimeType: mimeTypeFromUrl(url),
        folder: 'woocommerce/products',
        title: fileNameFromUrl(url),
        metadata: { source: 'woocommerce_csv' },
      },
    });
    media.push(created);
    stats.media += 1;
  }

  return uniqueBy(media, (item) => item.id);
}

async function upsertProductSeo(productId: string, row: CsvRow) {
  const metaTitle = normalizeText(row['Meta: rank_math_title']);
  const metaDescription = normalizeText(row['Meta: rank_math_description']);
  const focusKeyword = normalizeText(row['Meta: rank_math_focus_keyword']);

  if (!metaTitle && !metaDescription && !focusKeyword) {
    return;
  }

  await prisma.seoMetadata.upsert({
    where: {
      entityType_entityId: {
        entityType: SeoEntityType.PRODUCT,
        entityId: productId,
      },
    },
    create: {
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      schemaType: 'Product',
      schemaJson: {
        source: 'rank_math',
        focusKeyword,
        seoScore: row['Meta: rank_math_seo_score'] || null,
      },
    },
    update: {
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      schemaType: 'Product',
      schemaJson: {
        source: 'rank_math',
        focusKeyword,
        seoScore: row['Meta: rank_math_seo_score'] || null,
      },
    },
  });
}

async function upsertRedirect(
  productId: string,
  slug: string,
  name: string,
  stats: ImportStats,
) {
  const sourcePath = `/san-pham/${slug}/`;
  const targetPath = `/san-pham/${slug}`;

  await prisma.redirect.upsert({
    where: { sourcePath },
    create: {
      sourcePath,
      targetPath,
      statusCode: 301,
    },
    update: {
      targetPath,
      statusCode: 301,
    },
  });
  await prisma.urlMapping.upsert({
    where: { oldUrl: sourcePath },
    create: {
      oldUrl: sourcePath,
      newUrl: targetPath,
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      source: 'woocommerce_csv',
      notes: name,
    },
    update: {
      newUrl: targetPath,
      entityId: productId,
      notes: name,
    },
  });
  stats.redirects += 1;
}

async function writeMigrationRecord(
  batchId: string,
  entityType: MigrationEntityType,
  row: CsvRow,
  options: {
    status: MigrationStatus;
    targetId?: string;
    errorMessage?: string;
  },
) {
  if (batchId === 'latest') return;

  await prisma.migrationRecord.upsert({
    where: {
      batchId_entityType_sourceId: {
        batchId,
        entityType,
        sourceId: row['ID'],
      },
    },
    create: {
      batchId,
      entityType,
      sourceId: row['ID'],
      targetId: options.targetId,
      sourceUrl: row['ID'] ? `woocommerce:${row['ID']}` : null,
      status: options.status,
      payload: row as unknown as Prisma.InputJsonValue,
      errorMessage: options.errorMessage,
    },
    update: {
      targetId: options.targetId,
      status: options.status,
      payload: row as unknown as Prisma.InputJsonValue,
      errorMessage: options.errorMessage,
    },
  });
}

async function prepareUniqueSlug(name: string, wpId: string) {
  const base = slugify(name);
  const existing = await prisma.product.findFirst({
    where: { slug: base },
    select: { id: true, additionalInfo: true },
  });

  if (!existing) return base;

  const info = existing.additionalInfo as { wpId?: string } | null;
  return info?.wpId === wpId ? base : `${base}-${wpId}`;
}

async function prepareUniqueProductSku(value: string, wpId: string) {
  const sku = normalizeText(value);
  if (!sku) return null;

  const existing = await prisma.product.findUnique({
    where: { sku },
    select: { additionalInfo: true },
  });

  if (!existing) return sku;

  const info = existing.additionalInfo as { wpId?: string } | null;
  return info?.wpId === wpId ? sku : `${sku}-WC-${wpId}`;
}

async function prepareUniqueCategorySlug(name: string, parentId: string | null) {
  const base = slugify(name);
  const existing = await prisma.category.findFirst({
    where: { slug: base },
    select: { id: true, parentId: true },
  });

  return !existing || existing.parentId === parentId
    ? base
    : `${base}-${slugify(parentId ?? 'root')}`;
}

async function prepareUniqueTagSlug(name: string) {
  return slugify(name);
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((item) => item !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(
      headers.map((header, index) => [normalizeText(header), record[index] ?? '']),
    ),
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

function splitList(value?: string) {
  return (value ?? '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function parseParentId(value?: string) {
  const match = value?.match(/id:(\d+)/);
  return match?.[1] ?? null;
}

function parseMoney(value?: string) {
  const normalized = normalizeText(value).replace(/[^\d]/g, '');
  if (!normalized) return null;
  return Number(normalized);
}

function parseInteger(value?: string) {
  const normalized = normalizeText(value).replace(/[^\d-]/g, '');
  if (!normalized) return null;
  return Number(normalized);
}

function buildProductMetadata(row: CsvRow) {
  return {
    source: 'woocommerce_csv',
    wpId: row['ID'],
    visibility: row['Hiển thị trong danh mục'] || null,
    stockStatus: row['Còn hàng?'] === '1' ? 'instock' : 'outofstock',
    rawAttributes: [
      {
        name: row['Tên thuộc tính 1'] || null,
        value: row['Giá trị thuộc tính 1'] || null,
      },
      {
        name: row['Tên thuộc tính 2'] || null,
        value: row['Giá trị thuộc tính 2'] || null,
      },
    ],
    rankMath: {
      score: row['Meta: rank_math_seo_score'] || null,
      focusKeyword: row['Meta: rank_math_focus_keyword'] || null,
      description: row['Meta: rank_math_description'] || null,
      title: row['Meta: rank_math_title'] || null,
    },
    woodmart: {
      totalStock: row['Meta: woodmart_total_stock_quantity'] || null,
      customTabTitle: row['Meta: _woodmart_product_custom_tab_title'] || null,
      customTabContent: row['Meta: _woodmart_product_custom_tab_content'] || null,
    },
  } satisfies Prisma.InputJsonValue;
}

function resolveSizeLabel(
  name1: string,
  value1: string,
  name2: string,
  value2: string,
) {
  if (isSizeAttribute(name1)) return value1 || null;
  if (isSizeAttribute(name2)) return value2 || null;
  return /^\d{2}$|^[SMLX\d]+$|^Freesize$/i.test(value1) ? value1 : value2 || null;
}

function resolveColorName(
  name1: string,
  value1: string,
  name2: string,
  value2: string,
) {
  if (isColorAttribute(name1)) return value1 || null;
  if (isColorAttribute(name2)) return value2 || null;
  return null;
}

function resolveSizeGender(parentRow: CsvRow, name1: string, name2: string) {
  const text = `${parentRow['Tên']} ${parentRow['Danh mục']} ${name1} ${name2}`.toLowerCase();
  if (text.includes('nữ')) return SizeGender.WOMEN;
  if (text.includes('nam')) return SizeGender.MEN;
  return SizeGender.UNISEX;
}

function isSizeAttribute(name: string) {
  return name.toLowerCase().includes('size');
}

function isColorAttribute(name: string) {
  return name.toLowerCase().includes('color') || name.toLowerCase().includes('màu');
}

function buildVariantName(...values: string[]) {
  return values.filter(Boolean).join(' - ') || null;
}

function normalizeHtml(value?: string) {
  return normalizeText(value).replace(/\\n/g, '\n') || null;
}

function normalizeText(value?: string | null) {
  return (value ?? '').replace(/\uFEFF/g, '').trim();
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function fileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
  } catch {
    return url.split('/').pop() || 'image';
  }
}

function mimeTypeFromUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [keyFn(item), item])).values());
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
