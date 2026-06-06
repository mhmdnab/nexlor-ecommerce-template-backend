import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VariantPresetsService } from './variant-presets.service';

function makePrisma() {
  return {
    variantPreset: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  } as any;
}

describe('VariantPresetsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: VariantPresetsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new VariantPresetsService(prisma);
  });

  it('trims, drops blanks, and de-dupes options (case-insensitive) on create', async () => {
    prisma.variantPreset.create.mockImplementation(({ data }: any) => ({
      id: 'p1',
      name: data.name,
      options: data.options,
      position: data.position,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
    const result = await service.create({ name: '  Sizes ', options: [' S ', 'M', 'm', '', 'L'] });
    expect(prisma.variantPreset.create).toHaveBeenCalledWith({
      data: { name: 'Sizes', options: ['S', 'M', 'L'], position: 0 },
    });
    expect(result.options).toEqual(['S', 'M', 'L']);
    expect(result.createdAt).toBe(new Date(0).toISOString());
  });

  it('rejects a preset with no usable options', async () => {
    await expect(service.create({ name: 'X', options: ['', '   '] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.variantPreset.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate-name error (P2002) to BadRequest', async () => {
    prisma.variantPreset.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.create({ name: 'Dup', options: ['A'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists presets ordered by position then name', async () => {
    prisma.variantPreset.findMany.mockResolvedValue([
      { id: 'a', name: 'A', options: ['x'], position: 0, createdAt: new Date(0), updatedAt: new Date(0) },
    ]);
    const list = await service.list();
    expect(prisma.variantPreset.findMany).toHaveBeenCalledWith({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', name: 'A', options: ['x'] });
  });

  it('throws NotFound when updating a missing preset', async () => {
    prisma.variantPreset.count.mockResolvedValue(0);
    await expect(service.update('nope', { name: 'N', options: ['A'] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.variantPreset.update).not.toHaveBeenCalled();
  });

  it('deletes an existing preset', async () => {
    prisma.variantPreset.count.mockResolvedValue(1);
    prisma.variantPreset.delete.mockResolvedValue({});
    await expect(service.remove('p1')).resolves.toEqual({ success: true });
    expect(prisma.variantPreset.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
