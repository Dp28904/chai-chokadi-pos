import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartLineDto {
  @IsOptional() @IsInt() itemId?: number;
  @IsOptional() @IsInt() comboId?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) @ArrayMaxSize(10) choiceItemIds?: number[];
  @IsInt() @Min(1) @Max(999) qty: number;
}

export class PreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines: CartLineDto[];
}

export class CreateOrderDto extends PreviewDto {
  @IsString()
  @Length(1, 80)
  @Transform(({ value }) => String(value).trim())
  customerName: string;

  @Transform(({ value }) => String(value).replace(/\D/g, '').slice(-10))
  @Matches(/^\d{10}$/, { message: 'Phone must be a 10-digit number' })
  phone: string;

  /** Random id made by the device for this checkout; makes retries safe. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  clientRef?: string;
}

export class ServedDto {
  @IsBoolean() served: boolean;
}

export class PayDto {
  @IsEnum({ CASH: 'CASH', ONLINE: 'ONLINE' }) method: 'CASH' | 'ONLINE';
}
