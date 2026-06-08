import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CategoryStatus,
  ContentStatus,
  Prisma,
  ProductStatus,
  RedirectStatus,
  SeoEntityType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateRedirectDto } from './dto/create-redirect.dto';
import { ListRedirectsQueryDto } from './dto/list-redirects-query.dto';
import { SeoMetadataQueryDto } from './dto/seo-metadata-query.dto';
import { UpdateRedirectDto } from './dto/update-redirect.dto';

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getMetadata(query: SeoMetadataQueryDto) {
    const metadata = await this.prisma.seoMetadata.findUnique({
      where: {
        entityType_entityId: {
          entityType: query.entityType,
          entityId: query.entityId,
        },
      },
      include: {
        ogImage: {
          select: {
            id: true,
            url: true,
            secureUrl: true,
            altText: true,
            width: true,
            height: true,
          },
        },
      },
    });

    if (!metadata) {
      throw new NotFoundException('SEO metadata not found');
    }

    return metadata;
  }

  async resolveRedirect(path: string) {
    const sourcePath = this.normalizePath(path);
    const redirect = await this.prisma.redirect.findFirst({
      where: {
        sourcePath,
        status: RedirectStatus.ACTIVE,
      },
    });

    if (!redirect) {
      throw new NotFoundException('Redirect not found');
    }

    await this.prisma.redirect.update({
      where: { id: redirect.id },
      data: {
        hitCount: { increment: 1 },
        lastHitAt: new Date(),
      },
    });

    return redirect;
  }

  async renderSitemap() {
    const noIndexMetadata = await this.prisma.seoMetadata.findMany({
      where: { noIndex: true },
      select: { entityType: true, entityId: true },
    });

    const noIndexSet = new Set(
      noIndexMetadata.map((meta) => `${meta.entityType}:${meta.entityId}`),
    );

    const configuredEntries = await this.prisma.sitemapEntry.findMany({
      where: { isActive: true },
      orderBy: { url: 'asc' },
    });

    const activeConfiguredEntries = configuredEntries.filter((entry) => {
      if (entry.entityType && entry.entityId) {
        return !noIndexSet.has(`${entry.entityType}:${entry.entityId}`);
      }
      return true;
    });

    const generatedEntries = await this.getGeneratedSitemapEntries(noIndexSet);
    const entries = [...activeConfiguredEntries, ...generatedEntries];

    const uniqueEntries = Array.from(
      new Map(
        entries.map((entry) => {
          const absoluteUrl = this.toAbsoluteUrl(entry.url);
          return [absoluteUrl, { ...entry, url: absoluteUrl }];
        }),
      ).values(),
    );


    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...uniqueEntries.map((entry) => this.renderSitemapUrl(entry)),
      '</urlset>',
    ].join('\n');
  }

  async renderRobots() {
    const rules = await this.prisma.robotsRule.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const lines = rules.length
      ? rules.flatMap((rule) => [
          `User-agent: ${rule.userAgent}`,
          `${rule.rule}: ${rule.path}`,
          '',
        ])
      : ['User-agent: *', 'Allow: /', ''];

    lines.push(`Sitemap: ${this.toAbsoluteUrl('/sitemap.xml')}`);

    return lines.join('\n');
  }

  async listRedirects(query: ListRedirectsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildRedirectWhere(query);
    const [total, redirects] = await this.prisma.$transaction([
      this.prisma.redirect.count({ where }),
      this.prisma.redirect.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: redirects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createRedirect(createDto: CreateRedirectDto) {
    const sourcePath = this.normalizePath(createDto.sourcePath);
    const targetPath = this.normalizePath(createDto.targetPath);
    this.assertValidRedirect(sourcePath, targetPath);
    await this.assertUniqueSourcePath(sourcePath);

    return this.prisma.redirect.create({
      data: {
        sourcePath,
        targetPath,
        statusCode: createDto.statusCode ?? 301,
        status: createDto.status ?? RedirectStatus.ACTIVE,
      },
    });
  }

  async getRedirectById(id: string) {
    const redirect = await this.prisma.redirect.findUnique({ where: { id } });

    if (!redirect) {
      throw new NotFoundException('Redirect not found');
    }

    return redirect;
  }

  async updateRedirect(id: string, updateDto: UpdateRedirectDto) {
    const current = await this.getRedirectById(id);
    const sourcePath =
      updateDto.sourcePath === undefined
        ? current.sourcePath
        : this.normalizePath(updateDto.sourcePath);
    const targetPath =
      updateDto.targetPath === undefined
        ? current.targetPath
        : this.normalizePath(updateDto.targetPath);

    this.assertValidRedirect(sourcePath, targetPath);

    if (sourcePath !== current.sourcePath) {
      await this.assertUniqueSourcePath(sourcePath, id);
    }

    return this.prisma.redirect.update({
      where: { id },
      data: {
        sourcePath,
        targetPath,
        statusCode: updateDto.statusCode ?? current.statusCode,
        status: updateDto.status ?? current.status,
        errorMessage: null,
        lastCheckedAt: new Date(),
      },
    });
  }

  async disableRedirect(id: string) {
    await this.getRedirectById(id);

    return this.prisma.redirect.update({
      where: { id },
      data: { status: RedirectStatus.INACTIVE },
    });
  }

  private async getGeneratedSitemapEntries(noIndexSet: Set<string>) {
    const [products, categories, blogPosts, blogCategories] =
      await this.prisma.$transaction([
        this.prisma.product.findMany({
          where: {
            deletedAt: null,
            status: ProductStatus.PUBLISHED,
          },
          select: { id: true, slug: true, updatedAt: true, publishedAt: true },
        }),
        this.prisma.category.findMany({
          where: { deletedAt: null, status: CategoryStatus.ACTIVE },
          select: { id: true, slug: true, updatedAt: true },
        }),
        this.prisma.blogPost.findMany({
          where: {
            deletedAt: null,
            status: ContentStatus.PUBLISHED,
          },
          select: { id: true, slug: true, updatedAt: true, publishedAt: true },
        }),
        this.prisma.blogCategory.findMany({
          where: {
            deletedAt: null,
            status: ContentStatus.PUBLISHED,
          },
          select: { id: true, slug: true, updatedAt: true },
        }),
      ]);

    return [
      ...products
        .filter((product) => !noIndexSet.has(`${SeoEntityType.PRODUCT}:${product.id}`))
        .map((product) => ({
          url: `/san-pham/${product.slug}`,
          entityType: SeoEntityType.PRODUCT,
          entityId: product.id,
          priority: 0.8,
          changefreq: 'weekly',
          lastmod: product.publishedAt ?? product.updatedAt,
        })),
      ...categories
        .filter((category) => !noIndexSet.has(`${SeoEntityType.CATEGORY}:${category.id}`))
        .map((category) => ({
          url: `/danh-muc/${category.slug}`,
          entityType: SeoEntityType.CATEGORY,
          entityId: category.id,
          priority: 0.7,
          changefreq: 'weekly',
          lastmod: category.updatedAt,
        })),
      ...blogPosts
        .filter((post) => !noIndexSet.has(`${SeoEntityType.BLOG_POST}:${post.id}`))
        .map((post) => ({
          url: `/blog/${post.slug}`,
          entityType: SeoEntityType.BLOG_POST,
          entityId: post.id,
          priority: 0.6,
          changefreq: 'monthly',
          lastmod: post.publishedAt ?? post.updatedAt,
        })),
      ...blogCategories
        .filter((category) => !noIndexSet.has(`${SeoEntityType.BLOG_CATEGORY}:${category.id}`))
        .map((category) => ({
          url: `/blog/categories/${category.slug}`,
          entityType: SeoEntityType.BLOG_CATEGORY,
          entityId: category.id,
          priority: 0.5,
          changefreq: 'monthly',
          lastmod: category.updatedAt,
        })),
    ];
  }

  private toAbsoluteUrl(url: string): string {
    const trimmed = url.trim();
    let baseUrl =
      this.configService.get<string>('PUBLIC_SITE_URL') ??
      this.configService.get<string>('GSC_PUBLIC_BASE_URL') ??
      'https://dukystore.com';

    baseUrl = baseUrl.replace(/\/+$/, '');

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${baseUrl}${path}`;
  }

  private renderSitemapUrl(entry: {
    url: string;
    priority?: number | null;
    changefreq?: string | null;
    lastmod?: Date | null;
  }) {
    return [
      '  <url>',
      `    <loc>${this.escapeXml(entry.url)}</loc>`,
      entry.lastmod
        ? `    <lastmod>${entry.lastmod.toISOString()}</lastmod>`
        : null,
      entry.changefreq
        ? `    <changefreq>${this.escapeXml(entry.changefreq)}</changefreq>`
        : null,
      entry.priority !== null && entry.priority !== undefined
        ? `    <priority>${entry.priority.toFixed(1)}</priority>`
        : null,
      '  </url>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildRedirectWhere(
    query: ListRedirectsQueryDto,
  ): Prisma.RedirectWhereInput {
    const where: Prisma.RedirectWhereInput = {};
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { sourcePath: { contains: search, mode: 'insensitive' } },
        { targetPath: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    return where;
  }

  private async assertUniqueSourcePath(sourcePath: string, id?: string) {
    const existing = await this.prisma.redirect.findFirst({
      where: {
        sourcePath,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Redirect source path is already used');
    }
  }

  private assertValidRedirect(sourcePath: string, targetPath: string) {
    if (sourcePath === targetPath) {
      throw new BadRequestException('Redirect source and target must differ');
    }

    if (!sourcePath.startsWith('/') || !targetPath.startsWith('/')) {
      throw new BadRequestException('Redirect paths must start with /');
    }
  }

  private normalizePath(path: string) {
    const normalized = path.trim();

    if (!normalized) {
      throw new BadRequestException('Path is required');
    }

    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
