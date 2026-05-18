import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CategoryStatus,
  InventoryChangeType,
  MediaProvider,
  MigrationEntityType,
  MigrationStatus,
  Prisma,
  PrismaClient,
  ProductOptionType,
  ProductStatus,
  ProductType,
  SeoEntityType,
  SizeGender,
  TagType,
} from '../generated/prisma/client';

type ExcelRow = Record<string, string>;

type ProductGroup = {
  index: number;
  base: ExcelRow;
  rows: ExcelRow[];
  attributeNames: string[];
};

type ProductAttributeValue = {
  name: string;
  value: string;
};

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

type ImportStats = {
  rows: number;
  products: number;
  variants: number;
  categories: number;
  tags: number;
  brands: number;
  media: number;
  attributes: number;
  attributeTerms: number;
  optionGroups: number;
  optionValues: number;
  inventories: number;
  redirects: number;
  sitemapEntries: number;
  skipped: number;
};

const CONFIRMATION = 'import-products';
const DEFAULT_FILE =
  'danh_sach_san_pham_18.05.2026_4ce652ac4696d6b046b0ec3589abd1b6.xlsx';

const PRODUCT_TRUNCATE_TABLES = [
  'product_variant_option_values',
  'product_option_values',
  'product_option_groups',
  'inventory_logs',
  'inventories',
  'product_variants',
  'product_images',
  'product_categories',
  'product_tags',
  'product_brands',
  'product_shipping_profiles',
  'product_attribute_terms',
  'product_attributes',
  'seo_metadata',
  'url_mappings',
  'sitemap_entries',
  'products',
  'categories',
  'tags',
  'brands',
  'media',
];

const filePath = process.argv[2] ?? DEFAULT_FILE;
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
const categoryCache = new Map<string, { id: string }>();
const tagCache = new Map<string, { id: string }>();
const brandCache = new Map<string, { id: string }>();
const mediaCache = new Map<string, { id: string }>();
const attributeCache = new Map<string, { id: string }>();
const attributeTermCache = new Set<string>();

async function main() {
  const rows = parseWorkbook(filePath);
  const groups = groupProducts(rows);
  const stats = createEmptyStats(rows.length);

  printSummary(filePath, rows, groups);

  if (process.env.SAPO_IMPORT_MODE !== 'import') {
    console.log(
      `Dry run only. Set SAPO_IMPORT_MODE=import and SAPO_IMPORT_CONFIRM=${CONFIRMATION} to import.`,
    );
    return;
  }

  if (process.env.SAPO_IMPORT_CONFIRM !== CONFIRMATION) {
    throw new Error(`SAPO_IMPORT_CONFIRM must be ${CONFIRMATION}`);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.SAPO_IMPORT_TRUNCATE === 'true') {
    await truncateProductTables();
  }

  const batch = await prisma.migrationBatch.create({
    data: {
      name: `sapo-products-${basename(filePath)}-${Date.now()}`,
      source: 'sapo_xlsx',
      status: MigrationStatus.RUNNING,
      startedAt: new Date(),
      summary: {
        file: filePath,
        rows: rows.length,
        products: groups.length,
      },
    },
  });

  try {
    if (process.env.SAPO_IMPORT_TRUNCATE === 'true') {
      await bulkImportProductGroups(groups, batch.id, stats);
      await prisma.migrationBatch.update({
        where: { id: batch.id },
        data: {
          status: MigrationStatus.SUCCESS,
          finishedAt: new Date(),
          summary: stats as unknown as Prisma.InputJsonValue,
        },
      });

      console.log('Sapo product bulk import completed.');
      console.table(stats);
      return;
    }

    for (const group of groups) {
      const productId = await importProductGroup(group, stats);
      await writeMigrationRecord(batch.id, MigrationEntityType.PRODUCT, {
        sourceId: productSourceId(group),
        targetId: productId,
        payload: {
          productName: productName(group),
          rows: group.rows.length,
          firstSku: normalizeText(group.rows[0]?.['Mã SKU*']),
        },
      });

      if (stats.products > 0 && stats.products % 25 === 0) {
        console.log(
          `Imported ${stats.products}/${groups.length} products, ${stats.variants} variants`,
        );
      }
    }

    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: MigrationStatus.SUCCESS,
        finishedAt: new Date(),
        summary: stats as unknown as Prisma.InputJsonValue,
      },
    });

    console.log('Sapo product import completed.');
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

