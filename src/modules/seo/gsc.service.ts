import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { XMLParser } from 'fast-xml-parser';
import { google, searchconsole_v1 } from 'googleapis';
import {
  CategoryStatus,
  ContentStatus,
  ProductStatus,
  RedirectStatus,
  SeoEntityType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AnalyzeGscUrlsDto,
  GetGscCandidatesQueryDto,
  GscUrlInputDto,
  InspectGscUrlsDto,
  SubmitIndexingDto,
} from './dto/gsc-url.dto';

type IndexedEntity = {
  id: string;
  path: string;
  slug: string;
  title: string;
  type: 'PRODUCT' | 'BLOG_POST' | 'CATEGORY';
  hasMetaDescription: boolean;
  noIndex: boolean;
  canonicalUrl?: string | null;
};

type UrlIssue = {
  key: string;
  label: string;
  severity: 'ok' | 'info' | 'warning' | 'error';
  action: string;
};

type RedirectRecord = {
  id: string;
  sourcePath: string;
  targetPath: string;
  statusCode: number;
  status: RedirectStatus;
};

type UrlMappingRecord = {
  entityId?: string | null;
  entityType: SeoEntityType;
  newUrl: string;
  oldUrl: string;
  source?: string | null;
};

type GscCandidateSource =
  | 'entity'
  | 'legacy_product_path'
  | 'live_sitemap'
  | 'redirect_source'
  | 'redirect_target'
  | 'sitemap_entry'
  | 'static_route'
  | 'url_mapping_new'
  | 'url_mapping_old';

type GscCandidateUrl = {
  entityId?: string | null;
  entityTitle?: string | null;
  entityType?: IndexedEntity['type'] | 'UNKNOWN' | null;
  path: string;
  reason?: string;
  redirectId?: string | null;
  sourceLabels: string[];
  sources: GscCandidateSource[];
  targetPath?: string | null;
  url: string;
};

type GscServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  type?: string;
  [key: string]: unknown;
};

type GscCredentialResolution = {
  credentials?: GscServiceAccountCredentials;
  error?: string;
  serviceAccountEmail?: string;
  source?: 'env_json_base64' | 'env_json' | 'env_fields';
};

const DEFAULT_SITE_URL = 'https://dukystore.com/';
const DEFAULT_CANDIDATE_LIMIT = 2500;
const DEFAULT_STATIC_CANDIDATE_PATHS = [
  '/',
  '/products',
  '/blog',
  '/collections/boot-nam',
  '/collections/boot-nu',
  '/collections/phu-kien',
  '/collections/outfit',
];

@Injectable()
export class GscService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getOverview() {
    const baseline = await this.buildBaseline();
    const googleStatus = this.getGoogleConnectionStatus();
    const rootRedirects = baseline.redirects.filter(
      (redirect) => redirect.sourcePath === '/',
    );
    const productRedirectMissingTargets = this.findMissingRedirectTargets(
      baseline.redirects,
      'PRODUCT',
      baseline.entityByPath,
    );
    const blogRedirectMissingTargets = this.findMissingRedirectTargets(
      baseline.redirects,
      'BLOG_POST',
      baseline.entityByPath,
    );
    const selfRedirects = baseline.redirects.filter(
      (redirect) =>
        this.normalizePath(redirect.sourcePath) ===
        this.normalizePath(redirect.targetPath),
    );
    const productsMissingMeta = Array.from(
      baseline.entityByPath.values(),
    ).filter(
      (entity) => entity.type === 'PRODUCT' && !entity.hasMetaDescription,
    );
    const noIndexEntities = Array.from(baseline.entityByPath.values()).filter(
      (entity) => entity.noIndex,
    );

