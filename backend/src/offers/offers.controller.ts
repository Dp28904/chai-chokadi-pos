import { InvalidateCatalog } from '../catalog/invalidate-catalog.interceptor';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';

const toDate = ({ value }: { value: unknown }) =>
  value === null || value === '' || value === undefined ? null : new Date(value as string);

class OfferDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsEnum({ PERCENT_OFF: 'PERCENT_OFF', FLAT_OFF: 'FLAT_OFF', BUY_X_GET_Y: 'BUY_X_GET_Y' })
  type: 'PERCENT_OFF' | 'FLAT_OFF' | 'BUY_X_GET_Y';
  @IsEnum({ ITEM: 'ITEM', CATEGORY: 'CATEGORY', BILL: 'BILL' })
  scope: 'ITEM' | 'CATEGORY' | 'BILL';
  @IsOptional() @IsInt() targetId?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) value?: number;
  @IsOptional() @IsInt() @Min(0) minBillAmount?: number;
  @IsOptional() @IsInt() @Min(0) minQty?: number;
  @IsOptional() @IsInt() @Min(1) maxDiscount?: number | null;
  @IsOptional() @IsInt() @Min(1) buyQty?: number;
  @IsOptional() @IsInt() @Min(1) getQty?: number;
  // null/'' clears the date (a plain Date conversion would turn null into 1970).
  @IsOptional() @Transform(toDate) @IsDate() startsAt?: Date | null;
  @IsOptional() @Transform(toDate) @IsDate() endsAt?: Date | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

function validate(d: OfferDto) {
  if (d.scope !== 'BILL' && !d.targetId) throw new BadRequestException('Choose the item or category');
  if (d.scope === 'BILL' && d.type === 'BUY_X_GET_Y') {
    throw new BadRequestException('Buy X get Y cannot apply to the whole bill');
  }
  if (d.type === 'PERCENT_OFF' && !((d.value ?? 0) >= 1 && (d.value ?? 0) <= 100)) {
    throw new BadRequestException('Percent must be between 1 and 100');
  }
  if (d.type === 'FLAT_OFF' && !((d.value ?? 0) > 0)) {
    throw new BadRequestException('Enter the discount amount');
  }
  if (d.type === 'BUY_X_GET_Y' && (!d.buyQty || !d.getQty)) {
    throw new BadRequestException('Enter both buy and get quantities');
  }
  if (d.startsAt && d.endsAt && d.startsAt > d.endsAt) {
    throw new BadRequestException('Start must be before end');
  }
}

@UseInterceptors(InvalidateCatalog)
@Controller('offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OffersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.offer.findMany({ orderBy: { id: 'desc' } });
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: OfferDto) {
    validate(dto);
    return this.prisma.offer.create({
      data: { ...dto, targetId: dto.scope === 'BILL' ? null : dto.targetId },
    });
  }

  @Put(':id')
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: OfferDto) {
    validate(dto);
    return this.prisma.offer.update({
      where: { id },
      data: { ...dto, targetId: dto.scope === 'BILL' ? null : dto.targetId },
    });
  }

  // Past bills reference offers, so "delete" just switches them off.
  @Delete(':id')
  @Roles('ADMIN')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.offer.update({ where: { id }, data: { isActive: false } });
  }
}