async function importProductGroup(group: ProductGroup, stats: ImportStats) {
  const name = productName(group);

  if (!name) {
    stats.skipped += group.rows.length;
    return null;
  }

  const productRows = group.rows.filter((row) => normalizeText(row['Mã SKU*']));

  if (productRows.length === 0) {
    stats.skipped += group.rows.length;
    return null;
  }

  const variantAttributes = productRows.map((row) =>
    getVariantAttributes(group, row),
  );
  const hasOptions = variantAttributes.some((attributes) => attributes.length > 0);
  const isVariable = productRows.length > 1 || hasOptions;
  const firstRow = productRows[0];
  const imageUrls = unique(
    productRows.map((row) => normalizeText(row['Ảnh đại diện'])).filter(Boolean),
  );
  const media = await upsertMediaList(imageUrls, stats);
  const categories = await upsertCategories(group.base['Loại sản phẩm'], stats);
  const tags = await upsertTags(group.base['Tags'], stats);
  const brands = await upsertBrands(group.base['Nhãn hiệu'], stats);
  const retailPrices = productRows
    .map((row) => parseMoney(row['PL_Giá bán lẻ']))
    .filter((price): price is number => price !== null && price > 0);
  const originalPrice = retailPrices.length ? Math.min(...retailPrices) : 0;
  const slug = await prepareUniqueProductSlug(name, firstRow['Mã SKU*']);
  const productSku = normalizeText(firstRow['Mã SKU*']) || null;
  const product = await prisma.product.upsert({
    where: { slug },
    create: {
      name,
      slug,
      sku: productSku,
      type: isVariable ? ProductType.VARIABLE : ProductType.SIMPLE,
      status: ProductStatus.PUBLISHED,
      originalPrice,
      salePrice: null,
      description: normalizeText(group.base['Mô tả sản phẩm']) || null,
      thumbnailMediaId: media[0]?.id ?? null,
      publishedAt: new Date(),
      additionalInfo: buildProductMetadata(group, originalPrice),
    },
    update: {
      name,
      sku: productSku,
      type: isVariable ? ProductType.VARIABLE : ProductType.SIMPLE,
      status: ProductStatus.PUBLISHED,
      originalPrice,
      salePrice: null,
      description: normalizeText(group.base['Mô tả sản phẩm']) || null,
      thumbnailMediaId: media[0]?.id ?? null,
      publishedAt: new Date(),
      additionalInfo: buildProductMetadata(group, originalPrice),
      deletedAt: null,
    },
  });

  await cleanProductRelations(product.id);
  await replaceProductRelations(product.id, categories, tags, brands, media);
  const optionValueMap = await upsertProductOptions(
    product.id,
    group,
    productRows,
    stats,
  );
  await upsertProductShipping(product.id, firstRow);
  await upsertProductSeo(product.id, name, slug, media[0]?.id ?? null);
  await upsertProductRedirects(product.id, slug, name, stats);

  if (isVariable) {
    for (const [index, row] of productRows.entries()) {
      await upsertVariant(product.id, group, row, index, optionValueMap, stats);
    }
  } else {
    await upsertSimpleInventory(product.id, firstRow, stats);
  }

  stats.products += 1;
  return product.id;
}

async function upsertVariant(
  productId: string,
  group: ProductGroup,
  row: ExcelRow,
  index: number,
  optionValueMap: Map<string, string>,
  stats: ImportStats,
) {
  const sku = normalizeText(row['Mã SKU*']);

  if (!sku) {
    stats.skipped += 1;
    return;
  }

  const attributes = getVariantAttributes(group, row);
  const variant = await prisma.productVariant.upsert({
    where: { sku },
    create: {
      productId,
      sku,
      name: normalizeText(row['Tên phiên bản sản phẩm']) || buildVariantName(attributes),
      sizeLabel: resolveSizeLabel(attributes),
      sizeGender: resolveSizeGender(group),
      colorName: resolveColorName(attributes),
      price: parseMoney(row['PL_Giá bán lẻ']),
      salePrice: null,
      isActive: true,
      sortOrder: index,
    },
    update: {
      productId,
      name: normalizeText(row['Tên phiên bản sản phẩm']) || buildVariantName(attributes),
      sizeLabel: resolveSizeLabel(attributes),
      sizeGender: resolveSizeGender(group),
      colorName: resolveColorName(attributes),
      price: parseMoney(row['PL_Giá bán lẻ']),
      salePrice: null,
      isActive: true,
      sortOrder: index,
      deletedAt: null,
    },
  });

  await replaceVariantOptionValues(variant.id, attributes, optionValueMap);
  await upsertVariantInventory(productId, variant.id, row, stats);
  stats.variants += 1;
}

async function cleanProductRelations(productId: string) {
  await prisma.productVariant.deleteMany({ where: { productId } });
  await prisma.inventory.deleteMany({ where: { productId } });
  await prisma.productCategory.deleteMany({ where: { productId } });
  await prisma.productTag.deleteMany({ where: { productId } });
  await prisma.productBrand.deleteMany({ where: { productId } });
  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.productOptionGroup.deleteMany({ where: { productId } });
  await prisma.productShippingProfile.deleteMany({ where: { productId } });
}

