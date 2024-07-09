import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ORDER_SERVICE, PRODUCT_SERVICE } from 'src/config/services';
import { envs } from 'src/config/envs';
import { NatsModule } from 'src/transports/nats.module';

@Module({
  imports : [
    NatsModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
