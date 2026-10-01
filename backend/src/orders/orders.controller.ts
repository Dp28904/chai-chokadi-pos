import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/roles';
import { CreateOrderDto, PayDto, PreviewDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('preview')
  preview(@Body() dto: PreviewDto) {
    return this.orders.preview(dto.lines);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req: { user: { id: number } }) {
    return this.orders.create(dto, req.user.id);
  }

  @Patch(':id/pay')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayDto) {
    return this.orders.pay(id, dto.method);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.orders.cancel(id);
  }

  @Get()
  list(@Query('date') date?: string) {
    return this.orders.list(date);
  }
}