async function replaceProductRelations(
  productId: string,
  categories: Array<{ id: string }>,
  tags: Array<{ id: string }>,
  brands: Array<{ id: string }>,
  media: Array<{ id: string }>,
) {
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

  if (brands.length) {
    await prisma.productBrand.createMany({
      data: brands.map((brand, index) => ({
        productId,
        brandId: brand.id,
        sortOrder: index,
      })),
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

async function upsertProductOptions(
  productId: string,
  group: ProductGroup,
  rows: ExcelRow[],
  stats: ImportStats,
) {
  const optionValueMap = new Map<string, string>();

  for (const [groupIndex, name] of group.attributeNames.entries()) {
    if (!name) {
      continue;
    }

    await upsertGlobalAttribute(name, stats);
    const optionGroup = await prisma.productOptionGroup.create({
      data: {
        productId,
        name,
        type: resolveOptionType(name),
        sortOrder: groupIndex,
      },
    });
    stats.optionGroups += 1;

    const values = unique(
      rows
        .map((row) => normalizeText(row[`Giá trị thuộc tính ${groupIndex + 1}`]))
        .filter(Boolean),
    );

    for (const [valueIndex, value] of values.entries()) {
      const optionValue = await prisma.productOptionValue.create({
        data: {
          groupId: optionGroup.id,
          value,
          label: value,
          sortOrder: valueIndex,
        },
      });
      optionValueMap.set(optionKey(name, value), optionValue.id);
      await upsertGlobalAttributeTerm(name, value, valueIndex, stats);
      stats.optionValues += 1;
    }
  }

  return optionValueMap;
}

async function replaceVariantOptionValues(
  variantId: string,
  attributes: ProductAttributeValue[],
  optionValueMap: Map<string, string>,
) {
  if (attributes.length === 0) {
    return;
  }

  const optionValueIds: string[] = [];

  for (const attribute of attributes) {
    const optionValueId = optionValueMap.get(optionKey(attribute.name, attribute.value));

    if (optionValueId) {
      optionValueIds.push(optionValueId);
    }
  }

  if (optionValueIds.length === 0) {
    return;
  }

  await prisma.productVariantOptionValue.createMany({
    data: optionValueIds.map((optionValueId) => ({
      variantId,
      optionValueId,
    })),
    skipDuplicates: true,
  });
}

async function upsertSimpleInventory(
  productId: string,
  row: ExcelRow,
  stats: ImportStats,
) {
  const quantity = parseInteger(row['LC_DK01_Tồn kho ban đầu*']) ?? 0;
  await prisma.inventory.upsert({
    where: { productId },
    create: {
      productId,
      quantity,
      lowStockThreshold: parseInteger(row['LC_DK01_Tồn tối thiểu']) ?? 3,
      soldOut: quantity <= 0,
      logs: {
        create: {
          productId,
          changeType: InventoryChangeType.IMPORT,
          quantityBefore: 0,
          quantityChange: quantity,
          quantityAfter: quantity,
          note: 'Imported from Sapo XLSX',
        },
      },
    },
    update: {
      quantity,
      lowStockThreshold: parseInteger(row['LC_DK01_Tồn tối thiểu']) ?? 3,
      soldOut: quantity <= 0,
    },
  });
  stats.inventories += 1;
}

async function upsertVariantInventory(
  productId: string,
  variantId: string,
  row: ExcelRow,
  stats: ImportStats,
) {
  const quantity = parseInteger(row['LC_DK01_Tồn kho ban đầu*']) ?? 0;
  await prisma.inventory.upsert({
    where: { variantId },
    create: {
      variantId,
      quantity,
      lowStockThreshold: parseInteger(row['LC_DK01_Tồn tối thiểu']) ?? 3,
      soldOut: quantity <= 0,
      logs: {
        create: {
          productId,
          variantId,
          changeType: InventoryChangeType.IMPORT,
          quantityBefore: 0,
          quantityChange: quantity,
          quantityAfter: quantity,
          note: 'Imported from Sapo XLSX',
        },
      },
    },
    update: {
      quantity,
      lowStockThreshold: parseInteger(row['LC_DK01_Tồn tối thiểu']) ?? 3,
      soldOut: quantity <= 0,
    },
  });
  stats.inventories += 1;
}

async function upsertCategories(value: string, stats: ImportStats) {
  const categories: Array<{ id: string }> = [];

  for (const name of splitList(value)) {
    const slug = await prepareUniqueCategorySlug(name);
    const cached = categoryCache.get(slug);

    if (cached) {
      categories.push(cached);
      continue;
    }

    const category = await prisma.category.upsert({
      where: { slug },
      create: {
        name,
        slug,
        status: CategoryStatus.ACTIVE,
      },
      update: {
        name,
        status: CategoryStatus.ACTIVE,
        deletedAt: null,
      },
    });
    categories.push(category);
    categoryCache.set(slug, category);
    stats.categories += 1;
  }

  return uniqueBy(categories, (category) => category.id);
}

async function upsertTags(value: string, stats: ImportStats) {
  const tags: Array<{ id: string }> = [];

  for (const name of splitList(value)) {
    const slug = await prepareUniqueTagSlug(name);
    const cached = tagCache.get(slug);

    if (cached) {
      tags.push(cached);
      continue;
    }

    const tag = await prisma.tag.upsert({
      where: { slug },
      create: {
        name,
        slug,
        type: TagType.PRODUCT,
      },
      update: {
        name,
        type: TagType.PRODUCT,
        deletedAt: null,
      },
    });
    tags.push(tag);
    tagCache.set(slug, tag);
    stats.tags += 1;
  }

  return uniqueBy(tags, (tag) => tag.id);
}

async function upsertBrands(value: string, stats: ImportStats) {
  const brands: Array<{ id: string }> = [];

  for (const name of splitList(value)) {
    const slug = await prepareUniqueBrandSlug(name);
    const cached = brandCache.get(slug);

    if (cached) {
      brands.push(cached);
      continue;
    }

    const brand = await prisma.brand.upsert({
      where: { slug },
      create: {
        name,
        slug,
      },
      update: {
        name,
        deletedAt: null,
        isActive: true,
      },
    });
    brands.push(brand);
    brandCache.set(slug, brand);
    stats.brands += 1;
  }

  return uniqueBy(brands, (brand) => brand.id);
}

async function upsertMediaList(urls: string[], stats: ImportStats) {
  const media: Array<{ id: string }> = [];

  for (const url of urls) {
    const cached = mediaCache.get(url);

    if (cached) {
      media.push(cached);
      continue;
    }

    const existing = await prisma.media.findFirst({ where: { url } });

    if (existing) {
      media.push(existing);
      mediaCache.set(url, existing);
      continue;
    }

    const fileName = fileNameFromUrl(url);
    const created = await prisma.media.create({
      data: {
        provider: MediaProvider.EXTERNAL,
        providerKey: url,
        url,
        secureUrl: url,
        fileName,
        originalName: fileName,
        mimeType: mimeTypeFromUrl(url),
        folder: 'sapo/products',
        title: fileName,
        metadata: { source: 'sapo_xlsx' },
      },
    });
    media.push(created);
    mediaCache.set(url, created);
    stats.media += 1;
  }

  return uniqueBy(media, (item) => item.id);
}

async function upsertGlobalAttribute(name: string, stats: ImportStats) {
  const slug = slugify(name);
  const cached = attributeCache.get(slug);

  if (cached) {
    return cached;
  }

  const attribute = await prisma.productAttribute.upsert({
    where: { slug },
    create: {
      name,
      slug,
      type: resolveOptionType(name),
    },
    update: {
      name,
      type: resolveOptionType(name),
      deletedAt: null,
    },
  });
  attributeCache.set(slug, attribute);
  stats.attributes += 1;
  return attribute;
}

async function upsertGlobalAttributeTerm(
  attributeName: string,
  value: string,
  sortOrder: number,
  stats: ImportStats,
) {
  const attributeSlug = slugify(attributeName);
  const termSlug = slugify(value);
  const cacheKey = `${attributeSlug}:${termSlug}`;

  if (attributeTermCache.has(cacheKey)) {
    return;
  }

  const attribute = await upsertGlobalAttribute(attributeName, stats);

  if (!attribute) {
    return;
  }

  await prisma.productAttributeTerm.upsert({
    where: {
      attributeId_slug: {
        attributeId: attribute.id,
        slug: termSlug,
      },
    },
    create: {
      attributeId: attribute.id,
      name: value,
      slug: termSlug,
      value,
      sortOrder,
    },
    update: {
      name: value,
      value,
      sortOrder,
      deletedAt: null,
    },
  });
  attributeTermCache.add(cacheKey);
  stats.attributeTerms += 1;
}

async function upsertProductShipping(productId: string, row: ExcelRow) {
  const weight = parseNumber(row['Khối lượng']);

  if (weight === null) {
    return;
  }

  await prisma.productShippingProfile.upsert({
    where: { productId },
    create: {
      productId,
      weight,
      shippingClass: normalizeText(row['Đơn vị khối lượng']) || null,
    },
    update: {
      weight,
      shippingClass: normalizeText(row['Đơn vị khối lượng']) || null,
    },
  });
}

async function upsertProductSeo(
  productId: string,
  name: string,
  slug: string,
  ogImageMediaId: string | null,
) {
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
      metaTitle: name,
      canonicalUrl: `/san-pham/${slug}`,
      ogTitle: name,
      ogImageMediaId,
      schemaType: 'Product',
      schemaJson: { source: 'sapo_xlsx' },
    },
    update: {
      metaTitle: name,
      canonicalUrl: `/san-pham/${slug}`,
      ogTitle: name,
      ogImageMediaId,
      schemaType: 'Product',
      schemaJson: { source: 'sapo_xlsx' },
    },
  });
}

async function upsertProductRedirects(
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
      source: 'sapo_xlsx',
      notes: name,
    },
    update: {
      newUrl: targetPath,
      entityId: productId,
      notes: name,
    },
  });
  await prisma.sitemapEntry.upsert({
    where: { url: targetPath },
    create: {
      url: targetPath,
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      priority: 0.8,
      changefreq: 'weekly',
      isActive: true,
    },
    update: {
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      isActive: true,
    },
  });
  stats.redirects += 1;
  stats.sitemapEntries += 1;
}

