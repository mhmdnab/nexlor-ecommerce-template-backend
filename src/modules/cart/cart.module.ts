import { Module } from '@nestjs/common';
import { CartSessionService } from './cart-session.service';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  controllers: [CartController],
  providers: [CartService, CartSessionService],
  exports: [CartService, CartSessionService],
})
export class CartModule {}
