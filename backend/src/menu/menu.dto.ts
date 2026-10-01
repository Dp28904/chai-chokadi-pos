import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(40) name: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class ItemDto {
  @IsInt() categoryId: number;
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(160) description?: string;
  @IsInt() @Min(0) @Max(10_000_000) price: number; // paise
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFavourite?: boolean;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsInt() @Min(0) lowStockAt?: number;
}

export class ComboItemDto {
  @IsInt() itemId: number;
  @IsInt() @Min(1) qty: number;
}

export class ComboDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(160) description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsInt() @Min(0) @Max(10_000_000) price: number; // paise
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() choiceCategoryId?: number | null;
  @IsOptional() @IsInt() @Min(1) choiceQty?: number | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  items: ComboItemDto[];
}
