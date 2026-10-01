import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  // Used by the counter to autofill the name for repeat customers.
  @Get('by-phone/:phone')
  async byPhone(@Param('phone') phone: string) {
    const digits = phone.replace(/\D/g, '').slice(-10);
    return (await this.prisma.customer.findUnique({ where: { phone: digits } })) ?? null;
  }
}
