import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const ttls: Record<string, number> = { JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 2592000 };
const config = {
  get: (key: string) => ttls[key] ?? `secret-${key}`,
} as any;

const jwt = {
  signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  verifyAsync: jest.fn(),
} as any;

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    ...overrides,
  } as any;
}

describe('AuthService', () => {
  it('register rejects a duplicate email', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const service = new AuthService(prisma, jwt, config);

    await expect(
      service.register({ email: 'a@b.com', name: 'A', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('register hashes the password and issues tokens', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: 'u1',
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      role: Role.CUSTOMER,
      createdAt: new Date(),
    }));
    const service = new AuthService(prisma, jwt, config);

    const { user, tokens } = await service.register({
      email: 'New@Example.com',
      name: 'New',
      password: 'Password123!',
    });

    // Email normalized, password never stored in plaintext.
    expect(user.email).toBe('new@example.com');
    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.passwordHash).not.toBe('Password123!');
    expect(await bcrypt.compare('Password123!', created.passwordHash)).toBe(true);
    expect(tokens.accessToken).toBeTruthy();
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('login rejects an unknown user without leaking which half is wrong', async () => {
    const prisma = makePrisma();
    const service = new AuthService(prisma, jwt, config);
    await expect(
      service.login({ email: 'nobody@example.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login rejects a wrong password', async () => {
    const prisma = makePrisma();
    const passwordHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A', role: Role.CUSTOMER, passwordHash, createdAt: new Date(),
    });
    const service = new AuthService(prisma, jwt, config);

    await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('login succeeds with correct credentials', async () => {
    const prisma = makePrisma();
    const passwordHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A', role: Role.CUSTOMER, passwordHash, createdAt: new Date(),
    });
    const service = new AuthService(prisma, jwt, config);

    const { user, tokens } = await service.login({ email: 'a@b.com', password: 'correct-password' });
    expect(user.id).toBe('u1');
    expect(tokens.refreshToken).toBeTruthy();
  });
});
