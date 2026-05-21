import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ContentStatus,
  MediaProvider,
  MigrationEntityType,
  MigrationStatus,
  Prisma,
  PrismaClient,
  RedirectStatus,
  SeoEntityType,
  TagType,
} from '../generated/prisma/client';
import { slugify } from '../src/common/utils/slug.util';

type WpCategoryRef = {
  domain?: string;
  nicename?: string;
  text?: string;
};

type WpMeta = {
  meta_key?: string;
  meta_value?: string;
};

type WpItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  guid?: string;
  description?: string;
  encoded?: string;
  excerpt?: string;
  post_id?: string | number;
  post_date?: string;
  post_date_gmt?: string;
  post_modified?: string;
  post_modified_gmt?: string;
  post_name?: string;
  status?: string;
  post_parent?: string | number;
  post_type?: string;
  attachment_url?: string;
  category?: WpCategoryRef | WpCategoryRef[];
  postmeta?: WpMeta | WpMeta[];
};

type WpAttachment = {
  id: string;
  url: string;
  title: string;
  fileName: string;
  mimeType: string;
};

type ImportStats = {
  items: number;
  postsSeen: number;
  postsImported: number;
  categories: number;
  tags: number;
  media: number;
  seo: number;
  redirects: number;
  urlMappings: number;
  skipped: number;
};

const args = process.argv.slice(2);
const xmlPath =
  args.find((arg) => !arg.startsWith('--')) ??
  'dukystore.WordPress.2026-05-21.xml';