    return {
      generatedAt: new Date().toISOString(),
      google: this.toPublicGoogleStatus(googleStatus),
      counts: {
        publishedProducts: baseline.counts.publishedProducts,
        publishedBlogPosts: baseline.counts.publishedBlogPosts,
        activeCategories: baseline.counts.activeCategories,
        expectedSitemapUrls: baseline.sitemapPaths.size,
        configuredSitemapEntries: baseline.counts.configuredSitemapEntries,
        activeRedirects: baseline.redirects.length,
        productsMissingMetaDescription: productsMissingMeta.length,
        noIndexEntities: noIndexEntities.length,
        relativeCanonicals: baseline.counts.relativeCanonicals,
        mediaMissingAltText: baseline.counts.mediaMissingAltText,
      },
      groups: [
        this.createGroup(
          'REDIRECT_TARGET_MISSING_PRODUCT',
          'Redirect sản phẩm trỏ tới URL chết',
          productRedirectMissingTargets.length,
          'error',
          'Sửa target sang sản phẩm/category còn sống hoặc disable redirect.',
        ),
        this.createGroup(
          'REDIRECT_TARGET_MISSING_BLOG',
          'Redirect blog trỏ tới URL chết',
          blogRedirectMissingTargets.length,
          'error',
          'Sửa target sang bài viết/category còn sống hoặc disable redirect.',
        ),
        this.createGroup(
          'ROOT_REDIRECT',
          'Homepage có redirect trong DB',
          rootRedirects.length,
          'error',
          'Disable redirect sourcePath="/".',
        ),
        this.createGroup(
          'SELF_REDIRECT',
          'Redirect tự trỏ về chính nó',
          selfRedirects.length,
          'error',
          'Đổi target hoặc disable redirect.',
        ),
        this.createGroup(
          'MISSING_PRODUCT_META',
          'Sản phẩm thiếu meta description',
          productsMissingMeta.length,
          'warning',
          'Bổ sung meta description cho sản phẩm ưu tiên.',
        ),
        this.createGroup(
          'NOINDEX_ENTITY',
          'Entity đang bật noIndex',
          noIndexEntities.length,
          'info',
          'Kiểm tra lại nếu đây là trang cần index.',
        ),
        this.createGroup(
          'RELATIVE_CANONICAL',
          'Canonical trong DB đang là URL tương đối',
          baseline.counts.relativeCanonicals,
          'warning',
          'Chuẩn hóa canonical thành absolute URL.',
        ),
        this.createGroup(
          'MEDIA_MISSING_ALT',
          'Media thiếu alt text',
          baseline.counts.mediaMissingAltText,
          'info',
          'Bổ sung alt cho ảnh product/gallery quan trọng.',
        ),
      ],
      samples: {
        productRedirectMissingTargets: productRedirectMissingTargets.slice(
          0,
          10,
        ),
        blogRedirectMissingTargets: blogRedirectMissingTargets.slice(0, 10),
        rootRedirects: rootRedirects.slice(0, 5),
      },
    };
  }

  async analyzeUrls(dto: AnalyzeGscUrlsDto) {
    try {
      const baseline = await this.buildBaseline();
      const uniqueRows = this.uniqueRows(dto.urls);
      const analyzed = uniqueRows.map((row) => this.analyzeUrl(row, baseline));

      return {
        generatedAt: new Date().toISOString(),
        total: analyzed.length,
        groups: this.groupAnalyzedUrls(analyzed),
        urls: analyzed,
      };
    } catch (error: any) {
      console.error('=== GSC ANALYZE URLS ERROR ===', error);
      try {
        const fs = require('fs');
        const pathLib = require('path');
        const logFile = pathLib.join('c:/Users/HT90/Desktop/ht90/job/Duky/Duky boot/Backend-Dukyboot', 'gsc-error.log');
        fs.writeFileSync(logFile, `${new Date().toISOString()}\n${error?.stack || error}\n\n`);
      } catch (err) {
        console.error('Failed to write log file', err);
      }
      throw error;
    }
  }

  async getCandidates(query: GetGscCandidatesQueryDto = {}) {
    try {
      const baseline = await this.buildBaseline();
      const warnings: string[] = [];
      const candidates = new Map<string, GscCandidateUrl>();
      const limit = query.limit ?? DEFAULT_CANDIDATE_LIMIT;
      const includeLiveSitemap =
        query.includeLiveSitemap ??
        this.parseBooleanEnv('GSC_AUTO_SCAN_INCLUDE_LIVE_SITEMAP', true);

      const addCandidate = (
        value: string,
        source: GscCandidateSource,
        label: string,
        reason?: string,
        extra?: Partial<GscCandidateUrl>,
      ) => {
        try {
          const url = this.toAbsoluteUrl(value);
          const path = this.toPath(url);
          const existing = candidates.get(url);

          if (existing) {
            if (!existing.sources.includes(source)) {
              existing.sources.push(source);
            }

            if (!existing.sourceLabels.includes(label)) {
              existing.sourceLabels.push(label);
            }

            existing.reason = existing.reason ?? reason;
            return;
          }

          candidates.set(url, {
            path,
            reason,
            sourceLabels: [label],
            sources: [source],
            url,
            ...extra,
          });
        } catch {
          warnings.push(`Skipped invalid ${label} URL: ${value}`);
        }
      };

      for (const path of this.getStaticCandidatePaths()) {
        addCandidate(
          path,
          'static_route',
          'Static route',
          'Auto scan: route public quan trọng trong storefront.',
        );
      }

      for (const entity of baseline.entityByPath.values()) {
        addCandidate(
          entity.path,
          'entity',
          'Public entity',
          'Auto scan: URL entity public từ DB.',
          {
            entityId: entity.id,
            entityTitle: entity.title,
            entityType: entity.type,
          },
        );

        if (entity.type === 'PRODUCT' && entity.path.startsWith('/san-pham/')) {
          addCandidate(
            entity.path.replace('/san-pham/', '/products/'),
            'legacy_product_path',
            'Legacy product URL',
            'Auto scan: URL sản phẩm cũ cần redirect về canonical /san-pham.',
            {
              entityId: entity.id,
              entityTitle: entity.title,
              entityType: entity.type,
              targetPath: entity.path,
            },
          );
        }
      }

      for (const path of baseline.sitemapPaths) {
        addCandidate(
          path,
          'sitemap_entry',
          'Backend sitemap',
          'Auto scan: URL có trong sitemap/backend SEO.',
        );
      }

      for (const redirect of baseline.redirects) {
        addCandidate(
          redirect.sourcePath,
          'redirect_source',
          'Redirect source',
          'Auto scan: URL đang là source redirect active.',
          {
            redirectId: redirect.id,
            targetPath: redirect.targetPath,
          },
        );
        addCandidate(
          redirect.targetPath,
          'redirect_target',
          'Redirect target',
          'Auto scan: URL đang là target redirect active.',
          {
            redirectId: redirect.id,
            targetPath: redirect.targetPath,
          },
        );
      }

      for (const mapping of baseline.urlMappings) {
        addCandidate(
          mapping.oldUrl,
          'url_mapping_old',
          'URL mapping old',
          'Auto scan: URL cũ từ bảng mapping migration.',
          {
            entityId: mapping.entityId,
            entityType: this.toCandidateEntityType(mapping.entityType),
            targetPath: this.normalizePath(mapping.newUrl),
          },
        );
        addCandidate(
          mapping.newUrl,
          'url_mapping_new',
          'URL mapping new',
          'Auto scan: URL mới từ bảng mapping migration.',
          {
            entityId: mapping.entityId,
            entityType: this.toCandidateEntityType(mapping.entityType),
          },
        );
      }

      if (includeLiveSitemap) {
        const liveSitemap = await this.getLiveSitemapUrls();
        warnings.push(...liveSitemap.warnings);

        for (const url of liveSitemap.urls) {
          addCandidate(
            url,
            'live_sitemap',
            'Live sitemap',
            'Auto scan: URL lấy từ sitemap.xml live.',
          );
        }
      }

      const allUrls = Array.from(candidates.values()).sort((a, b) => {
        const rankDiff = this.rankCandidate(b) - this.rankCandidate(a);

        if (rankDiff !== 0) {
          return rankDiff;
        }

        return a.path.localeCompare(b.path);
      });
      const limitedUrls = allUrls.slice(0, limit).map((candidate) => ({
        ...candidate,
        reason: candidate.reason ?? this.buildCandidateReason(candidate),
      }));

      return {
        generatedAt: new Date().toISOString(),
        includeLiveSitemap,
        limit,
        sources: this.summarizeCandidates(limitedUrls),
        total: limitedUrls.length,
        totalBeforeLimit: allUrls.length,
        urls: limitedUrls,
        warnings,
      };
    } catch (error: any) {
      console.error('=== GSC GET CANDIDATES ERROR ===', error);
      try {
        const fs = require('fs');
        const pathLib = require('path');
        const logFile = pathLib.join('c:/Users/HT90/Desktop/ht90/job/Duky/Duky boot/Backend-Dukyboot', 'gsc-error.log');
        fs.writeFileSync(logFile, `${new Date().toISOString()}\n[getCandidates]\n${error?.stack || error}\n\n`);
      } catch (err) {
        console.error('Failed to write log file', err);
      }
      throw error;
    }
  }

  async submitIndexing(dto: SubmitIndexingDto) {
    const connection = this.getGoogleConnectionStatus();

    if (connection.credentialError) {
      throw new BadRequestException(connection.credentialError);
    }

    if (!connection.connected) {
      throw new BadRequestException(
        'Google Search Console service account is not configured',
      );
    }

    const authOptions: ConstructorParameters<typeof google.auth.GoogleAuth>[0] = {
      scopes: ['https://www.googleapis.com/auth/indexing'],
    };

    if (connection.credentials) {
      authOptions.credentials = connection.credentials;
    } else if (connection.keyFile) {
      authOptions.keyFile = connection.keyFile;
    }

    const auth = new google.auth.GoogleAuth(authOptions);
    const indexing = google.indexing({
      version: 'v3',
      auth,
    });

    const absoluteUrl = this.toAbsoluteUrl(dto.url);
    const type = dto.type ?? 'URL_UPDATED';

    try {
      const response = await indexing.urlNotifications.publish({
        requestBody: {
          url: absoluteUrl,
          type,
        },
      });

      return {
        success: true,
        url: absoluteUrl,
        type,
        notificationMetadata: response.data.urlNotificationMetadata,
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to submit URL to Google Indexing API: ${error.message || error}`,
      );
    }
  }

  async inspectUrls(dto: InspectGscUrlsDto) {
    const connection = this.getGoogleConnectionStatus();

    if (connection.credentialError) {
      throw new BadRequestException(connection.credentialError);
    }

    if (!connection.connected) {
      throw new BadRequestException(
        'Google Search Console service account is not configured',
      );
    }

    const rows = this.uniqueRows(dto.urls).slice(0, 50);
    const authOptions: ConstructorParameters<typeof google.auth.GoogleAuth>[0] =
      {
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      };

    if (connection.credentials) {
      authOptions.credentials = connection.credentials;
    } else if (connection.keyFile) {
      authOptions.keyFile = connection.keyFile;
    }

    const auth = new google.auth.GoogleAuth({
      ...authOptions,
    });
    const searchconsole: searchconsole_v1.Searchconsole = google.searchconsole({
      version: 'v1',
      auth,
    });
    const siteUrl = this.normalizeSiteUrl(dto.siteUrl ?? connection.siteUrl);
    const languageCode =
      dto.languageCode ?? this.configService.get('GSC_LANGUAGE_CODE') ?? 'vi';
    const delayMs =
      dto.delayMs ??
      Number(this.configService.get('GSC_INSPECTION_DELAY_MS') ?? 1200);
    const results: Array<Record<string, unknown>> = [];

    for (const [index, row] of rows.entries()) {
      const inspectionUrl = this.toAbsoluteUrl(row.url);

      try {
        const response = await searchconsole.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl,
            languageCode,
            siteUrl,
          },
        });
        const result = response.data.inspectionResult ?? {};
        const indexStatus = result.indexStatusResult ?? {};
        const mobileUsability = result.mobileUsabilityResult ?? {};
        const richResults = result.richResultsResult ?? {};

        const inspectData = {
          coverageState: indexStatus.coverageState ?? null,
          googleCanonical: indexStatus.googleCanonical ?? null,
          indexingState: indexStatus.indexingState ?? null,
          lastCrawlTime: indexStatus.lastCrawlTime ? String(indexStatus.lastCrawlTime) : null,
          mobileUsabilityVerdict: mobileUsability.verdict ?? null,
          pageFetchState: indexStatus.pageFetchState ?? null,
          richResultsVerdict: richResults.verdict ?? null,
          robotsTxtState: indexStatus.robotsTxtState ?? null,
          userCanonical: indexStatus.userCanonical ?? null,
          verdict: indexStatus.verdict ?? null,
        };

        try {
          await this.prisma.gscInspection.upsert({
            where: { inspectionUrl },
            update: inspectData,
            create: {
              inspectionUrl,
              ...inspectData,
            },
          });
        } catch (dbErr) {
          console.error(`Failed to upsert GSC inspection to DB for ${inspectionUrl}:`, dbErr);
        }

        results.push({
          ...inspectData,
          inspectionUrl,
          referringUrls: indexStatus.referringUrls,
          sitemap: indexStatus.sitemap,
        });
      } catch (error) {
        const apiError = error as {
          code?: number;
          message?: string;
          response?: { status?: number; statusText?: string };
        };

        results.push({
          errorCode: apiError.code,
          errorMessage: apiError.message ?? 'Unknown Google API error',
          errorStatus: apiError.response?.statusText,
          errorStatusCode: apiError.response?.status,
          inspectionUrl,
        });
      }

      if (index < rows.length - 1 && delayMs > 0) {
        await sleep(delayMs);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      siteUrl,
      total: results.length,
      summary: this.summarizeInspection(results),
      results,
    };
  }

  private async buildBaseline() {
    const [
      products,
      blogPosts,
      categories,
      sitemapEntries,
      redirects,
      urlMappings,
      seoMetadata,
      relativeCanonicals,
      mediaMissingAltText,
      gscInspections,
    ] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { deletedAt: null, status: ProductStatus.PUBLISHED },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.blogPost.findMany({
        where: { deletedAt: null, status: ContentStatus.PUBLISHED },
        select: { id: true, title: true, slug: true },
      }),
      this.prisma.category.findMany({
        where: { deletedAt: null, status: CategoryStatus.ACTIVE },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.sitemapEntry.findMany({
        where: { isActive: true },
        select: { url: true },
      }),
      this.prisma.redirect.findMany({
        where: { status: RedirectStatus.ACTIVE },
        select: {
          id: true,
          sourcePath: true,
          targetPath: true,
          status: true,
          statusCode: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.urlMapping.findMany({
        select: {
          entityId: true,
          entityType: true,
          newUrl: true,
          oldUrl: true,
          source: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.seoMetadata.findMany({
        select: {
          entityId: true,
          entityType: true,
          metaDescription: true,
          canonicalUrl: true,
          noIndex: true,
        },
      }),
      this.prisma.seoMetadata.count({
        where: { canonicalUrl: { startsWith: '/' } },
      }),
      this.prisma.media.count({
        where: {
          deletedAt: null,
          OR: [{ altText: null }, { altText: '' }],
        },
      }),
      this.prisma.gscInspection.findMany({}),
    ]);
    const metadataByEntity = new Map(
      seoMetadata.map((item) => [`${item.entityType}:${item.entityId}`, item]),
    );
    const entityByPath = new Map<string, IndexedEntity>();
    const urlMappingByOldPath = new Map<string, UrlMappingRecord>();

    for (const product of products) {
      const metadata = metadataByEntity.get(
        `${SeoEntityType.PRODUCT}:${product.id}`,
      );
      entityByPath.set(`/san-pham/${product.slug}`, {
        id: product.id,
        path: `/san-pham/${product.slug}`,
        slug: product.slug,
        title: product.name,
        type: 'PRODUCT',
        hasMetaDescription: Boolean(metadata?.metaDescription?.trim()),
        noIndex: Boolean(metadata?.noIndex),
        canonicalUrl: metadata?.canonicalUrl,
      });
    }

    for (const post of blogPosts) {
      const metadata = metadataByEntity.get(
        `${SeoEntityType.BLOG_POST}:${post.id}`,
      );
      entityByPath.set(`/blog/${post.slug}`, {
        id: post.id,
        path: `/blog/${post.slug}`,
        slug: post.slug,
        title: post.title,
        type: 'BLOG_POST',
        hasMetaDescription: Boolean(metadata?.metaDescription?.trim()),
        noIndex: Boolean(metadata?.noIndex),
        canonicalUrl: metadata?.canonicalUrl,
      });
    }

    for (const category of categories) {
      const metadata = metadataByEntity.get(
        `${SeoEntityType.CATEGORY}:${category.id}`,
      );
      entityByPath.set(`/danh-muc/${category.slug}`, {
        id: category.id,
        path: `/danh-muc/${category.slug}`,
        slug: category.slug,
        title: category.name,
        type: 'CATEGORY',
        hasMetaDescription: Boolean(metadata?.metaDescription?.trim()),
        noIndex: Boolean(metadata?.noIndex),
        canonicalUrl: metadata?.canonicalUrl,
      });
    }

    const sitemapPaths = new Set<string>();

    for (const entry of sitemapEntries) {
      sitemapPaths.add(this.toPath(entry.url));
    }

    for (const path of entityByPath.keys()) {
      sitemapPaths.add(path);
    }

    const normalizedUrlMappings = urlMappings.map((mapping) => ({
      ...mapping,
      newUrl: this.toPath(mapping.newUrl),
      oldUrl: this.toPath(mapping.oldUrl),
    }));

    for (const mapping of normalizedUrlMappings) {
      urlMappingByOldPath.set(mapping.oldUrl, mapping);
    }

    return {
      counts: {
        activeCategories: categories.length,
        configuredSitemapEntries: sitemapEntries.length,
        mediaMissingAltText,
        publishedBlogPosts: blogPosts.length,
        publishedProducts: products.length,
        relativeCanonicals,
      },
      entityByPath,
      redirects: redirects.map((redirect) => ({
        ...redirect,
        sourcePath: this.normalizePath(redirect.sourcePath),
        targetPath: this.normalizePath(redirect.targetPath),
      })),
      sitemapPaths,
      urlMappingByOldPath,
      urlMappings: normalizedUrlMappings,
      gscInspections: new Map(
        gscInspections.map((item) => [item.inspectionUrl, item]),
      ),
    };
  }

  private analyzeUrl(
    row: GscUrlInputDto,
    baseline: Awaited<ReturnType<GscService['buildBaseline']>>,
  ) {
    const url = this.toAbsoluteUrl(row.url);
    const path = this.toPath(url);
    let entity = baseline.entityByPath.get(path);
    const legacyProductTargetPath = this.toLegacyProductTargetPath(path);

    if (!entity && legacyProductTargetPath) {
      entity = baseline.entityByPath.get(legacyProductTargetPath);
    }

    const redirect = baseline.redirects.find(
      (item) => this.normalizePath(item.sourcePath) === path,
    );
    const urlMapping = baseline.urlMappingByOldPath.get(path);
    const issues: UrlIssue[] = [];
    let redirectTargetEntity: IndexedEntity | undefined;
    let urlMappingTargetEntity: IndexedEntity | undefined;

    if (redirect?.sourcePath === '/') {
      issues.push(this.issue('ROOT_REDIRECT'));
    }

    if (legacyProductTargetPath && entity) {
      issues.push(this.issue('LEGACY_PRODUCT_PATH'));
    }

    if (redirect) {
      const targetPath = this.normalizePath(redirect.targetPath);
      redirectTargetEntity = baseline.entityByPath.get(targetPath);

      issues.push(
        redirectTargetEntity
          ? this.issue('PAGE_WITH_REDIRECT')
          : this.issue('REDIRECT_TARGET_MISSING'),
      );
    }

    if (urlMapping) {
      const targetPath = this.normalizePath(urlMapping.newUrl);
      urlMappingTargetEntity = baseline.entityByPath.get(targetPath);

      if (!redirect) {
        issues.push(
          urlMappingTargetEntity
            ? this.issue('URL_MAPPING_WITHOUT_REDIRECT')
            : this.issue('URL_MAPPING_TARGET_MISSING'),
        );
      }
    }

    if (!redirect && !urlMapping && this.isKnownContentPath(path) && !entity) {
      issues.push(this.issue('NOT_FOUND'));
    }

    if (entity?.noIndex) {
      issues.push(this.issue('EXCLUDED_BY_NOINDEX'));
    }

    if (entity && !baseline.sitemapPaths.has(path)) {
      issues.push(this.issue('NOT_IN_SITEMAP'));
    }

    if (entity && !entity.hasMetaDescription) {
      issues.push(this.issue('THIN_METADATA'));
    }

    if (!issues.length && row.reason) {
      issues.push({
        key: 'GOOGLE_REPORTED',
        label: row.reason,
        severity: 'info',
        action: 'Đối chiếu thêm bằng URL Inspection và dữ liệu live.',
      });
    }

    if (!issues.length) {
      issues.push(this.issue('OK'));
    }

    const primaryIssue = this.pickPrimaryIssue(issues);

    return {
      canonicalUrl: entity?.canonicalUrl ?? null,
      canonicalPath: entity?.path ?? legacyProductTargetPath ?? null,
      entityExists: Boolean(entity),
      entityId: entity?.id ?? null,
      entityTitle: entity?.title ?? null,
      entityType: entity?.type ?? 'UNKNOWN',
      gscReason: row.reason ?? null,
      inSitemap: baseline.sitemapPaths.has(path),
      issues,
      path,
      primaryIssue,
      inspectionResult: baseline.gscInspections.get(url) ?? null,
      redirect: redirect
        ? {
            id: redirect.id,
            sourcePath: redirect.sourcePath,
            statusCode: redirect.statusCode,
            targetEntityId: redirectTargetEntity?.id ?? null,
            targetEntityTitle: redirectTargetEntity?.title ?? null,
            targetEntityType: redirectTargetEntity?.type ?? null,
            targetExists: Boolean(redirectTargetEntity),
            targetPath: redirect.targetPath,
          }
        : null,
      urlMapping: urlMapping
        ? {
            newUrl: urlMapping.newUrl,
            oldUrl: urlMapping.oldUrl,
            source: urlMapping.source ?? null,
            targetEntityId: urlMappingTargetEntity?.id ?? null,
            targetEntityTitle: urlMappingTargetEntity?.title ?? null,
            targetEntityType: urlMappingTargetEntity?.type ?? null,
            targetExists: Boolean(urlMappingTargetEntity),
          }
        : null,
      url,
    };
  }

  private findMissingRedirectTargets(
    redirects: RedirectRecord[],
    type: IndexedEntity['type'],
    entityByPath: Map<string, IndexedEntity>,
  ) {
    const prefix =
      type === 'PRODUCT'
        ? '/san-pham/'
        : type === 'BLOG_POST'
          ? '/blog/'
          : '/danh-muc/';

    return redirects
      .filter((redirect) => redirect.targetPath.startsWith(prefix))
      .filter(
        (redirect) =>
          !entityByPath.has(this.normalizePath(redirect.targetPath)),
      )
      .map((redirect) => ({
        sourcePath: redirect.sourcePath,
        statusCode: redirect.statusCode,
        targetPath: redirect.targetPath,
      }));
  }

  private groupAnalyzedUrls(urls: Array<ReturnType<GscService['analyzeUrl']>>) {
    const groups = new Map<
      string,
      {
        action: string;
        key: string;
        label: string;
        severity: UrlIssue['severity'];
        total: number;
      }
    >();

    for (const url of urls) {
      const issue = url.primaryIssue || {
        key: 'OK',
        label: 'URL hoạt động tốt',
        severity: 'ok' as const,
        action: 'Không cần hành động.',
      };
      const current = groups.get(issue.key);

      if (current) {
        current.total += 1;
      } else {
        groups.set(issue.key, { ...issue, total: 1 });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }

  private issue(key: string): UrlIssue {
    const issueMap: Record<string, UrlIssue> = {
      EXCLUDED_BY_NOINDEX: {
        key,
        label: "Bị loại trừ bởi thẻ 'noindex'",
        severity: 'warning',
        action: 'Gỡ noIndex nếu đây là trang cần xuất hiện trên Google.',
      },
      NOT_FOUND: {
        key,
        label: 'URL đang 404 hoặc entity không còn public',
        severity: 'error',
        action:
          'Redirect sang trang phù hợp hoặc giữ 404/410 nếu không còn giá trị SEO.',
      },
      LEGACY_PRODUCT_PATH: {
        key,
        label: 'URL sản phẩm cũ dạng /products',
        severity: 'info',
        action:
          'Đảm bảo redirect cố định về canonical /san-pham/[slug] và không đưa URL cũ vào sitemap.',
      },
      NOT_IN_SITEMAP: {
        key,
        label: 'URL public chưa có trong sitemap',
        severity: 'warning',
        action: 'Đưa URL canonical/indexable vào sitemap.',
      },
      OK: {
        key,
        label: 'Không thấy lỗi kỹ thuật rõ ràng',
        severity: 'ok',
        action:
          'Kiểm tra thêm chất lượng nội dung, internal link và GSC Inspection.',
      },
      PAGE_WITH_REDIRECT: {
        key,
        label: 'Trang có lệnh chuyển hướng',
        severity: 'info',
        action:
          'Đảm bảo redirect 301/308 trỏ thẳng tới URL 200, không qua chain.',
      },
      REDIRECT_TARGET_MISSING: {
        key,
        label: 'Redirect trỏ tới target không tồn tại',
        severity: 'error',
        action: 'Sửa target sang URL 200 hoặc disable redirect.',
      },
      ROOT_REDIRECT: {
        key,
        label: 'Homepage có redirect trong DB',
        severity: 'error',
        action: 'Disable redirect sourcePath="/".',
      },
      THIN_METADATA: {
        key,
        label: 'Thiếu meta description',
        severity: 'warning',
        action: 'Bổ sung meta description riêng cho trang này.',
      },
      URL_MAPPING_TARGET_MISSING: {
        key,
        label: 'URL cũ có mapping nhưng target không tồn tại',
        severity: 'error',
        action:
          'Sửa newUrl trong mapping/redirect sang URL 200 hoặc bỏ mapping lỗi.',
      },
      URL_MAPPING_WITHOUT_REDIRECT: {
        key,
        label: 'URL cũ có mapping nhưng chưa có redirect active',
        severity: 'warning',
        action:
          'Tạo redirect 301 từ oldUrl sang newUrl để Google gom tín hiệu về URL mới.',
      },
    };

    return issueMap[key] ?? issueMap.OK;
  }

  private pickPrimaryIssue(issues: UrlIssue[]) {
    if (!issues || issues.length === 0) {
      return {
        key: 'OK',
        label: 'URL hoạt động tốt',
        severity: 'ok' as const,
        action: 'Không cần hành động.',
      };
    }

    const severityRank: Record<UrlIssue['severity'], number> = {
      error: 4,
      warning: 3,
      info: 2,
      ok: 1,
    };

    return [...issues].sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity],
    )[0];
  }

  private createGroup(
    key: string,
    label: string,
    total: number,
    severity: UrlIssue['severity'],
    action: string,
  ) {
    return { action, key, label, severity, total };
  }

  private buildCandidateReason(candidate: GscCandidateUrl) {
    return `Auto scan: ${candidate.sourceLabels.join(', ')}.`;
  }

  private getStaticCandidatePaths() {
    const configured = this.configService
      .get<string>('GSC_STATIC_CANDIDATE_PATHS')
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return configured?.length ? configured : DEFAULT_STATIC_CANDIDATE_PATHS;
  }

  private rankCandidate(candidate: GscCandidateUrl) {
    const sourceRank: Record<GscCandidateSource, number> = {
      url_mapping_old: 90,
      redirect_source: 85,
      legacy_product_path: 80,
      redirect_target: 70,
      url_mapping_new: 65,
      entity: 60,
      sitemap_entry: 50,
      live_sitemap: 45,
      static_route: 40,
    };

    return Math.max(...candidate.sources.map((source) => sourceRank[source]));
  }

  private summarizeCandidates(candidates: GscCandidateUrl[]) {
    const summary = new Map<
      GscCandidateSource,
      { key: GscCandidateSource; label: string; total: number }
    >();

    for (const candidate of candidates) {
      for (const [index, source] of candidate.sources.entries()) {
        const current = summary.get(source);

        if (current) {
          current.total += 1;
        } else {
          summary.set(source, {
            key: source,
            label: candidate.sourceLabels[index] ?? source,
            total: 1,
          });
        }
      }
    }

    return Array.from(summary.values()).sort((a, b) => b.total - a.total);
  }

  private async getLiveSitemapUrls() {
    const warnings: string[] = [];
    const baseUrl =
      this.configService.get<string>('GSC_PUBLIC_BASE_URL') ?? DEFAULT_SITE_URL;
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const urls = await this.fetchSitemapLocations(sitemapUrl, warnings);

    return {
      urls: Array.from(new Set(urls)),
      warnings,
    };
  }

  private async fetchSitemapLocations(
    sitemapUrl: string,
    warnings: string[],
    depth = 0,
  ): Promise<string[]> {
    if (depth > 1) {
      return [];
    }

    try {
      const response = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
      });
      const parsed = parser.parse(xml) as unknown;
      const directUrls = this.extractSitemapLocs(parsed, 'urlset', 'url');
      const childSitemaps = this.extractSitemapLocs(
        parsed,
        'sitemapindex',
        'sitemap',
      );

      if (!childSitemaps.length) {
        return directUrls;
      }

      const nestedUrls = await Promise.all(
        childSitemaps
          .slice(0, 10)
          .map((url) => this.fetchSitemapLocations(url, warnings, depth + 1)),
      );

      return [...directUrls, ...nestedUrls.flat()];
    } catch (error) {
      warnings.push(
        `Cannot load live sitemap ${sitemapUrl}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return [];
    }
  }

  private extractSitemapLocs(
    parsed: unknown,
    rootKey: 'sitemapindex' | 'urlset',
    itemKey: 'sitemap' | 'url',
  ) {
    if (!this.isRecord(parsed)) {
      return [];
    }

    const root = parsed[rootKey];

    if (!this.isRecord(root)) {
      return [];
    }

    return this.asArray(root[itemKey])
      .map((item) =>
        this.isRecord(item) && typeof item.loc === 'string'
          ? item.loc.trim()
          : null,
      )
      .filter((item): item is string => Boolean(item));
  }

  private asArray<T>(value: T | T[] | null | undefined) {
    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  private parseBooleanEnv(name: string, defaultValue: boolean) {
    const value = this.configService.get<string>(name)?.trim().toLowerCase();

    if (!value) {
      return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(value);
  }

  private toCandidateEntityType(entityType: SeoEntityType) {
    if (entityType === SeoEntityType.PRODUCT) {
      return 'PRODUCT';
    }

    if (entityType === SeoEntityType.BLOG_POST) {
      return 'BLOG_POST';
    }

    if (entityType === SeoEntityType.CATEGORY) {
      return 'CATEGORY';
    }

    return 'UNKNOWN';
  }

  private summarizeInspection(results: Array<Record<string, unknown>>) {
    return results.reduce<Record<string, number>>((acc, item) => {
      const key =
        (item.coverageState as string | undefined) ??
        (item.verdict as string | undefined) ??
        (item.errorStatus as string | undefined) ??
        'UNKNOWN';

      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

  private uniqueRows(rows: GscUrlInputDto[]) {
    const map = new Map<string, GscUrlInputDto>();

    for (const row of rows) {
      if (!row.url?.trim()) {
        continue;
      }

      map.set(this.toAbsoluteUrl(row.url), {
        reason: row.reason?.trim() || undefined,
        url: this.toAbsoluteUrl(row.url),
      });
    }

    return Array.from(map.values());
  }

  private getGoogleConnectionStatus() {
    const resolvedCredentials = this.resolveEnvCredentials();
    const credentialSource = resolvedCredentials.source;
    const configuredKeyFile =
      this.configService.get<string>('GSC_SERVICE_ACCOUNT_KEY_FILE') ??
      this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
    const keyFile =
      !credentialSource && configuredKeyFile
        ? resolve(configuredKeyFile)
        : null;
    const keyFileExists = Boolean(
      !credentialSource && keyFile && existsSync(keyFile),
    );
    const siteUrl = this.normalizeSiteUrl(
      this.configService.get<string>('GSC_SITE_URL') ?? DEFAULT_SITE_URL,
    );
    const fileCredentialSource = keyFileExists ? 'file' : null;

    return {
      connected: Boolean(
        siteUrl &&
        !resolvedCredentials.error &&
        (resolvedCredentials.credentials || keyFileExists),
      ),
      credentialError: resolvedCredentials.error,
      credentialSource: credentialSource ?? fileCredentialSource,
      credentials: resolvedCredentials.credentials,
      keyFile: keyFileExists ? keyFile : null,
      keyFileConfigured: Boolean(configuredKeyFile),
      keyFileExists,
      serviceAccountEmail: resolvedCredentials.serviceAccountEmail ?? null,
      siteUrl,
    };
  }

  private toPublicGoogleStatus(
    status: ReturnType<GscService['getGoogleConnectionStatus']>,
  ) {
    return {
      connected: status.connected,
      credentialError: status.credentialError ?? null,
      credentialSource: status.credentialSource,
      keyFileConfigured: status.keyFileConfigured,
      keyFileExists: status.keyFileExists,
      serviceAccountEmail: status.serviceAccountEmail,
      siteUrl: status.siteUrl,
    };
  }

  private resolveEnvCredentials(): GscCredentialResolution {
    const base64Json = this.getTrimmedEnv('GSC_SERVICE_ACCOUNT_JSON_BASE64');

    if (base64Json) {
      try {
        return this.toCredentialResolution(
          Buffer.from(base64Json, 'base64').toString('utf8'),
          'env_json_base64',
        );
      } catch (error) {
        return {
          error: this.toCredentialError(
            error,
            'GSC_SERVICE_ACCOUNT_JSON_BASE64',
          ),
          source: 'env_json_base64',
        };
      }
    }

    const rawJson = this.getTrimmedEnv('GSC_SERVICE_ACCOUNT_JSON');

    if (rawJson) {
      try {
        return this.toCredentialResolution(rawJson, 'env_json');
      } catch (error) {
        return {
          error: this.toCredentialError(error, 'GSC_SERVICE_ACCOUNT_JSON'),
          source: 'env_json',
        };
      }
    }

    const clientEmail = this.getTrimmedEnv('GSC_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('GSC_PRIVATE_KEY')
      ?.trim()
      .replace(/\\n/g, '\n');

    if (clientEmail || privateKey) {
      if (!clientEmail || !privateKey) {
        return {
          error:
            'Both GSC_CLIENT_EMAIL and GSC_PRIVATE_KEY are required when using split env credentials',
          source: 'env_fields',
        };
      }

      return {
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
          project_id: this.getTrimmedEnv('GSC_PROJECT_ID'),
          type: 'service_account',
        },
        serviceAccountEmail: clientEmail,
        source: 'env_fields',
      };
    }

    return {};
  }

  private toCredentialResolution(
    rawJson: string,
    source: GscCredentialResolution['source'],
  ): GscCredentialResolution {
    const credentials = this.parseServiceAccountCredentials(rawJson);

    return {
      credentials,
      serviceAccountEmail: credentials.client_email,
      source,
    };
  }

  private parseServiceAccountCredentials(
    rawJson: string,
  ): GscServiceAccountCredentials {
    const parsed = JSON.parse(rawJson) as unknown;

    if (!this.isRecord(parsed)) {
      throw new Error('credential JSON must be an object');
    }

    const clientEmail = parsed.client_email;
    const privateKey = parsed.private_key;

    if (typeof clientEmail !== 'string' || !clientEmail.trim()) {
      throw new Error('credential JSON is missing client_email');
    }

    if (typeof privateKey !== 'string' || !privateKey.trim()) {
      throw new Error('credential JSON is missing private_key');
    }

    return {
      ...parsed,
      client_email: clientEmail.trim(),
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toCredentialError(error: unknown, envName: string) {
    return `Invalid ${envName}: ${
      error instanceof Error ? error.message : 'cannot parse service account'
    }`;
  }

  private getTrimmedEnv(name: string) {
    return this.configService.get<string>(name)?.trim();
  }

  private isKnownContentPath(path: string) {
    return (
      path.startsWith('/san-pham/') ||
      path.startsWith('/products/') ||
      path.startsWith('/blog/') ||
      path.startsWith('/danh-muc/')
    );
  }

  private toLegacyProductTargetPath(path: string) {
    if (!path.startsWith('/products/')) {
      return null;
    }

    const slug = path.replace(/^\/products\//, '').trim();

    return slug ? `/san-pham/${slug}` : null;
  }

  private toAbsoluteUrl(value: string) {
    const trimmed = value.trim();
    const baseUrl =
      this.configService.get<string>('GSC_PUBLIC_BASE_URL') ?? DEFAULT_SITE_URL;

    try {
      if (trimmed.startsWith('/')) {
        return new URL(trimmed, baseUrl).toString();
      }

      return new URL(trimmed).toString();
    } catch {
      throw new BadRequestException(`Invalid URL: ${value}`);
    }
  }

  private toPath(value: string) {
    try {
      return this.normalizePath(new URL(value, DEFAULT_SITE_URL).pathname);
    } catch {
      return this.normalizePath(value);
    }
  }

  private normalizePath(path: string) {
    const normalized = path.trim().split('?')[0].split('#')[0];

    if (!normalized) {
      return '/';
    }

    const withSlash = normalized.startsWith('/')
      ? normalized
      : `/${normalized}`;
    return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
  }

  private normalizeSiteUrl(siteUrl: string) {
    if (siteUrl.startsWith('sc-domain:')) {
      return siteUrl;
    }

    return siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  }
}