async function writeMigrationRecord(
  batchId: string,
  entityType: MigrationEntityType,
  options: {
    sourceId: string;
    targetId: string | null;
    payload: Prisma.InputJsonValue;
  },
) {
  await prisma.migrationRecord.upsert({
    where: {
      batchId_entityType_sourceId: {
        batchId,
        entityType,
        sourceId: options.sourceId,
      },
    },
    create: {
      batchId,
      entityType,
      sourceId: options.sourceId,
      targetId: options.targetId,
      sourceUrl: `sapo:${options.sourceId}`,
      status: MigrationStatus.SUCCESS,
      payload: options.payload,
    },
    update: {
      targetId: options.targetId,
      status: MigrationStatus.SUCCESS,
      payload: options.payload,
    },
  });
}

async function truncateProductTables() {
  const tableList = PRODUCT_TRUNCATE_TABLES.map(quoteIdentifier).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

async function bulkImportProductGroups(
  groups: ProductGroup[],
  batchId: string,
  stats: ImportStats,
) {
  const now = new Date();
  const categories = new Map<string, Prisma.CategoryCreateManyInput>();
  const tags = new Map<string, Prisma.TagCreateManyInput>();
  const brands = new Map<string, Prisma.BrandCreateManyInput>();
  const media = new Map<string, Prisma.MediaCreateManyInput>();
  const attributes = new Map<string, Prisma.ProductAttributeCreateManyInput>();
  const attributeTerms = new Map<string, Prisma.ProductAttributeTermCreateManyInput>();
  const products: Prisma.ProductCreateManyInput[] = [];
  const productCategories: Prisma.ProductCategoryCreateManyInput[] = [];
  const productTags: Prisma.ProductTagCreateManyInput[] = [];
  const productBrands: Prisma.ProductBrandCreateManyInput[] = [];
  const productImages: Prisma.ProductImageCreateManyInput[] = [];
  const shippingProfiles: Prisma.ProductShippingProfileCreateManyInput[] = [];
  const optionGroups: Prisma.ProductOptionGroupCreateManyInput[] = [];
  const optionValues: Prisma.ProductOptionValueCreateManyInput[] = [];
  const variants: Prisma.ProductVariantCreateManyInput[] = [];
  const variantOptionValues: Prisma.ProductVariantOptionValueCreateManyInput[] = [];
  const inventories: Prisma.InventoryCreateManyInput[] = [];
  const inventoryLogs: Prisma.InventoryLogCreateManyInput[] = [];
  const seoMetadata: Prisma.SeoMetadataCreateManyInput[] = [];
  const redirects: Prisma.RedirectCreateManyInput[] = [];
  const urlMappings: Prisma.UrlMappingCreateManyInput[] = [];
  const sitemapEntries: Prisma.SitemapEntryCreateManyInput[] = [];
  const migrationRecords: Prisma.MigrationRecordCreateManyInput[] = [];
  const productSlugCounts = new Map<string, number>();

  for (const group of groups) {
    const name = productName(group);

    if (!name) {
      stats.skipped += group.rows.length;
      continue;
    }

    const rows = group.rows.filter((row) => normalizeText(row['Mã SKU*']));

    if (rows.length === 0) {
      stats.skipped += group.rows.length;
      continue;
    }

    const firstRow = rows[0];
    const variantAttributes = rows.map((row) => getVariantAttributes(group, row));
    const hasOptions = variantAttributes.some((items) => items.length > 0);
    const isVariable = rows.length > 1 || hasOptions;
    const retailPrices = rows
      .map((row) => parseMoney(row['PL_Giá bán lẻ']))
      .filter((price): price is number => price !== null && price > 0);
    const originalPrice = retailPrices.length ? Math.min(...retailPrices) : 0;
    const productId = randomUUID();
    const slug = uniqueLocalSlug(name, firstRow['Mã SKU*'], productSlugCounts);
    const imageUrls = unique(
      rows.map((row) => normalizeText(row['Ảnh đại diện'])).filter(Boolean),
    );
    const thumbnailMediaId = imageUrls[0] ? ensureMedia(imageUrls[0], media) : null;

    products.push({
      id: productId,
      name,
      slug,
      sku: normalizeText(firstRow['Mã SKU*']) || null,
      type: isVariable ? ProductType.VARIABLE : ProductType.SIMPLE,
      status: ProductStatus.PUBLISHED,
      originalPrice,
      salePrice: null,
      description: normalizeText(group.base['Mô tả sản phẩm']) || null,
      thumbnailMediaId,
      publishedAt: now,
      additionalInfo: buildProductMetadata(group, originalPrice),
    });

    for (const [index, categoryName] of splitList(group.base['Loại sản phẩm']).entries()) {
      const categoryId = ensureCategory(categoryName, categories);
      productCategories.push({ productId, categoryId, sortOrder: index });
    }

    for (const tagName of splitList(group.base['Tags'])) {
      const tagId = ensureTag(tagName, tags);
      productTags.push({ productId, tagId });
    }

    for (const [index, brandName] of splitList(group.base['Nhãn hiệu']).entries()) {
      const brandId = ensureBrand(brandName, brands);
      productBrands.push({ productId, brandId, sortOrder: index });
    }

    for (const [index, imageUrl] of imageUrls.entries()) {
      const mediaId = ensureMedia(imageUrl, media);
      productImages.push({
        productId,
        mediaId,
        sortOrder: index,
        isPrimary: index === 0,
      });
    }

    const weight = parseNumber(firstRow['Khối lượng']);
    if (weight !== null) {
      shippingProfiles.push({
        id: randomUUID(),
        productId,
        weight,
        shippingClass: normalizeText(firstRow['Đơn vị khối lượng']) || null,
      });
    }

    const optionValueIds = buildBulkProductOptions(
      productId,
      group,
      rows,
      attributes,
      attributeTerms,
      optionGroups,
      optionValues,
    );

    if (isVariable) {
      for (const [index, row] of rows.entries()) {
        const sku = normalizeText(row['Mã SKU*']);
        const variantId = randomUUID();
        const attributesForVariant = getVariantAttributes(group, row);

        variants.push({
          id: variantId,
          productId,
          sku,
          name:
            normalizeText(row['Tên phiên bản sản phẩm']) ||
            buildVariantName(attributesForVariant),
          sizeLabel: resolveSizeLabel(attributesForVariant),
          sizeGender: resolveSizeGender(group),
          colorName: resolveColorName(attributesForVariant),
          price: parseMoney(row['PL_Giá bán lẻ']),
          salePrice: null,
          isActive: true,
          sortOrder: index,
        });

        for (const attribute of attributesForVariant) {
          const optionValueId = optionValueIds.get(optionKey(attribute.name, attribute.value));
          if (optionValueId) {
            variantOptionValues.push({ variantId, optionValueId });
          }
        }

        buildInventoryRows(productId, variantId, row, inventories, inventoryLogs);
      }
    } else {
      buildInventoryRows(productId, null, firstRow, inventories, inventoryLogs);
    }

    const sourcePath = `/san-pham/${slug}/`;
    const targetPath = `/san-pham/${slug}`;
    seoMetadata.push({
      id: randomUUID(),
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      metaTitle: name,
      canonicalUrl: targetPath,
      ogTitle: name,
      ogImageMediaId: thumbnailMediaId,
      schemaType: 'Product',
      schemaJson: { source: 'sapo_xlsx' },
    });
    redirects.push({
      id: randomUUID(),
      sourcePath,
      targetPath,
      statusCode: 301,
    });
    urlMappings.push({
      id: randomUUID(),
      oldUrl: sourcePath,
      newUrl: targetPath,
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      source: 'sapo_xlsx',
      notes: name,
    });
    sitemapEntries.push({
      id: randomUUID(),
      url: targetPath,
      entityType: SeoEntityType.PRODUCT,
      entityId: productId,
      priority: 0.8,
      changefreq: 'weekly',
      isActive: true,
    });
    migrationRecords.push({
      id: randomUUID(),
      batchId,
      entityType: MigrationEntityType.PRODUCT,
      sourceId: productSourceId(group),
      targetId: productId,
      sourceUrl: `sapo:${productSourceId(group)}`,
      status: MigrationStatus.SUCCESS,
      payload: {
        productName: name,
        rows: rows.length,
        firstSku: normalizeText(firstRow['Mã SKU*']),
      },
    });
  }

  await createManyInChunks(prisma.category, Array.from(categories.values()));
  await createManyInChunks(prisma.tag, Array.from(tags.values()));
  await createManyInChunks(prisma.brand, Array.from(brands.values()));
  await createManyInChunks(prisma.media, Array.from(media.values()));
  await createManyInChunks(prisma.productAttribute, Array.from(attributes.values()));
  await createManyInChunks(
    prisma.productAttributeTerm,
    Array.from(attributeTerms.values()),
  );
  await createManyInChunks(prisma.product, products);
  await createManyInChunks(prisma.productCategory, productCategories);
  await createManyInChunks(prisma.productTag, productTags);
  await createManyInChunks(prisma.productBrand, productBrands);
  await createManyInChunks(prisma.productImage, productImages);
  await createManyInChunks(prisma.productShippingProfile, shippingProfiles);
  await createManyInChunks(prisma.productOptionGroup, optionGroups);
  await createManyInChunks(prisma.productOptionValue, optionValues);
  await createManyInChunks(prisma.productVariant, variants);
  await createManyInChunks(prisma.productVariantOptionValue, variantOptionValues);
  await createManyInChunks(prisma.inventory, inventories);
  await createManyInChunks(prisma.inventoryLog, inventoryLogs);
  await createManyInChunks(prisma.seoMetadata, seoMetadata);
  await createManyInChunks(prisma.redirect, redirects);
  await createManyInChunks(prisma.urlMapping, urlMappings);
  await createManyInChunks(prisma.sitemapEntry, sitemapEntries);
  await createManyInChunks(prisma.migrationRecord, migrationRecords);

  stats.products = products.length;
  stats.variants = variants.length;
  stats.categories = categories.size;
  stats.tags = tags.size;
  stats.brands = brands.size;
  stats.media = media.size;
  stats.attributes = attributes.size;
  stats.attributeTerms = attributeTerms.size;
  stats.optionGroups = optionGroups.length;
  stats.optionValues = optionValues.length;
  stats.inventories = inventories.length;
  stats.redirects = redirects.length;
  stats.sitemapEntries = sitemapEntries.length;
}

async function createManyInChunks(
  model: { createMany: (args: { data: any[]; skipDuplicates: boolean }) => Promise<unknown> },
  data: any[],
  chunkSize = 1000,
) {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    await model.createMany({
      data: data.slice(offset, offset + chunkSize),
      skipDuplicates: true,
    });
  }
}

