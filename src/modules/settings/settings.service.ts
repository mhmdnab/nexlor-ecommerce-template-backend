import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Typed shapes for the key/value StoreSetting store. */
export interface BrandingSettings {
  storeName: string;
  logoUrl: string;
  brandColor: string;
  tagline: string;
}
export interface CommerceSettings {
  currency: string;
  taxRatePercent: number;
  taxInclusive: boolean;
}
export interface ShippingSettings {
  flatRate: number; // cents
  freeShippingThreshold: number; // cents
}

export interface StoreSettings {
  branding: BrandingSettings;
  commerce: CommerceSettings;
  shipping: ShippingSettings;
}

// Defaults make the template work before any settings row exists.
const DEFAULTS: StoreSettings = {
  branding: { storeName: 'Nexlor', logoUrl: '/brand/logo.svg', brandColor: '#4f46e5', tagline: 'Considered goods for everyday life.' },
  commerce: { currency: 'USD', taxRatePercent: 8, taxInclusive: false },
  shipping: { flatRate: 500, freeShippingThreshold: 7500 },
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<StoreSettings> {
    const rows = await this.prisma.storeSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
      branding: { ...DEFAULTS.branding, ...(byKey.get('branding') as object | undefined) },
      commerce: { ...DEFAULTS.commerce, ...(byKey.get('commerce') as object | undefined) },
      shipping: { ...DEFAULTS.shipping, ...(byKey.get('shipping') as object | undefined) },
    };
  }

  async getCommerce(): Promise<CommerceSettings> {
    return (await this.getAll()).commerce;
  }

  async getShipping(): Promise<ShippingSettings> {
    return (await this.getAll()).shipping;
  }

  async update<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]): Promise<StoreSettings> {
    await this.prisma.storeSetting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
    return this.getAll();
  }

  /** Compute shipping for a subtotal using current settings. */
  async shippingFor(subtotal: number): Promise<number> {
    const s = await this.getShipping();
    return subtotal >= s.freeShippingThreshold ? 0 : s.flatRate;
  }

  /** Compute tax for a taxable amount using current settings (cents). */
  async taxFor(taxable: number): Promise<number> {
    const c = await this.getCommerce();
    if (c.taxInclusive) return 0;
    return Math.round((taxable * c.taxRatePercent) / 100);
  }
}
