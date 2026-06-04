/**
 * Seed script — idempotent-ish demo data for the template.
 *
 *   npm run db:seed
 *
 * Creates: 1 super admin, 1 admin, 1 customer, 4 categories, ~20 products
 * (variants + images), ~10 orders across statuses, 2 coupons, store settings.
 *
 * All money is in cents. Deterministic (no Math.random) so reseeds are stable.
 */
import { PrismaClient, OrderStatus, ProductStatus, CouponType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';

// Small deterministic PRNG so seeds are repeatable across machines.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

function img(seed: string) {
  return `https://picsum.photos/seed/${seed}/900/1100`;
}

const CATEGORIES = [
  { slug: 'apparel', name: 'Apparel' },
  { slug: 'footwear', name: 'Footwear' },
  { slug: 'accessories', name: 'Accessories' },
  { slug: 'home', name: 'Home & Living' },
] as const;

// 20 products spread across the 4 categories. Prices in cents.
const PRODUCTS: Array<{
  slug: string;
  name: string;
  category: string;
  price: number;
  variants: Array<{ name: string; sku: string; priceOverride?: number; stock: number }>;
}> = [
  { slug: 'merino-crew-sweater', name: 'Merino Crew Sweater', category: 'apparel', price: 12900, variants: [
    { name: 'S', sku: 'APP-MCS-S', stock: 12 }, { name: 'M', sku: 'APP-MCS-M', stock: 20 }, { name: 'L', sku: 'APP-MCS-L', stock: 8 }, { name: 'XL', sku: 'APP-MCS-XL', stock: 0 } ] },
  { slug: 'organic-cotton-tee', name: 'Organic Cotton Tee', category: 'apparel', price: 3500, variants: [
    { name: 'S', sku: 'APP-OCT-S', stock: 40 }, { name: 'M', sku: 'APP-OCT-M', stock: 55 }, { name: 'L', sku: 'APP-OCT-L', stock: 30 } ] },
  { slug: 'linen-overshirt', name: 'Linen Overshirt', category: 'apparel', price: 8900, variants: [
    { name: 'M', sku: 'APP-LOS-M', stock: 14 }, { name: 'L', sku: 'APP-LOS-L', stock: 9 } ] },
  { slug: 'tailored-chino', name: 'Tailored Chino', category: 'apparel', price: 7400, variants: [
    { name: '30', sku: 'APP-TCH-30', stock: 10 }, { name: '32', sku: 'APP-TCH-32', stock: 18 }, { name: '34', sku: 'APP-TCH-34', stock: 6 } ] },
  { slug: 'quilted-liner-jacket', name: 'Quilted Liner Jacket', category: 'apparel', price: 16500, variants: [
    { name: 'M', sku: 'APP-QLJ-M', stock: 7 }, { name: 'L', sku: 'APP-QLJ-L', stock: 3 } ] },

  { slug: 'runner-knit-sneaker', name: 'Runner Knit Sneaker', category: 'footwear', price: 11900, variants: [
    { name: '40', sku: 'FW-RKS-40', stock: 9 }, { name: '41', sku: 'FW-RKS-41', stock: 12 }, { name: '42', sku: 'FW-RKS-42', stock: 15 }, { name: '43', sku: 'FW-RKS-43', stock: 4 } ] },
  { slug: 'leather-chelsea-boot', name: 'Leather Chelsea Boot', category: 'footwear', price: 19900, variants: [
    { name: '41', sku: 'FW-LCB-41', stock: 6 }, { name: '42', sku: 'FW-LCB-42', stock: 5 }, { name: '43', sku: 'FW-LCB-43', stock: 2 } ] },
  { slug: 'canvas-low-top', name: 'Canvas Low Top', category: 'footwear', price: 6500, variants: [
    { name: '40', sku: 'FW-CLT-40', stock: 22 }, { name: '41', sku: 'FW-CLT-41', stock: 18 }, { name: '42', sku: 'FW-CLT-42', stock: 0 } ] },
  { slug: 'trail-hiking-shoe', name: 'Trail Hiking Shoe', category: 'footwear', price: 14500, variants: [
    { name: '42', sku: 'FW-THS-42', stock: 11 }, { name: '43', sku: 'FW-THS-43', stock: 9 } ] },
  { slug: 'suede-loafer', name: 'Suede Loafer', category: 'footwear', price: 13500, variants: [
    { name: '41', sku: 'FW-SLF-41', stock: 7 }, { name: '42', sku: 'FW-SLF-42', stock: 10 } ] },

  { slug: 'full-grain-belt', name: 'Full-Grain Leather Belt', category: 'accessories', price: 5900, variants: [
    { name: 'M', sku: 'ACC-FGB-M', stock: 25 }, { name: 'L', sku: 'ACC-FGB-L', stock: 17 } ] },
  { slug: 'wool-beanie', name: 'Ribbed Wool Beanie', category: 'accessories', price: 2900, variants: [
    { name: 'One Size', sku: 'ACC-RWB-OS', stock: 60 } ] },
  { slug: 'canvas-tote', name: 'Heavy Canvas Tote', category: 'accessories', price: 4500, variants: [
    { name: 'One Size', sku: 'ACC-HCT-OS', stock: 35 } ] },
  { slug: 'minimal-watch', name: 'Minimal Field Watch', category: 'accessories', price: 18900, variants: [
    { name: 'Black', sku: 'ACC-MFW-BK', stock: 8 }, { name: 'Silver', sku: 'ACC-MFW-SV', stock: 5 } ] },
  { slug: 'cashmere-scarf', name: 'Cashmere Scarf', category: 'accessories', price: 7900, variants: [
    { name: 'Charcoal', sku: 'ACC-CSF-CH', stock: 14 }, { name: 'Camel', sku: 'ACC-CSF-CM', stock: 9 } ] },

  { slug: 'stoneware-mug-set', name: 'Stoneware Mug Set (4)', category: 'home', price: 4900, variants: [
    { name: 'Sand', sku: 'HM-SMS-SD', stock: 20 }, { name: 'Slate', sku: 'HM-SMS-SL', stock: 16 } ] },
  { slug: 'linen-throw-blanket', name: 'Linen Throw Blanket', category: 'home', price: 8900, variants: [
    { name: 'Natural', sku: 'HM-LTB-NT', stock: 12 }, { name: 'Olive', sku: 'HM-LTB-OL', stock: 7 } ] },
  { slug: 'soy-candle-trio', name: 'Soy Candle Trio', category: 'home', price: 3900, variants: [
    { name: 'One Size', sku: 'HM-SCT-OS', stock: 44 } ] },
  { slug: 'ceramic-vase', name: 'Hand-Thrown Ceramic Vase', category: 'home', price: 6900, variants: [
    { name: 'Small', sku: 'HM-HCV-S', stock: 10 }, { name: 'Large', sku: 'HM-HCV-L', stock: 6 } ] },
  { slug: 'wool-area-rug', name: 'Hand-Loomed Wool Rug', category: 'home', price: 24900, variants: [
    { name: '5x7', sku: 'HM-WAR-57', stock: 4 }, { name: '8x10', sku: 'HM-WAR-810', stock: 2 } ] },
];

async function main() {
  console.log('🌱 Seeding…');

  // Clean slate (respects FK order via cascades on most relations).
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
  await prisma.storeSetting.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ----- Users -----
  const owner = await prisma.user.create({
    data: { email: 'owner@nexlor.test', name: 'Nexlor Owner', role: Role.SUPER_ADMIN, passwordHash },
  });
  const admin = await prisma.user.create({
    data: { email: 'admin@nexlor.test', name: 'Store Admin', role: Role.ADMIN, passwordHash },
  });
  const customer = await prisma.user.create({
    data: { email: 'customer@nexlor.test', name: 'Casey Customer', role: Role.CUSTOMER, passwordHash },
  });
  await prisma.address.create({
    data: {
      userId: customer.id, label: 'Home', fullName: 'Casey Customer', line1: '12 Market St',
      city: 'Austin', region: 'TX', postalCode: '78701', country: 'US', isDefault: true,
    },
  });
  console.log(`  • users: ${owner.email}, ${admin.email}, ${customer.email}`);

  // ----- Categories -----
  const categoryBySlug: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await prisma.category.create({ data: { slug: c.slug, name: c.name, position: i } });
    categoryBySlug[c.slug] = cat.id;
  }
  console.log(`  • categories: ${CATEGORIES.length}`);

  // ----- Products -----
  const createdVariants: Array<{ variantId: string; productName: string; sku: string; name: string; price: number; imageUrl: string }> = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const product = await prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        description:
          `${p.name} — crafted for everyday wear with a considered, minimal silhouette. ` +
          `Durable materials, quiet details, and a fit that lasts. Part of the ${p.category} collection.`,
        basePrice: p.price,
        status: ProductStatus.ACTIVE,
        images: {
          create: [
            { url: img(`${p.slug}-1`), alt: `${p.name} — front`, position: 0 },
            { url: img(`${p.slug}-2`), alt: `${p.name} — detail`, position: 1 },
            { url: img(`${p.slug}-3`), alt: `${p.name} — alt`, position: 2 },
          ],
        },
        variants: {
          create: p.variants.map((v, vi) => ({
            name: v.name, sku: v.sku, priceOverride: v.priceOverride ?? null, stock: v.stock, position: vi,
          })),
        },
        categories: { create: [{ categoryId: categoryBySlug[p.category] }] },
      },
      include: { variants: true, images: true },
    });

    for (const v of product.variants) {
      createdVariants.push({
        variantId: v.id,
        productName: product.name,
        sku: v.sku,
        name: v.name,
        price: v.priceOverride ?? product.basePrice,
        imageUrl: product.images[0]?.url ?? '',
      });
    }

    // Mark a couple as DRAFT/ARCHIVED to exercise admin filters.
    if (i === 4) await prisma.product.update({ where: { id: product.id }, data: { status: ProductStatus.DRAFT } });
    if (i === 9) await prisma.product.update({ where: { id: product.id }, data: { status: ProductStatus.ARCHIVED } });
  }
  console.log(`  • products: ${PRODUCTS.length} (with variants + images)`);

  // ----- Coupons -----
  await prisma.coupon.createMany({
    data: [
      { code: 'WELCOME10', type: CouponType.PERCENT, value: 10, active: true, minSubtotal: 5000 },
      { code: 'SHIP500', type: CouponType.FIXED, value: 500, active: true, usageLimit: 100, usedCount: 7 },
    ],
  });
  console.log('  • coupons: WELCOME10, SHIP500');

  // ----- Orders (~10) across statuses -----
  const statuses: OrderStatus[] = [
    OrderStatus.PAID, OrderStatus.PAID, OrderStatus.FULFILLED, OrderStatus.FULFILLED,
    OrderStatus.PENDING, OrderStatus.PENDING, OrderStatus.CANCELLED, OrderStatus.REFUNDED,
    OrderStatus.PAID, OrderStatus.FULFILLED,
  ];
  const orderChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < statuses.length; i++) {
    const lineCount = between(1, 3);
    const items = Array.from({ length: lineCount }, () => {
      const v = pick(createdVariants);
      const quantity = between(1, 2);
      return {
        variantId: v.variantId,
        productName: v.productName,
        variantName: v.name,
        sku: v.sku,
        unitPrice: v.price,
        quantity,
        lineTotal: v.price * quantity,
        imageUrl: v.imageUrl,
      };
    });
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const shipping = subtotal >= 7500 ? 0 : 500;
    const tax = Math.round(subtotal * 0.08);
    const total = subtotal + shipping + tax;
    let orderNumber = 'NEX-';
    for (let k = 0; k < 6; k++) orderNumber += orderChars[Math.floor(rand() * orderChars.length)];

    // Spread createdAt across the last ~40 days for the revenue chart.
    const createdAt = new Date(Date.now() - between(0, 40) * 24 * 60 * 60 * 1000);

    await prisma.order.create({
      data: {
        orderNumber,
        userId: i % 3 === 0 ? customer.id : null,
        email: i % 3 === 0 ? customer.email : `guest${i}@example.com`,
        status: statuses[i],
        subtotal,
        discount: 0,
        shipping,
        tax,
        total,
        currency: 'USD',
        shippingAddress: {
          fullName: 'Casey Customer', line1: '12 Market St', city: 'Austin',
          region: 'TX', postalCode: '78701', country: 'US',
        },
        createdAt,
        items: { create: items },
      },
    });
  }
  console.log(`  • orders: ${statuses.length}`);

  // ----- Store settings (branding / commerce / shipping) -----
  await prisma.storeSetting.createMany({
    data: [
      {
        key: 'branding',
        value: { storeName: 'Nexlor', logoUrl: '/brand/logo.svg', brandColor: '#4f46e5', tagline: 'Considered goods for everyday life.' },
      },
      {
        key: 'commerce',
        value: { currency: 'USD', taxRatePercent: 8, taxInclusive: false },
      },
      {
        key: 'shipping',
        value: { flatRate: 500, freeShippingThreshold: 7500 },
      },
    ],
  });
  console.log('  • store settings: branding, commerce, shipping');

  console.log('✅ Seed complete.');
  console.log(`   Logins (password "${PASSWORD}"): owner@nexlor.test, admin@nexlor.test, customer@nexlor.test`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