function ensureCategory(
  name: string,
  categories: Map<string, Prisma.CategoryCreateManyInput>,
) {
  const slug = slugify(name);
  const existing = categories.get(slug);

  if (existing?.id) {
    return existing.id;
  }

  const id = randomUUID();
  categories.set(slug, {
    id,
    name,
    slug,
    status: CategoryStatus.ACTIVE,
  });
  return id;
}

function ensureTag(name: string, tags: Map<string, Prisma.TagCreateManyInput>) {
  const slug = slugify(name);
  const existing = tags.get(slug);

  if (existing?.id) {
    return existing.id;
  }

  const id = randomUUID();
  tags.set(slug, {
    id,
    name,
    slug,
    type: TagType.PRODUCT,
  });
  return id;
}

function ensureBrand(name: string, brands: Map<string, Prisma.BrandCreateManyInput>) {
  const slug = slugify(name);
  const existing = brands.get(slug);

  if (existing?.id) {
    return existing.id;
  }

  const id = randomUUID();
  brands.set(slug, {
    id,
    name,
    slug,
  });
  return id;
}

function ensureMedia(url: string, media: Map<string, Prisma.MediaCreateManyInput>) {
  const existing = media.get(url);

  if (existing?.id) {
    return existing.id;
  }

  const id = randomUUID();
  const fileName = fileNameFromUrl(url);
  media.set(url, {
    id,
    provider: MediaProvider.EXTERNAL,
    providerKey: url,
    url,
    secureUrl: url,
    fileName,
    originalName: fileName,
    mimeType: mimeTypeFromUrl(url),
    folder: 'sapo/products',
    title: fileName,
    metadata: { source: 'sapo_xlsx' },
  });
  return id;
}

