import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartSessionQueryDto } from './dto/cart-session-query.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get active guest cart by session' })
  getCart(@Query() query: CartSessionQueryDto) {
    return this.cartService.getOrCreateCart(query.sessionId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add product or variant to cart' })
  addItem(@Body() addDto: AddCartItemDto) {
    return this.cartService.addItem(addDto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'id' })
  updateItem(@Param('id') id: string, @Body() updateDto: UpdateCartItemDto) {
    return this.cartService.updateItem(id, updateDto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'id' })
  removeItem(@Param('id') id: string, @Query() query: CartSessionQueryDto) {
    return this.cartService.removeItem(id, query.sessionId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear active cart' })
  clearCart(@Query() query: CartSessionQueryDto) {
    return this.cartService.clearCart(query.sessionId);
  }
}
