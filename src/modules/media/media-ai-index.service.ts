import { Injectable } from '@nestjs/common';
import { Media, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

type MediaWithAiIndex = Media & {
  aiIndex: {
    searchText: string;
    aiDescription: string | null;
    keywords: string[];
  } | null;
};

@Injectable()
export class MediaAiIndexService {
  constructor(private readonly prisma: PrismaService) {}

  async rebuild(limit = 500) {
    const media = await this.prisma.media.findMany({
      where: {
        deletedAt: null,
        mimeType: { startsWith: 'image/' },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    for (const item of media) {
      await this.upsertMediaIndex(item);
    }

    return {
      indexed: media.length,
      limit,
    };
  }

  async searchForBlog(input: {
    title?: string | null;
    excerpt?: string | null;
    content?: string | null;
    focusKeyword?: string | null;
    categories?: Array<{ title?: string | null; slug?: string | null }>;
    tags?: Array<{ title?: string | null; slug?: string | null }>;
    products?: Array<{ title?: string | null; slug?: string | null }>;
    limit?: number;
  }) {
    const queryText = this.buildBlogQueryText(input);
    return this.search(queryText, input.limit ?? 20);
  }

  async search(query: string, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 60);
    const terms = this.extractTerms(query);

    const candidates = await this.prisma.media.findMany({
      where: this.buildSearchWhere(terms),
      include: { aiIndex: true },
      orderBy: { createdAt: 'desc' },
      take: Math.max(safeLimit * 8, 80),
    });

    const fallback =
      candidates.length > 0
        ? []
        : await this.prisma.media.findMany({
            where: {
              deletedAt: null,
              mimeType: { startsWith: 'image/' },
            },
            include: { aiIndex: true },
            orderBy: { createdAt: 'desc' },
            take: Math.max(safeLimit * 4, 40),
          });

    const indexedCandidates = await Promise.all(
      [...candidates, ...fallback].map((media) => this.ensureMediaIndex(media)),
    );

    return indexedCandidates
      .map((media) => ({
        media,
        score: this.scoreMedia(media, terms),
      }))
      .filter((item) => item.score > 0 || candidates.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map(({ media, score }) => this.toAiMedia(media, score));
  }

  async upsertMediaIndex(media: Media) {
    const searchText = this.buildSearchText(media);
    const keywords = this.extractTerms(searchText).slice(0, 30);
    const aiDescription = this.buildDescription(media, keywords);

    return this.prisma.mediaAiIndex.upsert({
      where: { mediaId: media.id },
      create: {
        mediaId: media.id,
        searchText,
        aiDescription,
        keywords,
      },
      update: {
        searchText,
        aiDescription,
        keywords,
        indexedAt: new Date(),
      },
    });
  }

  private async ensureMediaIndex(media: MediaWithAiIndex) {
    if (media.aiIndex) return media;

    const aiIndex = await this.upsertMediaIndex(media);
    return {
      ...media,
      aiIndex: {
        searchText: aiIndex.searchText,
        aiDescription: aiIndex.aiDescription,
        keywords: aiIndex.keywords,
      },
    };
  }

  private buildSearchWhere(terms: string[]): Prisma.MediaWhereInput {
    const base: Prisma.MediaWhereInput = {
      deletedAt: null,
      mimeType: { startsWith: 'image/' },
    };

    if (!terms.length) return base;

    const topTerms = terms.slice(0, 10);
    return {
      ...base,
      OR: topTerms.flatMap((term) => [
        { title: { contains: term, mode: 'insensitive' } },
        { altText: { contains: term, mode: 'insensitive' } },
        { fileName: { contains: term, mode: 'insensitive' } },
        { originalName: { contains: term, mode: 'insensitive' } },
        { folder: { contains: term, mode: 'insensitive' } },
        { aiIndex: { searchText: { contains: term, mode: 'insensitive' } } },
      ]),
    };
  }

  private scoreMedia(media: MediaWithAiIndex, terms: string[]) {
    if (!terms.length) return 1;

    const title = this.normalize(media.title ?? '');
    const altText = this.normalize(media.altText ?? '');
    const folder = this.normalize(media.folder ?? '');
    const fileName = this.normalize(`${media.originalName ?? ''} ${media.fileName ?? ''}`);
    const indexed = this.normalize(
      `${media.aiIndex?.searchText ?? ''} ${media.aiIndex?.aiDescription ?? ''} ${(media.aiIndex?.keywords ?? []).join(' ')}`,
    );

    return terms.reduce((score, term) => {
      let next = score;
      if (title.includes(term)) next += 8;
      if (altText.includes(term)) next += 7;
      if (folder.includes(term)) next += 4;
      if (fileName.includes(term)) next += 3;
      if (indexed.includes(term)) next += 2;
      return next;
    }, 0);
  }

  private buildBlogQueryText(input: Parameters<MediaAiIndexService['searchForBlog']>[0]) {
    return [
      input.focusKeyword,
      input.title,
      input.excerpt,
      this.stripHtml(input.content ?? '').slice(0, 1200),
      ...(input.categories ?? []).flatMap((item) => [item.title, item.slug]),
      ...(input.tags ?? []).flatMap((item) => [item.title, item.slug]),
      ...(input.products ?? []).slice(0, 10).flatMap((item) => [item.title, item.slug]),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildSearchText(media: Media) {
    return [
      media.title,
      media.altText,
      media.folder,
      media.originalName,
      media.fileName,
      this.fileNameToWords(media.originalName || media.fileName),
      this.stringifyMetadata(media.metadata),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildDescription(media: Media, keywords: string[]) {
    const name = media.title || media.altText || this.fileNameToWords(media.originalName || media.fileName);
    const size =
      media.width && media.height ? `${media.width}x${media.height}` : null;
    return [name, media.folder ? `Folder: ${media.folder}` : null, size, keywords.length ? `Keywords: ${keywords.slice(0, 10).join(', ')}` : null]
      .filter(Boolean)
      .join('. ');
  }

  private toAiMedia(media: MediaWithAiIndex, score: number) {
    return {
      id: media.id,
      url: media.secureUrl || media.url,
      title: media.title || media.originalName || media.fileName,
      altText: media.altText || '',
      folder: media.folder || '',
      width: media.width,
      height: media.height,
      aiDescription: media.aiIndex?.aiDescription || '',
      keywords: media.aiIndex?.keywords ?? [],
      score,
    };
  }

  private extractTerms(value: string) {
    const normalized = this.normalize(value);
    const stopWords = new Set([
      'cho',
      'cua',
      'voi',
      'the',
      'mot',
      'nhung',
      'cac',
      'and',
      'jpg',
      'jpeg',
      'png',
      'webp',
      'image',
    ]);

    return Array.from(
      new Set(
        normalized
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2 && !stopWords.has(term)),
      ),
    );
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stripHtml(value: string) {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private fileNameToWords(value?: string | null) {
    return (value ?? '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  private stringifyMetadata(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object') return '';
    try {
      return JSON.stringify(metadata).slice(0, 1000);
    } catch {
      return '';
    }
  }
}