const dryRun = args.includes('--dry-run');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const xml = readFileSync(xmlPath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    textNodeName: 'text',
    trimValues: false,
    parseTagValue: false,
  });
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  const items = asArray<WpItem>(channel?.item);
  const attachmentsById = buildAttachmentIndex(items);
  const stats: ImportStats = {
    items: items.length,
    postsSeen: 0,
    postsImported: 0,
    categories: 0,
    tags: 0,
    media: 0,
    seo: 0,
    redirects: 0,
    urlMappings: 0,
    skipped: 0,
  };

  const postItems = items.filter((item) => item.post_type === 'post');
  stats.postsSeen = postItems.length;

  if (dryRun) {
    console.log('WordPress post import dry run');
    console.table({
      file: xmlPath,
      items: items.length,
      posts: postItems.length,
      attachments: attachmentsById.size,
    });
    return;
  }

  const batch = await prisma.migrationBatch.create({
    data: {
      name: `wordpress-posts-${basename(xmlPath)}-${Date.now()}`,
      source: 'wordpress_wxr',
      status: MigrationStatus.RUNNING,
      startedAt: new Date(),
      summary: {
        file: xmlPath,
        items: items.length,
        posts: postItems.length,
        attachments: attachmentsById.size,
      },
    },
  });

  try {
    for (const item of postItems) {
      const postId = await importPost(item, attachmentsById, stats);
      await writeMigrationRecord(batch.id, MigrationEntityType.BLOG_POST, item, {
        status: postId ? MigrationStatus.SUCCESS : MigrationStatus.SKIPPED,
        targetId: postId ?? undefined,
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

    console.log('WordPress post import completed');
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

async function importPost(
  item: WpItem,
  attachmentsById: Map<string, WpAttachment>,
  stats: ImportStats,
) {
  const title = normalizeText(item.title);
  const sourceId = String(item.post_id ?? '').trim();
  const wpStatus = normalizeText(item.status);

  if (!title || wpStatus === 'trash' || wpStatus === 'auto-draft') {
    stats.skipped += 1;
    return;
  }

  const slug = await prepareUniqueSlug(
    normalizeText(item.post_name) || title,
    sourceId,
  );
  const publishedAt = parseWpDate(item.post_date_gmt) ?? parseHttpDate(item.pubDate);
  const modifiedAt = parseWpDate(item.post_modified_gmt);
  const content = normalizeHtml(item.encoded);
  const excerpt = normalizeText(item.excerpt) || buildExcerpt(content);
  const coverMedia = await resolveCoverMedia(item, attachmentsById, stats);
  const categoryIds = await upsertBlogCategories(item, stats);
  const tagIds = await upsertTags(item, stats);
  const status = mapPostStatus(wpStatus);
  const post = await prisma.blogPost.upsert({
    where: { slug },
    create: {
      title,
      slug,
      excerpt,
      content,
      coverMediaId: coverMedia?.id ?? null,
      status,
      publishedAt: status === ContentStatus.PUBLISHED ? publishedAt : null,
      createdAt: publishedAt ?? undefined,
      updatedAt: modifiedAt ?? undefined,
    },
    update: {
      title,
      excerpt,
      content,
      coverMediaId: coverMedia?.id ?? null,
      status,
      publishedAt: status === ContentStatus.PUBLISHED ? publishedAt : null,
      updatedAt: modifiedAt ?? undefined,
      deletedAt: null,
    },
  });

  await replacePostRelations(post.id, categoryIds, tagIds);
  await upsertPostSeo(post.id, item, slug, coverMedia?.id ?? null, stats);
  await upsertUrlMappingAndRedirect(post.id, item.link, slug, stats);

  stats.postsImported += 1;
  return post.id;
}

function buildAttachmentIndex(items: WpItem[]) {
  const attachments = new Map<string, WpAttachment>();

  for (const item of items) {
    if (item.post_type !== 'attachment') continue;
    const id = String(item.post_id ?? '').trim();
    const url = normalizeText(item.attachment_url) || normalizeText(item.guid);
    if (!id || !url) continue;

    attachments.set(id, {
      id,
      url,
      title: normalizeText(item.title),
      fileName: fileNameFromUrl(url),
      mimeType: mimeTypeFromUrl(url),
    });
  }

  return attachments;
}

async function resolveCoverMedia(
  item: WpItem,
  attachmentsById: Map<string, WpAttachment>,
  stats: ImportStats,
) {
  const thumbnailId = findMeta(item, '_thumbnail_id');
  const attachment = thumbnailId ? attachmentsById.get(thumbnailId) : undefined;
  const imageUrl = attachment?.url ?? findFirstImageUrl(item.encoded);

  if (!imageUrl) return null;

  return upsertExternalMedia(
    imageUrl,
    attachment?.title || normalizeText(item.title),
    stats,
  );
}

async function upsertBlogCategories(item: WpItem, stats: ImportStats) {
  const categories = categoryRefs(item).filter((category) => category.domain === 'category');
  const ids: string[] = [];

  for (const category of categories) {
    const name = normalizeText(category.text);
    const slug = slugify(normalizeText(category.nicename) || name);
    if (!name || !slug) continue;

    const created = await prisma.blogCategory.upsert({
      where: { slug },
      create: { name, slug, status: ContentStatus.PUBLISHED },
      update: { name, status: ContentStatus.PUBLISHED, deletedAt: null },
    });
    ids.push(created.id);
    stats.categories += 1;
  }

  return unique(ids);
}

async function upsertTags(item: WpItem, stats: ImportStats) {
  const tags = categoryRefs(item).filter((category) => category.domain === 'post_tag');
  const ids: string[] = [];

  for (const tag of tags) {
    const name = normalizeText(tag.text);
    const slug = slugify(normalizeText(tag.nicename) || name);
    if (!name || !slug) continue;

    const existing = await prisma.tag.findUnique({ where: { slug } });
    const created = existing
      ? await prisma.tag.update({
          where: { slug },
          data: {
            name,
            type: existing.type === TagType.PRODUCT ? TagType.BOTH : existing.type,
            deletedAt: null,
          },
        })
      : await prisma.tag.create({
          data: { name, slug, type: TagType.BLOG },
        });
    ids.push(created.id);
    stats.tags += 1;
  }

  return unique(ids);
}

async function upsertExternalMedia(
  url: string,
  title: string,
  stats: ImportStats,
) {
  const existing = await prisma.media.findFirst({
    where: { url, deletedAt: null },
  });

  if (existing) return existing;

  const media = await prisma.media.create({
    data: {
      provider: MediaProvider.EXTERNAL,
      providerKey: url,
      url,
      secureUrl: url,
      fileName: fileNameFromUrl(url),
      originalName: fileNameFromUrl(url),
      mimeType: mimeTypeFromUrl(url),
      folder: 'wordpress/blog',
      altText: title || null,
      title: title || null,
      metadata: { source: 'wordpress_wxr' },
    },
  });

  stats.media += 1;
  return media;
}

async function replacePostRelations(
  postId: string,
  categoryIds: string[],
  tagIds: string[],
) {
  await prisma.$transaction([
    prisma.blogPostCategory.deleteMany({ where: { postId } }),
    prisma.blogPostTag.deleteMany({ where: { postId } }),
    ...(categoryIds.length
      ? [
          prisma.blogPostCategory.createMany({
            data: categoryIds.map((categoryId) => ({ postId, categoryId })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...(tagIds.length
      ? [
          prisma.blogPostTag.createMany({
            data: tagIds.map((tagId) => ({ postId, tagId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

async function upsertPostSeo(
  postId: string,
  item: WpItem,
  slug: string,
  coverMediaId: string | null,
  stats: ImportStats,
) {
  const title = findMeta(item, '_yoast_wpseo_title') || normalizeText(item.title);
  const description =
    findMeta(item, '_yoast_wpseo_metadesc') ||
    normalizeText(item.excerpt) ||
    buildExcerpt(item.encoded);
  const focusKeyword = findMeta(item, '_yoast_wpseo_focuskw');
  const canonicalUrl = `/blog/${slug}`;

  await prisma.seoMetadata.upsert({
    where: {
      entityType_entityId: {
        entityType: SeoEntityType.BLOG_POST,
        entityId: postId,
      },
    },
    create: {
      entityType: SeoEntityType.BLOG_POST,
      entityId: postId,
      metaTitle: title || null,
      metaDescription: description || null,
      canonicalUrl,
      ogTitle: title || null,
      ogDescription: description || null,
      ogImageMediaId: coverMediaId,
      twitterTitle: title || null,
      twitterDescription: description || null,
      focusKeyword: focusKeyword || null,
      schemaType: 'BlogPosting',
    },
    update: {
      metaTitle: title || null,
      metaDescription: description || null,
      canonicalUrl,
      ogTitle: title || null,
      ogDescription: description || null,
      ogImageMediaId: coverMediaId,
      twitterTitle: title || null,
      twitterDescription: description || null,
      focusKeyword: focusKeyword || null,
      schemaType: 'BlogPosting',
    },
  });

  stats.seo += 1;
}

async function upsertUrlMappingAndRedirect(
  postId: string,
  oldUrl: string | undefined,
  slug: string,
  stats: ImportStats,
) {
  const sourcePath = pathFromUrl(oldUrl);
  const targetPath = `/blog/${slug}`;
  if (!sourcePath) return;

  await prisma.urlMapping.upsert({
    where: { oldUrl: sourcePath },
    create: {
      entityType: SeoEntityType.BLOG_POST,
      entityId: postId,
      oldUrl: sourcePath,
      newUrl: targetPath,
      source: 'wordpress_wxr',
    },
    update: {
      entityId: postId,
      newUrl: targetPath,
      source: 'wordpress_wxr',
    },
  });
  stats.urlMappings += 1;

  if (sourcePath !== targetPath) {
    await prisma.redirect.upsert({
      where: { sourcePath },
      create: {
        sourcePath,
        targetPath,
        statusCode: 301,
        status: RedirectStatus.ACTIVE,
      },
      update: {
        targetPath,
        statusCode: 301,
        status: RedirectStatus.ACTIVE,
      },
    });
    stats.redirects += 1;
  }
}

async function writeMigrationRecord(
  batchId: string,
  entityType: MigrationEntityType,
  item: WpItem,
  result: {
    status: MigrationStatus;
    targetId?: string;
    errorMessage?: string;
  },
) {
  const sourceId = String(item.post_id ?? item.link ?? '').trim();
  if (!sourceId) return;

  await prisma.migrationRecord.upsert({
    where: {
      batchId_entityType_sourceId: {
        batchId,
        entityType,
        sourceId,
      },
    },
    create: {
      batchId,
      entityType,
      sourceId,
      targetId: result.targetId,
      sourceUrl: item.link,
      targetUrl: result.targetId ? `/blog/${normalizeText(item.post_name)}` : undefined,
      status: result.status,
      payload: {
        title: normalizeText(item.title),
        slug: normalizeText(item.post_name),
        status: normalizeText(item.status),
      },
      errorMessage: result.errorMessage,
    },
    update: {
      targetId: result.targetId,
      sourceUrl: item.link,
      status: result.status,
      errorMessage: result.errorMessage,
    },
  });
}

async function prepareUniqueSlug(value: string, sourceId: string) {
  const base = slugify(value) || (sourceId ? `wp-post-${sourceId}` : 'wp-post');
  return base;
}

function categoryRefs(item: WpItem) {
  return asArray<WpCategoryRef>(item.category).map((category) => ({
    ...category,
    text: normalizeText(category.text),
    domain: normalizeText(category.domain),
    nicename: normalizeText(category.nicename),
  }));
}

function findMeta(item: WpItem, key: string) {
  return normalizeText(
    asArray<WpMeta>(item.postmeta).find((meta) => normalizeText(meta.meta_key) === key)
      ?.meta_value,
  );
}

function findFirstImageUrl(html?: string) {
  const match = normalizeHtml(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function buildExcerpt(html?: string) {
  const text = normalizeText(stripHtml(html));
  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text || null;
}

function stripHtml(html?: string) {
  return normalizeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeHtml(value?: string) {
  return String(value ?? '').trim();
}

function normalizeText(value?: string | number | null) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWpDate(value?: string) {
  const text = normalizeText(value);
  if (!text || text === '0000-00-00 00:00:00') return null;

  const date = new Date(`${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseHttpDate(value?: string) {
  const text = normalizeText(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapPostStatus(status: string) {
  if (status === 'publish') return ContentStatus.PUBLISHED;
  if (status === 'private') return ContentStatus.HIDDEN;
  return ContentStatus.DRAFT;
}

function fileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? 'wordpress-media');
  } catch {
    return url.split('/').filter(Boolean).pop() ?? 'wordpress-media';
  }
}

function mimeTypeFromUrl(url: string) {
  const fileName = fileNameFromUrl(url).toLowerCase();
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.webp')) return 'image/webp';
  if (fileName.endsWith('.gif')) return 'image/gif';
  if (fileName.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function pathFromUrl(value?: string) {
  const text = normalizeText(value);
  if (!text) return null;

  try {
    const parsed = new URL(text);
    return parsed.pathname.replace(/\/$/, '') || '/';
  } catch {
    return text.startsWith('/') ? text.replace(/\/$/, '') || '/' : null;
  }
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
