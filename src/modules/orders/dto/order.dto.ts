import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class AddressDto {
  @IsString() @MinLength(1) fullName!: string;
  @IsString() @MinLength(1) line1!: string;
  @IsOptional() @IsString() line2?: string;
  @IsString() @MinLength(1) city!: string;
  @IsOptional() @IsString() region?: string;
  @IsString() @MinLength(1) postalCode!: string;
  @IsString() @MinLength(2) country!: string;
  @IsOptional() @IsString() phone?: string;
}

export class CheckoutDto {
  @ApiProperty({ example: 'buyer@example.com' })
  @IsEmail()
  email!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress!: AddressDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress?: AddressDto;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

export class AdminOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Search order number or email.' })
  @IsOptional()
  @IsString()
  q?: string;
}
