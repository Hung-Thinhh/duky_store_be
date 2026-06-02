import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { MediaProvider, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExternalGalleryDto } from './dto/create-external-gallery.dto';
import { ListGalleryQueryDto } from './dto/list-gallery-query.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { UploadGalleryMetadataDto } from './dto/upload-gallery-metadata.dto';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const LOCAL_GALLERY_FOLDER = join(process.cwd(), 'uploads', 'gallery');

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

type GalleryImageWithUploader = NonNullable<
  Awaited<ReturnType<GalleryService['findById']>>
>;

type UploadedMediaFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);
  private r2Client?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async list(query: ListGalleryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, galleryImages] = await this.prisma.$transaction([
      this.prisma.galleryImage.count({ where }),
      this.prisma.galleryImage.findMany({
        where,
        include: this.galleryInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: galleryImages.map((item) => this.toGalleryImage(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listPublic(forMale?: boolean) {
    const where: Prisma.GalleryImageWhereInput = {
      deletedAt: null,
    };

    if (forMale !== undefined) {
      where.forMale = forMale;
    }

    const galleryImages = await this.prisma.galleryImage.findMany({
      where,
      include: this.galleryInclude(),
      orderBy: { createdAt: 'desc' },
    });

    // Match the frontend's expected schema: { id, src, alt, forMale }
    return galleryImages.map((item) => ({
      id: item.id,
      src: item.url,
      alt: item.altText ?? item.title ?? item.fileName,
      forMale: item.forMale,
    }));
  }

  async createExternal(
    createDto: CreateExternalGalleryDto,
    uploadedById: string,
  ) {
    const normalized = this.normalizeCreateInput(createDto);
    const galleryImage = await this.prisma.galleryImage.create({
      data: {
        provider: MediaProvider.EXTERNAL,
        uploadedById,
        ...normalized,
      },
      include: this.galleryInclude(),
    });

    return this.toGalleryImage(galleryImage);
  }

  async createLocal(file: UploadedMediaFile, uploadedById: string, baseUrl: string, metadata?: UploadGalleryMetadataDto) {
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

      const galleryImage = await this.prisma.galleryImage.create({
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
          forMale: metadata?.forMale,
        },
        include: this.galleryInclude(),
      });

      return this.toGalleryImage(galleryImage);
    }

    await mkdir(LOCAL_GALLERY_FOLDER, { recursive: true });

    const filePath = join(LOCAL_GALLERY_FOLDER, storedFileName);

    // Write the converted buffer (or original if SVG/already WebP)
    await writeFile(filePath, converted.buffer);

    const url = `${baseUrl}/api/v1/gallery/files/${storedFileName}`;
    const galleryImage = await this.prisma.galleryImage.create({
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
        folder: 'gallery',
        altText: metadata?.altText?.trim() || null,
        title: metadata?.title?.trim() || null,
        forMale: metadata?.forMale,
      },
      include: this.galleryInclude(),
    });

    return this.toGalleryImage(galleryImage);
  }

  async createLocalMany(
    files: UploadedMediaFile[],
    uploadedById: string,
    baseUrl: string,
  ) {
    const uploaded: Awaited<ReturnType<GalleryService['createLocal']>>[] = [];

    for (const file of files) {
      uploaded.push(await this.createLocal(file, uploadedById, baseUrl));
    }

    return uploaded;
  }

  async getById(id: string) {
    return this.toGalleryImage(await this.getGalleryImageOrThrow(id));
  }

  async update(id: string, updateDto: UpdateGalleryDto) {
    const existing = await this.getGalleryImageOrThrow(id);
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
      const oldFilePath = join(LOCAL_GALLERY_FOLDER, existing.providerKey);

      // Add short random suffix to avoid collisions: slug-a3f2.webp
      const ext = extname(newFileName) || extname(existing.providerKey || '');
      const nameWithoutExt = newFileName.replace(/\.[^.]+$/, '');
      const suffix = randomUUID().substring(0, 4);
      const finalFileName = `${nameWithoutExt}-${suffix}${ext}`;
      const newFilePath = join(LOCAL_GALLERY_FOLDER, finalFileName);

      try {
        await rename(oldFilePath, newFilePath);

        // Update URL, providerKey, and fileName to reflect the new file name
        const baseUrl = existing.url.replace(`/api/v1/gallery/files/${existing.providerKey}`, '');
        const newUrl = `${baseUrl}/api/v1/gallery/files/${finalFileName}`;

        data.providerKey = finalFileName;
        data.fileName = finalFileName;
        data.url = newUrl;
        data.secureUrl = newUrl;
      } catch (err) {
        this.logger.warn(`Failed to rename gallery file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    const galleryImage = await this.prisma.galleryImage.update({
      where: { id },
      data,
      include: this.galleryInclude(),
    });

    return this.toGalleryImage(galleryImage);
  }

  async remove(id: string) {
    await this.getGalleryImageOrThrow(id);
    await this.prisma.galleryImage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private buildWhere(query: ListGalleryQueryDto): Prisma.GalleryImageWhereInput {
    const where: Prisma.GalleryImageWhereInput = {
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

    if (query.forMale !== undefined) {
      where.forMale = query.forMale;
    }

    return where;
  }

  private normalizeCreateInput(
    createDto: CreateExternalGalleryDto,
  ): Prisma.GalleryImageUncheckedCreateInput {
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
      forMale: createDto.forMale,
    };
  }

  private normalizeUpdateInput(
    updateDto: UpdateGalleryDto,
  ): Prisma.GalleryImageUncheckedUpdateInput {
    const data: Prisma.GalleryImageUncheckedUpdateInput = {};
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

    if (updateDto.forMale !== undefined) {
      data.forMale = updateDto.forMale;
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

    return this.getUrlFileName(url) ?? 'external-gallery-image';
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
    return (this.configService.get<string>('R2_PREFIX') || 'gallery')
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

  private async getGalleryImageOrThrow(id: string) {
    const galleryImage = await this.findById(id);

    if (!galleryImage) {
      throw new NotFoundException('Gallery image not found');
    }

    return galleryImage;
  }

  private async findById(id: string) {
    return this.prisma.galleryImage.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.galleryInclude(),
    });
  }

  private galleryInclude() {
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
      return { width: null, height: null };
    }
  }

  private async convertToWebp(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
    if (mimeType === 'image/svg+xml') {
      return { buffer, mimeType, extension: '.svg' };
    }

    if (mimeType === 'image/webp') {
      return { buffer, mimeType, extension: '.webp' };
    }

    if (!WEBP_CONVERTIBLE_MIME_TYPES.has(mimeType)) {
      const ext = Object.entries(IMAGE_EXTENSION_MIME_TYPES).find(
        ([, mime]) => mime === mimeType,
      )?.[0];
      return { buffer, mimeType, extension: ext ? `.${ext}` : '' };
    }

    try {
      const webpBuffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();
      return { buffer: webpBuffer, mimeType: 'image/webp', extension: '.webp' };
    } catch (error) {
      this.logger.warn(
        `WebP conversion failed, keeping original format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      const ext = Object.entries(IMAGE_EXTENSION_MIME_TYPES).find(
        ([, mime]) => mime === mimeType,
      )?.[0];
      return { buffer, mimeType, extension: ext ? `.${ext}` : '' };
    }
  }

  private toGalleryImage(galleryImage: GalleryImageWithUploader) {
    return {
      id: galleryImage.id,
      provider: galleryImage.provider,
      providerKey: galleryImage.providerKey,
      url: galleryImage.url,
      secureUrl: galleryImage.secureUrl,
      fileName: galleryImage.fileName,
      originalName: galleryImage.originalName,
      mimeType: galleryImage.mimeType,
      size: galleryImage.size,
      width: galleryImage.width,
      height: galleryImage.height,
      folder: galleryImage.folder,
      altText: galleryImage.altText,
      title: galleryImage.title,
      metadata: galleryImage.metadata,
      forMale: galleryImage.forMale,
      uploadedBy: galleryImage.uploadedBy,
      createdAt: galleryImage.createdAt,
      updatedAt: galleryImage.updatedAt,
    };
  }
}