function buildBulkProductOptions(
  productId: string,
  group: ProductGroup,
  rows: ExcelRow[],
  attributes: Map<string, Prisma.ProductAttributeCreateManyInput>,
  attributeTerms: Map<string, Prisma.ProductAttributeTermCreateManyInput>,
  optionGroups: Prisma.ProductOptionGroupCreateManyInput[],
  optionValues: Prisma.ProductOptionValueCreateManyInput[],
) {
  const optionValueIds = new Map<string, string>();

  for (const [groupIndex, name] of group.attributeNames.entries()) {
    if (!name) {
      continue;
    }

    const attributeId = ensureAttribute(name, attributes);
    const optionGroupId = randomUUID();
    optionGroups.push({
      id: optionGroupId,
      productId,
      name,
      type: resolveOptionType(name),
      sortOrder: groupIndex,
    });

    const values = unique(
      rows
        .map((row) => normalizeText(row[`Giá trị thuộc tính ${groupIndex + 1}`]))
        .filter(Boolean),
    );

    for (const [valueIndex, value] of values.entries()) {
      const optionValueId = randomUUID();
      optionValues.push({
        id: optionValueId,
        groupId: optionGroupId,
        value,
        label: value,
        sortOrder: valueIndex,
      });
      optionValueIds.set(optionKey(name, value), optionValueId);
      ensureAttributeTerm(attributeId, value, valueIndex, attributeTerms);
    }
  }

  return optionValueIds;
}

function ensureAttribute(
  name: string,
  attributes: Map<string, Prisma.ProductAttributeCreateManyInput>,
) {
  const slug = slugify(name);
  const existing = attributes.get(slug);

  if (existing?.id) {
    return existing.id;
  }

  const id = randomUUID();
  attributes.set(slug, {
    id,
    name,
    slug,
    type: resolveOptionType(name),
  });
  return id;
}

function ensureAttributeTerm(
  attributeId: string,
  value: string,
  sortOrder: number,
  attributeTerms: Map<string, Prisma.ProductAttributeTermCreateManyInput>,
) {
  const slug = slugify(value);
  const key = `${attributeId}:${slug}`;

  if (attributeTerms.has(key)) {
    return;
  }

  attributeTerms.set(key, {
    id: randomUUID(),
    attributeId,
    name: value,
    slug,
    value,
    sortOrder,
  });
}

