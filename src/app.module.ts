import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { VariantPresetsModule } from './modules/variant-presets/variant-presets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    VariantPresetsModule,
    UploadsModule,
    CouponsModule,
    CartModule,
    OrdersModule,
    DashboardModule,
  ],
  providers: [
    // Global auth: every route requires a valid token unless @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global role enforcement: only acts where @Roles() is present.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Consistent error envelope.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
