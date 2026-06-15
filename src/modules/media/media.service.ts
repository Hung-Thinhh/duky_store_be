import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { MediaProvider, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExternalMediaDto } from './dto/create-external-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { UploadMediaMetadataDto } from './dto/upload-media-metadata.dto';
import { MediaAiIndexService } from './media-ai-index.service';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const LOCAL_MEDIA_FOLDER = join(process.cwd(), 'uploads', 'media');

const IMAGE_MIME_TYPES = new Set([
  'image/*',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

const IMAGE_EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

interface ImageDimensions {
  width: number | null;
  height: number | null;
}

const WEBP_CONVERTIBLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/avif',
]);

const DIMENSION_EXTRACTION_TIMEOUT_MS = 5000;

type MediaWithUploader = NonNullable<
  Awaited<ReturnType<MediaService['findById']>>
>;
type UploadedMediaFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private r2Client?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mediaAiIndexService: MediaAiIndexService,
  ) {}

  async list(query: ListMediaQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, media] = await this.prisma.$transaction([
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: media.map((item) => this.toMedia(item as any)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createExternal(
    createDto: CreateExternalMediaDto,
    uploadedById: string,
  ) {
    const normalized = this.normalizeCreateInput(createDto);
    const media = await this.prisma.media.create({
      data: {
        provider: MediaProvider.EXTERNAL,
        uploadedById,
        ...normalized,
      },
      include: this.mediaInclude(),
    });

    await this.safeUpsertAiIndex(media);

    return this.toMedia(media);
  }

  async createLocal(file: UploadedMediaFile, uploadedById: string, baseUrl: string, metadata?: UploadMediaMetadataDto) {
    this.assertUploadFile(file);

    if (file.originalname) {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    }

    // Extract image dimensions (width/height)
    const dimensions = await this.extractDimensions(file.buffer);

    // Convert to WebP (or keep original for SVG/already WebP)
    const converted = await this.convertToWebp(file.buffer, file.mimetype);

    // Use the converted extension while preserving an optional SEO-friendly base name.
    const storedFileName = this.createStoredUploadFileName(metadata?.fileName, converted.extension);

    if (this.getStorageProvider() === MediaProvider.R2) {
      const objectKey = this.buildR2ObjectKey(storedFileName);
      const url = this.buildR2PublicUrl(objectKey);

      await this.uploadToR2(objectKey, converted.buffer, converted.mimeType);

      const media = await this.prisma.media.create({
        data: {
          provider: MediaProvider.R2,
          uploadedById,
          url,
          secureUrl: url,
          providerKey: objectKey,
          fileName: storedFileName,
          originalName: file.originalname,
          mimeType: converted.mimeType,
          size: converted.buffer.length,
          width: dimensions.width,
          height: dimensions.height,
          folder: this.getR2Prefix(),
          altText: metadata?.altText?.trim() || null,
          title: metadata?.title?.trim() || null,
        },
        include: this.mediaInclude(),
      });

      await this.safeUpsertAiIndex(media);

      return this.toMedia(media);
    }

    await mkdir(LOCAL_MEDIA_FOLDER, { recursive: true });

    const filePath = join(LOCAL_MEDIA_FOLDER, storedFileName);

    // Write the converted buffer (or original if SVG/already WebP)
    await writeFile(filePath, converted.buffer);

    const url = `${baseUrl}/api/v1/media/files/${storedFileName}`;
    const media = await this.prisma.media.create({
      data: {
        provider: MediaProvider.LOCAL,
        uploadedById,
        url,
        secureUrl: url,
        providerKey: storedFileName,
        fileName: storedFileName,
        originalName: file.originalname,
        mimeType: converted.mimeType,
        size: converted.buffer.length,
        width: dimensions.width,
        height: dimensions.height,
        folder: 'uploads',
        altText: metadata?.altText?.trim() || null,
        title: metadata?.title?.trim() || null,
      },
      include: this.mediaInclude(),
    });

    await this.safeUpsertAiIndex(media);

    return this.toMedia(media);
  }

  async createLocalMany(
    files: UploadedMediaFile[],
    uploadedById: string,
    baseUrl: string,
  ) {
    const uploaded: Awaited<ReturnType<MediaService['createLocal']>>[] = [];

    for (const file of files) {
      uploaded.push(await this.createLocal(file, uploadedById, baseUrl));
    }

    return uploaded;
  }

  async getById(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        providerKey: true,
        url: true,
        secureUrl: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        folder: true,
        altText: true,
        title: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!media || media.deletedAt) {
      throw new NotFoundException('Media not found');
    }

    return media;
  }

  async update(id: string, updateDto: UpdateMediaDto) {
    const existing = await this.getMediaOrThrow(id);
    const data = this.normalizeUpdateInput(updateDto);

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    // If fileName is being updated for a LOCAL media, rename the file on disk
    if (
      data.fileName &&
      typeof data.fileName === 'string' &&
      existing.provider === MediaProvider.LOCAL &&
      existing.providerKey
    ) {
      const newFileName = data.fileName as string;
      const oldFilePath = join(LOCAL_MEDIA_FOLDER, existing.providerKey);

      // Add short random suffix to avoid collisions: slug-a3f2.webp
      const ext = extname(newFileName) || extname(existing.providerKey || '');
      const nameWithoutExt = newFileName.replace(/\.[^.]+$/, '');
      const suffix = randomUUID().substring(0, 4);
      const finalFileName = `${nameWithoutExt}-${suffix}${ext}`;
      const newFilePath = join(LOCAL_MEDIA_FOLDER, finalFileName);

      try {
        await rename(oldFilePath, newFilePath);

        // Update URL, providerKey, and fileName to reflect the new file name
        const baseUrl = existing.url.replace(`/api/v1/media/files/${existing.providerKey}`, '');
        const newUrl = `${baseUrl}/api/v1/media/files/${finalFileName}`;

        data.providerKey = finalFileName;
        data.fileName = finalFileName;
        data.url = newUrl;
        data.secureUrl = newUrl;
      } catch (err) {
        this.logger.warn(`Failed to rename media file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        // If rename fails, still update metadata but keep old file path
      }
    }

    // If fileName is being updated for an R2 media, rename (copy + delete) on Cloudflare R2
    if (
      data.fileName &&
      typeof data.fileName === 'string' &&
      existing.provider === MediaProvider.R2 &&
      existing.providerKey
    ) {
      const newFileName = data.fileName as string;
      const ext = extname(newFileName) || extname(existing.providerKey || '');
      const nameWithoutExt = newFileName.replace(/\.[^.]+$/, '');
      const suffix = randomUUID().substring(0, 4);
      const finalFileName = `${nameWithoutExt}-${suffix}${ext}`;
      const newProviderKey = this.buildR2ObjectKey(finalFileName);
      const bucket = this.getRequiredConfig('R2_BUCKET');

      try {
        const client = this.getR2Client();

        // Copy object (requires URL encoding of the copy source)
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${encodeURIComponent(existing.providerKey)}`,
            Key: newProviderKey,
          }),
        );

        // Delete old object
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: existing.providerKey,
          }),
        );

        // Update URL, providerKey, and fileName to reflect the new file name
        const newUrl = this.buildR2PublicUrl(newProviderKey);

        data.providerKey = newProviderKey;
        data.fileName = finalFileName;
        data.url = newUrl;
        data.secureUrl = newUrl;
      } catch (err) {
        this.logger.warn(`Failed to rename R2 media object: ${err instanceof Error ? err.message : 'Unknown error'}`);
        // If R2 rename fails, keep old file path
      }
    }

    const media = await this.prisma.media.update({
      where: { id },
      data,
      include: this.mediaInclude(),
    });

    if (media.url !== existing.url) {
      await this.updateHtmlUrls(existing.url, media.url);
    }

    await this.safeUpsertAiIndex(media);

    return this.toMedia(media);
  }

  async remove(id: string) {
    await this.getMediaOrThrow(id);
    await this.prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private buildWhere(query: ListMediaQueryDto): Prisma.MediaWhereInput {
    const where: Prisma.MediaWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { url: { contains: search, mode: 'insensitive' } },
        { fileName: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { altText: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.folder?.trim()) {
      where.folder = query.folder.trim();
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    return where;
  }

  private normalizeCreateInput(
    createDto: CreateExternalMediaDto,
  ): Prisma.MediaUncheckedCreateInput {
    const url = createDto.url.trim();
    const mimeType = this.resolveMimeType(url, createDto.mimeType);

    return {
      url,
      secureUrl: this.nullableTrim(createDto.secureUrl),
      providerKey: this.nullableTrim(createDto.providerKey),
      fileName: this.resolveFileName(url, createDto.fileName),
      originalName: this.nullableTrim(createDto.originalName),
      mimeType,
      size: createDto.size,
      width: createDto.width,
      height: createDto.height,
      folder: this.nullableTrim(createDto.folder),
      altText: this.nullableTrim(createDto.altText),
      title: this.nullableTrim(createDto.title),
      metadata: this.resolveMetadata(createDto.metadata),
    };
  }

  private normalizeUpdateInput(
    updateDto: UpdateMediaDto,
  ): Prisma.MediaUncheckedUpdateInput {
    const data: Prisma.MediaUncheckedUpdateInput = {};
    const url = updateDto.url?.trim();

    if (url !== undefined) {
      data.url = url;
    }

    if (updateDto.secureUrl !== undefined) {
      data.secureUrl = this.nullableTrim(updateDto.secureUrl);
    }

    if (updateDto.providerKey !== undefined) {
      data.providerKey = this.nullableTrim(updateDto.providerKey);
    }

    if (updateDto.fileName !== undefined) {
      data.fileName = this.resolveFileName(url ?? '', updateDto.fileName);
    } else if (url) {
      data.fileName = this.resolveFileName(url);
    }

    if (updateDto.originalName !== undefined) {
      data.originalName = this.nullableTrim(updateDto.originalName);
    }

    if (updateDto.mimeType !== undefined) {
      data.mimeType = this.resolveMimeType(url ?? '', updateDto.mimeType);
    } else if (url) {
      const inferredMimeType = this.inferMimeType(url);

      if (inferredMimeType) {
        data.mimeType = inferredMimeType;
      }
    }

    if (updateDto.size !== undefined) {
      data.size = updateDto.size;
    }

    if (updateDto.width !== undefined) {
      data.width = updateDto.width;
    }

    if (updateDto.height !== undefined) {
      data.height = updateDto.height;
    }

    if (updateDto.folder !== undefined) {
      data.folder = this.nullableTrim(updateDto.folder);
    }

    if (updateDto.altText !== undefined) {
      data.altText = this.nullableTrim(updateDto.altText);
    }

    if (updateDto.title !== undefined) {
      data.title = this.nullableTrim(updateDto.title);
    }

    if (updateDto.metadata !== undefined) {
      data.metadata = this.resolveMetadata(updateDto.metadata);
    }

    return data;
  }

  private resolveMimeType(url: string, mimeType?: string) {
    const normalizedMimeType = mimeType?.trim().toLowerCase();

    if (normalizedMimeType) {
      this.assertImageMimeType(normalizedMimeType);

      return normalizedMimeType;
    }

    const inferredMimeType = this.inferMimeType(url);

    if (inferredMimeType) {
      return inferredMimeType;
    }

    return 'image/*';
  }

  private inferMimeType(url: string) {
    const extension = this.getUrlExtension(url);

    if (!extension) {
      return undefined;
    }

    const mimeType = IMAGE_EXTENSION_MIME_TYPES[extension];

    if (!mimeType) {
      throw new BadRequestException('Unsupported image URL extension');
    }

    return mimeType;
  }

  private assertImageMimeType(mimeType: string) {
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Unsupported image MIME type');
    }
  }

  private assertUploadFile(file?: UploadedMediaFile) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.assertImageMimeType(file.mimetype);

    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Uploaded file exceeds 10MB limit');
    }
  }

  private resolveUploadExtension(file: UploadedMediaFile) {
    const originalExtension = extname(file.originalname).toLowerCase();

    if (originalExtension) {
      return originalExtension;
    }

    const extension = Object.entries(IMAGE_EXTENSION_MIME_TYPES).find(
      ([, mimeType]) => mimeType === file.mimetype,
    )?.[0];

    return extension ? `.${extension}` : '';
  }

  private createStoredUploadFileName(requestedFileName: string | undefined, extension: string) {
    const requestedBase = requestedFileName
      ?.trim()
      .replace(/\.[^.]+$/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 100);

    return requestedBase
      ? `${requestedBase}-${randomUUID().slice(0, 4)}${extension}`
      : `${randomUUID()}${extension}`;
  }

  private resolveFileName(url: string, fileName?: string) {
    const normalizedFileName = fileName?.trim();

    if (normalizedFileName) {
      return normalizedFileName;
    }

    return this.getUrlFileName(url) ?? 'external-image';
  }

  private getUrlFileName(url: string) {
    try {
      const parsedUrl = new URL(url);
      const pathSegment = parsedUrl.pathname.split('/').filter(Boolean).pop();

      return pathSegment ? decodeURIComponent(pathSegment) : undefined;
    } catch {
      return undefined;
    }
  }

  private getUrlExtension(url: string) {
    const fileName = this.getUrlFileName(url);
    const extension = fileName?.split('.').pop()?.toLowerCase();

    return extension && extension !== fileName ? extension : undefined;
  }

  private resolveMetadata(metadata?: Record<string, unknown>) {
    return metadata as Prisma.InputJsonValue | undefined;
  }

  private getStorageProvider() {
    const provider = this.configService
      .get<string>('MEDIA_STORAGE_PROVIDER', 'LOCAL')
      .trim()
      .toUpperCase();

    if (provider === MediaProvider.R2) {
      return MediaProvider.R2;
    }

    return MediaProvider.LOCAL;
  }

  private getR2Client() {
    if (this.r2Client) {
      return this.r2Client;
    }

    const accountId = this.getRequiredConfig('R2_ACCOUNT_ID');
    const accessKeyId = this.getRequiredConfig('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.getRequiredConfig('R2_SECRET_ACCESS_KEY');

    this.r2Client = new S3Client({
      region: this.configService.get<string>('R2_REGION') || 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return this.r2Client;
  }

  private async uploadToR2(
    key: string,
    body: Buffer,
    contentType: string,
  ) {
    const bucket = this.getRequiredConfig('R2_BUCKET');

    try {
      await this.getR2Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (error) {
      this.logger.error(
        `R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to upload media to R2');
    }
  }

  private buildR2ObjectKey(fileName: string) {
    const prefix = this.getR2Prefix();

    return prefix ? `${prefix}/${fileName}` : fileName;
  }

  private getR2Prefix() {
    return (this.configService.get<string>('R2_PREFIX') || 'media')
      .trim()
      .replace(/^\/+|\/+$/g, '');
  }

  private buildR2PublicUrl(key: string) {
    const publicUrl = this.getRequiredConfig('R2_PUBLIC_URL').replace(/\/+$/g, '');
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${publicUrl}/${encodedKey}`;
  }

  private getRequiredConfig(key: string) {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new BadRequestException(`${key} is required for R2 media storage`);
    }

    return value;
  }

  private async getMediaOrThrow(id: string) {
    const media = await this.findById(id);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return media;
  }

  private async findById(id: string) {
    return this.prisma.media.findUnique({
      where: { id },
      include: this.mediaInclude(),
    }).then((m) => (m && !m.deletedAt ? m : null));
  }

  private mediaInclude() {
    return {
      uploadedBy: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    } as const;
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private async extractDimensions(buffer: Buffer): Promise<ImageDimensions> {
    try {
      const metadata = await Promise.race([
        sharp(buffer).metadata(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), DIMENSION_EXTRACTION_TIMEOUT_MS),
        ),
      ]);

      // SVG format returns format === 'svg', treat as non-extractable
      if (metadata.format === 'svg') {
        return { width: null, height: null };
      }

      const width = metadata.width;
      const height = metadata.height;

      if (
        width != null &&
        height != null &&
        Number.isInteger(width) &&
        Number.isInteger(height) &&
        width >= 1 &&
        width <= 65535 &&
        height >= 1 &&
        height <= 65535
      ) {
        return { width, height };
      }

      return { width: null, height: null };
    } catch {
      // SVG, corrupt files, timeout → graceful fallback
      return { width: null, height: null };
    }
  }

  private async convertToWebp(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
    // SVG files should not be converted (vector format)
    if (mimeType === 'image/svg+xml') {
      return { buffer, mimeType, extension: '.svg' };
    }

    // Already WebP — keep as-is
    if (mimeType === 'image/webp') {
      return { buffer, mimeType, extension: '.webp' };
    }

    // Only convert supported raster formats
    if (!WEBP_CONVERTIBLE_MIME_TYPES.has(mimeType)) {
      const ext = Object.entries(IMAGE_EXTENSION_MIME_TYPES).find(
        ([, mime]) => mime === mimeType,
      )?.[0];
      return { buffer, mimeType, extension: ext ? `.${ext}` : '' };
    }

    // WebP hard limit: 16,383 × 16,383 px. Cap at 4096px (longest side) for web safety.
    const MAX_WEBP_DIMENSION = 4096;

    try {
      const webpBuffer = await sharp(buffer)
        .resize({
          width: MAX_WEBP_DIMENSION,
          height: MAX_WEBP_DIMENSION,
          fit: 'inside',           // keep aspect ratio, never crop
          withoutEnlargement: true, // don't upscale smaller images
        })
        .webp({ quality: 85 })
        .toBuffer();
      return { buffer: webpBuffer, mimeType: 'image/webp', extension: '.webp' };
    } catch (error) {
      // Conversion failed — fallback to original buffer
      this.logger.warn(
        `WebP conversion failed, keeping original format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      const ext = Object.entries(IMAGE_EXTENSION_MIME_TYPES).find(
        ([, mime]) => mime === mimeType,
      )?.[0];
      return { buffer, mimeType, extension: ext ? `.${ext}` : '' };
    }
  }

  private toMedia(media: any) {
    return {
      id: media.id,
      provider: media.provider,
      providerKey: media.providerKey,
      url: media.url,
      secureUrl: media.secureUrl,
      fileName: media.fileName,
      originalName: media.originalName,
      mimeType: media.mimeType,
      size: media.size,
      width: media.width,
      height: media.height,
      folder: media.folder,
      altText: media.altText,
      title: media.title,
      metadata: media.metadata,
      uploadedBy: media.uploadedBy ?? null,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }

  private async safeUpsertAiIndex(media: MediaWithUploader) {
    if (!media.mimeType.startsWith('image/')) return;

    try {
      await this.mediaAiIndexService.upsertMediaIndex(media);
    } catch (error) {
      this.logger.warn(
        `Failed to update media AI index: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async updateHtmlUrls(oldUrl: string, newUrl: string) {
    try {
      // Products description
      await this.prisma.$executeRaw`
        UPDATE "products" 
        SET "description" = REPLACE("description", ${oldUrl}, ${newUrl}) 
        WHERE "description" LIKE ${`%${oldUrl}%`}
      `;
      
      // Products shortDescription
      await this.prisma.$executeRaw`
        UPDATE "products" 
        SET "shortDescription" = REPLACE("shortDescription", ${oldUrl}, ${newUrl}) 
        WHERE "shortDescription" LIKE ${`%${oldUrl}%`}
      `;

      // BlogPost content
      await this.prisma.$executeRaw`
        UPDATE "blog_posts" 
        SET "content" = REPLACE("content", ${oldUrl}, ${newUrl}) 
        WHERE "content" LIKE ${`%${oldUrl}%`}
      `;

      // Page content
      await this.prisma.$executeRaw`
        UPDATE "pages" 
        SET "content" = REPLACE("content", ${oldUrl}, ${newUrl}) 
        WHERE "content" LIKE ${`%${oldUrl}%`}
      `;
    } catch (error) {
      this.logger.error(
        `Failed to update HTML URLs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
