import { BadRequestException, HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { OrderPaginationDto } from './dto/order-paginatnion.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config/services';
import { catchError, firstValueFrom } from 'rxjs';
import { OrderWithProducts } from './interfaces/order-with-products.interface';
import { PaidOrderDto } from './dto/paid-order.dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  
  
  private readonly logger = new Logger('OrderService')

  constructor(
    @Inject(NATS_SERVICE) private readonly client : ClientProxy
  ) {
    super();
  }

  async onModuleInit() {
    this.$connect();
    this.logger.log('Databse connected');
  }
  
  
  async create(createOrderDto: CreateOrderDto) {

    // const order = await this.order.create({
    //   data : createOrderDto
    // })

    try {
      
      // 1.Confirmar productos
      const ids = createOrderDto.items.map( x => x.productId )
      const products = await firstValueFrom(
        this.client.send({cmd : 'validate_products'}, ids )
      );

      // 2.Calculos de los valores

      const totalAmount = createOrderDto.items.reduce(( acc, orderItem ) => {
        const price = products.find( product => product.id === orderItem.productId ).price;
        return acc + price * orderItem.quantity;
      }, 0)

      const totalItems = createOrderDto.items.reduce(( acc, orderItem) => {
        return acc + orderItem.quantity
      }, 0)

      // 3.Crear transaccion de base de datos

      const order = await this.order.create({
        data : {
          totalAmount,
          totalItems,
          OrderItem : {
            createMany : {
              data : createOrderDto.items.map( item => {
                return {
                  price : products.find( product => product.id === item.productId ).price,
                  quantity : item.quantity,
                  productId : item.productId
                }
              })
            }
          }
        },
        include : {
          OrderItem : {
            select : {
              price : true,
              quantity : true,
              productId : true
            }
          }
        }
      })


      return {
        ...order,
        OrderItem: order.OrderItem.map( (orderItem) => ({
          ...orderItem,
          name : products.find( x => orderItem.productId === x.id).name
        }))
      }
      
    } catch (error) {
      throw new RpcException({
        status : HttpStatus.BAD_REQUEST,
        message : 'Checkl logs'
      })
    }

    
  }

  async findAll(paginationDto : OrderPaginationDto ) {

    const { page, limit, status } = paginationDto
    

    const total = await this.order.count({
      where : { status :  status }
    });

    const orders = await this.order.findMany({
      where : { status :  status },
      skip : (page - 1) * limit,
      take : limit
    });

    return {
      data : orders,
      meta : {
        total,
        page,
        lastPAge : Math.ceil( total / limit )
      }
    }

  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where : { id },
      include : {
        OrderItem : {
          select : {
            price : true,
            quantity : true,
            productId : true
          }
        }
      }
    })

    if(!order) throw new RpcException({
      status : HttpStatus.NOT_FOUND,
      message : 'Order not found'
    })


    const ids = order.OrderItem.map( x => x.productId );
    const products = await firstValueFrom(
      this.client.send({cmd : 'validate_products'}, ids )
    );


    const obj = {
      ...order,
      orderItem : order.OrderItem.map( (orderItem) => ({
        ...orderItem,
        name : products.find( x => orderItem.productId === x.id).name
      }))
    }

    delete obj.OrderItem
    return obj;
  }

  async changeOrderStatus( changeOrderStatusDto : ChangeOrderStatusDto){


    const { id, status } = changeOrderStatusDto;

    const old = await this.findOne(id)

    if( old.status === status ){
      return old;
    }

    const order = this.order.update({
      where : { id },
      data : { status}
    })

    return order;
  }

  async createSession(order: OrderWithProducts) {

    const paymenSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId : order.id,
        currency : 'usd',
        items : order.OrderItem.map( item => ({
          name : item.name,
          price : item.price,
          quantity : item.quantity
        }))
      })
    )

    return paymenSession;

  }

  async paidOrder(paidOrderDto : PaidOrderDto){

    console.log("orderPAID")
    console.log(paidOrderDto)

    const order = await this.order.update({
      where : { id : paidOrderDto.orderId },
      data : {
        status : 'PAID',
        paid : true,
        stripeChargeId : paidOrderDto.stripePaymentId,
        OrderReceipt : { create : { receiptUrl : paidOrderDto.receiptUrl } }
      }
    })

    return order;
  }
}
