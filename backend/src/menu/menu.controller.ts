import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryDto, ComboDto, ItemDto } from './menu.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuController {
  constructor(private readonly prisma: PrismaService) {}

  // ---- categories ----
  @Get('categories')
  categories() {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  @Post('categories')
  @Roles('ADMIN')
  createCategory(@Body() dto: CategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  @Put('categories/:id')
  @Roles('ADMIN')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: CategoryDto) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  @Delete('categories/:id')
  @Roles('ADMIN')
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    const [items, combos] = await Promise.all([
      this.prisma.item.count({ where: { categoryId: id } }),
      this.prisma.combo.count({ where: { choiceCategoryId: id } }),
    ]);
    if (items || combos) {
      throw new ConflictException('Move or delete its items (and combos that pick from it) first');
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- items ----
  @Get('items')
  items() {
    return this.prisma.item.findMany({ orderBy: [{ categoryId: 'asc' }, { id: 'asc' }] });
  }

  @Post('items')
  @Roles('ADMIN')
  createItem(@Body() dto: ItemDto) {
    return this.prisma.item.create({ data: dto });
  }

  @Put('items/:id')
  @Roles('ADMIN')
  updateItem(@Param('id', ParseIntPipe) id: number, @Body() dto: ItemDto) {
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  // Items are soft-deleted (hidden) so past bills keep their references.
  @Delete('items/:id')
  @Roles('ADMIN')
  deactivateItem(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.item.update({ where: { id }, data: { isActive: false } });
  }

  // ---- combos ----
  @Get('combos')
  combos() {
    return this.prisma.combo.findMany({
      include: { items: true },
      orderBy: { id: 'asc' },
    });
  }

  @Post('combos')
  @Roles('ADMIN')
  createCombo(@Body() dto: ComboDto) {
    const { items, ...rest } = normaliseCombo(dto);
    return this.prisma.combo.create({
      data: { ...rest, items: { create: items } },
      include: { items: true },
    });
  }

  @Put('combos/:id')
  @Roles('ADMIN')
  async updateCombo(@Param('id', ParseIntPipe) id: number, @Body() dto: ComboDto) {
    const { items, ...rest } = normaliseCombo(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.comboItem.deleteMany({ where: { comboId: id } });
      return tx.combo.update({
        where: { id },
        data: { ...rest, items: { create: items } },
        include: { items: true },
      });
    });
  }

  @Delete('combos/:id')
  @Roles('ADMIN')
  deactivateCombo(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.combo.update({ where: { id }, data: { isActive: false } });
  }
}

/** A combo is either fixed items, or "pick N from a category" - never both. */
function normaliseCombo(dto: ComboDto): ComboDto {
  if (dto.choiceCategoryId) {
    if (!dto.choiceQty) throw new BadRequestException('Enter how many items the customer picks');
    return { ...dto, items: [] };
  }
  if (!dto.items.length) throw new BadRequestException('Add at least one item to the combo');
  return { ...dto, choiceCategoryId: null, choiceQty: null };
}
