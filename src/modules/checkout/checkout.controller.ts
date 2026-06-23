import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderLookupQueryDto } from './dto/order-lookup-query.dto';

@ApiTags('Checkout')
@Controller()
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create order from active guest cart' })
  checkout(@Body() checkoutDto: CheckoutDto, @Req() req: Request) {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ip = Array.isArray(rawIp) ? rawIp[0] : (rawIp as string | undefined);
    const userAgent = req.headers['user-agent'];

    return this.checkoutService.checkout(checkoutDto, { ip, userAgent });
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