function buildInventoryRows(
  productId: string,
  variantId: string | null,
  row: ExcelRow,
  inventories: Prisma.InventoryCreateManyInput[],
  inventoryLogs: Prisma.InventoryLogCreateManyInput[],
) {
  const quantity = parseInteger(row['LC_DK01_Tồn kho ban đầu*']) ?? 0;
  const inventoryId = randomUUID();
  inventories.push({
    id: inventoryId,
    productId: variantId ? null : productId,
    variantId,
    quantity,
    lowStockThreshold: parseInteger(row['LC_DK01_Tồn tối thiểu']) ?? 3,
    soldOut: quantity <= 0,
  });
  inventoryLogs.push({
    id: randomUUID(),
    inventoryId,
    productId,
    variantId,
    changeType: InventoryChangeType.IMPORT,
    quantityBefore: 0,
    quantityChange: quantity,
    quantityAfter: quantity,
    note: 'Imported from Sapo XLSX',
  });
}

function uniqueLocalSlug(
  name: string,
  firstSku: string,
  productSlugCounts: Map<string, number>,
) {
  const base = slugify(name);
  const nextCount = (productSlugCounts.get(base) ?? 0) + 1;
  productSlugCounts.set(base, nextCount);

  if (nextCount === 1) {
    return base;
  }

  return `${base}-${slugify(firstSku) || nextCount}`;
}

async function prepareUniqueProductSlug(name: string, firstSku: string) {
  const base = slugify(name);
  const existing = await prisma.product.findUnique({
    where: { slug: base },
    select: { id: true, additionalInfo: true },
  });

  if (!existing) {
    return base;
  }

  const info = existing.additionalInfo as { sourceId?: string } | null;
  const sourceId = normalizeText(firstSku);

  if (info?.sourceId === sourceId) {
    return base;
  }

  return `${base}-${slugify(sourceId || Date.now().toString())}`;
}

async function prepareUniqueCategorySlug(name: string) {
  return slugify(name);
}

async function prepareUniqueTagSlug(name: string) {
  return slugify(name);
}

async function prepareUniqueBrandSlug(name: string) {
  return slugify(name);
}

function parseWorkbook(path: string): ExcelRow[] {
  const zip = readZip(readFileSync(path));
  const sheet = readZipText(zip, 'xl/worksheets/sheet1.xml');
  const sharedStrings = parseSharedStrings(readZipText(zip, 'xl/sharedStrings.xml'));

  if (!sheet) {
    throw new Error('Workbook sheet xl/worksheets/sheet1.xml not found');
  }

  const rows = parseSheetRows(sheet, sharedStrings);
  const [headers, ...records] = rows;

  if (!headers?.length) {
    throw new Error('Workbook has no header row');
  }

  return records
    .map((record) =>
      Object.fromEntries(
        headers.map((header, index) => [normalizeText(header), record[index] ?? '']),
      ),
    )
    .filter((row) => Object.values(row).some((value) => normalizeText(value)));
}

function parseSheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*?>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowXml = rowMatch[1];
    const values: string[] = [];
    const cellRegex = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const attributes = cellMatch[1] ?? cellMatch[2] ?? '';
      const body = cellMatch[3] ?? '';
      const ref = getXmlAttribute(attributes, 'r');
      const column = columnIndex(ref);
      values[column - 1] = cellValue(attributes, body, sharedStrings);
    }

    rows.push(values.map((value) => value ?? ''));
  }

  return rows;
}

function parseSharedStrings(xml: string | null) {
  if (!xml) {
    return [];
  }

  const strings: string[] = [];
  const stringRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;

  while ((match = stringRegex.exec(xml)) !== null) {
    strings.push(extractText(match[1]));
  }

  return strings;
}

function cellValue(attributes: string, body: string, sharedStrings: string[]) {
  const type = getXmlAttribute(attributes, 't');

  if (type === 'inlineStr') {
    return extractText(body);
  }

  const value = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';

  if (type === 's') {
    return sharedStrings[Number(value)] ?? '';
  }

  return decodeXml(value);
}

function extractText(xml: string) {
  const parts: string[] = [];
  const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(xml)) !== null) {
    parts.push(decodeXml(match[1]));
  }

  return parts.join('');
}

