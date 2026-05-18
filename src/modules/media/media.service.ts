import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { MediaProvider, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExternalMediaDto } from './dto/create-external-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { UpdateMediaDto } from './dto/update-media.dto';

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
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListMediaQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, media] = await this.prisma.$transaction([
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({
        where,
        include: this.mediaInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: media.map((item) => this.toMedia(item)),
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

    return this.toMedia(media);
  }

  async createLocal(file: UploadedMediaFile, uploadedById: string, baseUrl: string) {
    this.assertUploadFile(file);

    await mkdir(LOCAL_MEDIA_FOLDER, { recursive: true });

    const extension = this.resolveUploadExtension(file);
    const storedFileName = `${randomUUID()}${extension}`;
    const filePath = join(LOCAL_MEDIA_FOLDER, storedFileName);

    await writeFile(filePath, file.buffer);

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
        mimeType: file.mimetype,
        size: file.size,
        folder: 'uploads',
      },
      include: this.mediaInclude(),
    });

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
    return this.toMedia(await this.getMediaOrThrow(id));
  }

  async update(id: string, updateDto: UpdateMediaDto) {
    await this.getMediaOrThrow(id);
    const data = this.normalizeUpdateInput(updateDto);

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    const media = await this.prisma.media.update({
      where: { id },
      data,
      include: this.mediaInclude(),
    });

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

  private async getMediaOrThrow(id: string) {
    const media = await this.findById(id);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return media;
  }

  private async findById(id: string) {
    return this.prisma.media.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.mediaInclude(),
    });
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

  private toMedia(media: MediaWithUploader) {
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
      uploadedBy: media.uploadedBy,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }
}
