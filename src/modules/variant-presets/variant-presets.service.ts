import { ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateVariantPresetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  options!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;
}

export class UpdateVariantPresetDto extends CreateVariantPresetDto {}

export interface VariantPresetDto {
  id: string;
  name: string;
  options: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface VariantPresetRow {
  id: string;
  name: string;
  options: string[];
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class VariantPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Trim, drop blanks, de-dupe (case-insensitive) while preserving order. */
  private cleanOptions(options: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of options) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    if (out.length === 0) {
      throw new BadRequestException('A preset needs at least one option label.');
    }
    return out;
  }

  async list(): Promise<VariantPresetDto[]> {
    const rows = await this.prisma.variantPreset.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(dto: CreateVariantPresetDto): Promise<VariantPresetDto> {
    const options = this.cleanOptions(dto.options);
    const row = await this.prisma.variantPreset.create({
      data: { name: dto.name.trim(), options, position: dto.position ?? 0 },
    });
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateVariantPresetDto): Promise<VariantPresetDto> {
    await this.ensureExists(id);
    const options = this.cleanOptions(dto.options);
    const row = await this.prisma.variantPreset.update({
      where: { id },
      data: { name: dto.name.trim(), options, position: dto.position },
    });
    return this.toDto(row);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.variantPreset.delete({ where: { id } });
    return { success: true };
  }

  private toDto(r: VariantPresetRow): VariantPresetDto {
    return {
      id: r.id,
      name: r.name,
      options: r.options,
      position: r.position,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.variantPreset.count({ where: { id } });
    if (!exists) throw new NotFoundException('Variant preset not found.');
  }
}
