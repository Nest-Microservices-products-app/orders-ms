import { Controller, NotImplementedException, ParseUUIDPipe } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { OrderPaginationDto } from './dto/order-paginatnion.dto';
import { OrderStatus } from '@prisma/client';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { firstValueFrom } from 'rxjs';
import { PaidOrderDto } from './dto/paid-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
  async create(@Payload() createOrderDto: CreateOrderDto) {

    const order = await this.ordersService.create(createOrderDto);
  
    const paymentSession = await this.ordersService.createSession(order);
  
    return {
      order,
      paymentSession
    };
  }

  @MessagePattern('findAllOrders')
  findAll(@Payload() paginationDto : OrderPaginationDto ) {
    return this.ordersService.findAll(paginationDto);
  }

  @MessagePattern('findOneOrder')
  findOne(@Payload('id', ParseUUIDPipe ) id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changeOrderStatus')
  changeOrderStatus(
    @Payload() changeOrderStatusDto : ChangeOrderStatusDto
  ) {
    return this.ordersService.changeOrderStatus(changeOrderStatusDto);
  }

  @EventPattern('payment.succeeded')
  paidOrder(@Payload()  paidOrderDto : PaidOrderDto ){
    return this.ordersService.paidOrder(paidOrderDto);
  }
}
