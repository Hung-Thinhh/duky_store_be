import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettingValueType } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BulkUpsertSettingsDto } from './dto/bulk-upsert-settings.dto';
import { ListSettingsQueryDto } from './dto/list-settings-query.dto';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: ListSettingsQueryDto) {
    const settings = await this.prisma.setting.findMany({
      where: this.buildWhere({ ...query, isPublic: true }),
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });

    return { data: settings, grouped: this.groupSettings(settings) };
  }

  async listAdmin(query: ListSettingsQueryDto) {
    const settings = await this.prisma.setting.findMany({
      where: this.buildWhere(query),
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });

    return { data: settings, grouped: this.groupSettings(settings) };
  }

  async getByKey(key: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { key: key.trim() },
    });

    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    return setting;
  }

  upsert(upsertDto: UpsertSettingDto) {
    const key = upsertDto.key.trim();

    return this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        group: upsertDto.group?.trim() || this.resolveGroup(key),
        value: this.resolveJsonValue(upsertDto.value),
        valueType: upsertDto.valueType ?? this.inferValueType(upsertDto.value),
        isPublic: upsertDto.isPublic ?? false,
        description: this.nullableTrim(upsertDto.description),
      },
      update: {
        group: upsertDto.group?.trim() || this.resolveGroup(key),
        value: this.resolveJsonValue(upsertDto.value),
        valueType: upsertDto.valueType ?? this.inferValueType(upsertDto.value),
        isPublic: upsertDto.isPublic,
        description: this.nullableTrim(upsertDto.description),
      },
    });
  }

  async bulkUpsert(bulkDto: BulkUpsertSettingsDto) {
    const settings: Array<Awaited<ReturnType<SettingsService['upsert']>>> = [];

    for (const setting of bulkDto.settings) {
      settings.push(await this.upsert(setting));
    }

    return { data: settings };
  }

  private buildWhere(query: ListSettingsQueryDto): Prisma.SettingWhereInput {
    const search = query.search?.trim();

    return {
      ...(query.group ? { group: query.group.trim() } : {}),
      ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {}),
      ...(search
        ? {
            OR: [
              { key: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private groupSettings(settings: Array<{ group: string; key: string; value: unknown }>) {
    return settings.reduce<Record<string, Record<string, unknown>>>(
      (grouped, setting) => {
        grouped[setting.group] ??= {};
        grouped[setting.group][setting.key] = setting.value;

        return grouped;
      },
      {},
    );
  }

  private resolveGroup(key: string) {
    return key.includes('.') ? key.split('.')[0] : 'general';
  }

  private inferValueType(value: unknown) {
    if (typeof value === 'boolean') return SettingValueType.BOOLEAN;
    if (typeof value === 'number') return SettingValueType.NUMBER;
    if (typeof value === 'object') return SettingValueType.JSON;
    return SettingValueType.STRING;
  }

  private resolveJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }
}
