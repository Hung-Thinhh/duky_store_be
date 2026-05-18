import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderLookupQueryDto } from './dto/order-lookup-query.dto';

@ApiTags('Checkout')
@Controller()
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create order from active guest cart' })
  checkout(@Body() checkoutDto: CheckoutDto) {
    return this.checkoutService.checkout(checkoutDto);
  }

  @Get('orders/:code')
  @ApiOperation({ summary: 'Look up public order by code and phone' })
  @ApiParam({ name: 'code' })
  getOrderByCode(
    @Param('code') code: string,
    @Query() query: OrderLookupQueryDto,
  ) {
    return this.checkoutService.getPublicOrder(code, query.phone);
  }
}