function readZip(buffer: Buffer) {
  const entries = new Map<string, ZipEntry>();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid XLSX central directory');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8');

    entries.set(fileName, {
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return { buffer, entries };
}

function readZipText(
  zip: { buffer: Buffer; entries: Map<string, ZipEntry> },
  name: string,
) {
  const entry = zip.entries.get(name);

  if (!entry) {
    return null;
  }

  const localOffset = entry.localHeaderOffset;

  if (zip.buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid XLSX local header for ${name}`);
  }

  const fileNameLength = zip.buffer.readUInt16LE(localOffset + 26);
  const extraLength = zip.buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = zip.buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );
  const data =
    entry.compressionMethod === 0
      ? compressed
      : entry.compressionMethod === 8
        ? inflateRawSync(compressed)
        : null;

  if (!data) {
    throw new Error(`Unsupported XLSX compression method ${entry.compressionMethod}`);
  }

  return data.toString('utf8');
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Invalid XLSX file: end of central directory not found');
}

function groupProducts(rows: ExcelRow[]) {
  const groups: ProductGroup[] = [];
  let current: ProductGroup | null = null;

  for (const row of rows) {
    const name = normalizeText(row['Tên sản phẩm*']);

    if (name) {
      current = {
        index: groups.length + 1,
        base: row,
        rows: [],
        attributeNames: [
          normalizeText(row['Thuộc tính 1']),
          normalizeText(row['Thuộc tính 2']),
          normalizeText(row['Thuộc tính 3']),
        ],
      };
      groups.push(current);
    }

    if (!current) {
      continue;
    }

    current.rows.push(row);
  }

  return groups;
}

function getVariantAttributes(group: ProductGroup, row: ExcelRow) {
  const attributes: ProductAttributeValue[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const name =
      normalizeText(row[`Thuộc tính ${index}`]) ||
      group.attributeNames[index - 1] ||
      '';
    const value = normalizeText(row[`Giá trị thuộc tính ${index}`]);

    if (name && value) {
      attributes.push({ name, value });
    }
  }

  return attributes;
}

function buildProductMetadata(group: ProductGroup, originalPrice: number) {
  const firstRow = group.rows[0] ?? group.base;

  return {
    source: 'sapo_xlsx',
    sourceId: normalizeText(firstRow['Mã SKU*']),
    sourceProductIndex: group.index,
    managementType: normalizeText(group.base['Hình thức quản lý sản phẩm']) || null,
    productTypeName: normalizeText(group.base['Loại sản phẩm']) || null,
    warrantyEnabled: normalizeText(firstRow['Áp dụng bảo hành']) || null,
    warrantyPolicy: normalizeText(firstRow['Chính sách bảo hành']) || null,
    taxEnabled: normalizeText(firstRow['Áp dụng thuế']) || null,
    taxPriceMode: normalizeText(firstRow['Giá áp dụng thuế']) || null,
    inputTaxPercent: parseNumber(firstRow['Thuế đầu vào (%)']),
    outputTaxPercent: parseNumber(firstRow['Thuế đầu ra (%)']),
    currency: normalizeText(firstRow['Đơn vị']) || 'VNĐ',
    originalPrice,
    rawAttributeNames: group.attributeNames,
  } satisfies Prisma.InputJsonValue;
}

function buildVariantName(attributes: ProductAttributeValue[]) {
  return attributes.map((attribute) => attribute.value).filter(Boolean).join(' - ');
}

function productName(group: ProductGroup) {
  return normalizeText(group.base['Tên sản phẩm*']);
}

function productSourceId(group: ProductGroup) {
  return normalizeText(group.rows[0]?.['Mã SKU*']) || `row-${group.index}`;
}

function optionKey(name: string, value: string) {
  return `${name}\u0000${value}`;
}

function resolveOptionType(name: string) {
  if (isSizeAttribute(name)) {
    return ProductOptionType.SIZE;
  }

  if (isColorAttribute(name)) {
    return ProductOptionType.COLOR;
  }

  return ProductOptionType.OTHER;
}

function resolveSizeLabel(attributes: ProductAttributeValue[]) {
  return attributes.find((attribute) => isSizeAttribute(attribute.name))?.value ?? null;
}

function resolveColorName(attributes: ProductAttributeValue[]) {
  return attributes.find((attribute) => isColorAttribute(attribute.name))?.value ?? null;
}

function resolveSizeGender(group: ProductGroup) {
  const text = `${productName(group)} ${group.base['Loại sản phẩm']}`.toLowerCase();

  if (text.includes('nữ')) {
    return SizeGender.WOMEN;
  }

  if (text.includes('nam')) {
    return SizeGender.MEN;
  }

  return SizeGender.UNISEX;
}

function isSizeAttribute(name: string) {
  const text = name.toLowerCase();
  return text.includes('size') || text.includes('kích thước');
}

function isColorAttribute(name: string) {
  const text = name.toLowerCase();
  return text.includes('color') || text.includes('màu');
}

function splitList(value?: string) {
  return unique(
    normalizeText(value)
      .split(/[;,]/)
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );
}

function parseMoney(value?: string) {
  const number = parseNumber(value);
  return number === null ? null : Math.round(number);
}

function parseInteger(value?: string) {
  const number = parseNumber(value);
  return number === null ? null : Math.round(number);
}

function parseNumber(value?: string) {
  const normalized = normalizeText(value).replace(/,/g, '.').replace(/[^\d.-]/g, '');
  const number = Number(normalized);

  return Number.isFinite(number) && normalized ? number : null;
}

function normalizeText(value?: string | null) {
  return (value ?? '').replace(/\uFEFF/g, '').trim();
}

function slugify(value: string) {
  const slug = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  return slug || `item-${Date.now()}`;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? '';
  let value = 0;

  for (const char of letters) {
    value = value * 26 + char.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  }

  return value;
}

function getXmlAttribute(attributes: string, name: string) {
  return (
    attributes.match(new RegExp(`${name}="([^"]*)"`, 'u'))?.[1] ??
    attributes.match(new RegExp(`${name}='([^']*)'`, 'u'))?.[1] ??
    ''
  );
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
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

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [keyFn(item), item])).values());
}

function createEmptyStats(rows: number): ImportStats {
  return {
    rows,
    products: 0,
    variants: 0,
    categories: 0,
    tags: 0,
    brands: 0,
    media: 0,
    attributes: 0,
    attributeTerms: 0,
    optionGroups: 0,
    optionValues: 0,
    inventories: 0,
    redirects: 0,
    sitemapEntries: 0,
    skipped: 0,
  };
}

function printSummary(path: string, rows: ExcelRow[], groups: ProductGroup[]) {
  const skus = rows.map((row) => normalizeText(row['Mã SKU*'])).filter(Boolean);
  const duplicateSkus = findDuplicates(skus);
  const categories = unique(
    groups.map((group) => normalizeText(group.base['Loại sản phẩm'])).filter(Boolean),
  );
  const brands = unique(
    groups.map((group) => normalizeText(group.base['Nhãn hiệu'])).filter(Boolean),
  );
  const imageCount = unique(
    rows.map((row) => normalizeText(row['Ảnh đại diện'])).filter(Boolean),
  ).length;

  console.log(`File: ${path}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Products: ${groups.length}`);
  console.log(`SKU rows: ${skus.length}`);
  console.log(`Duplicate SKUs: ${duplicateSkus.length}`);
  console.log(`Categories: ${categories.length}`);
  console.log(`Brands: ${brands.length}`);
  console.log(`Unique images: ${imageCount}`);

  if (duplicateSkus.length) {
    console.log(`Duplicate SKU sample: ${duplicateSkus.slice(0, 10).join(', ')}`);
  }
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return Array.from(duplicates);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
