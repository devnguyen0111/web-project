import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { Order, OrderSchema } from '../store/orders/schemas/order.schema';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AdminTicketsController } from './admin-tickets.controller';
import { TicketsGateway } from './tickets.gateway';
import { TicketsRealtimePublisher } from './tickets.realtime.publisher';
import { TicketsController } from './tickets.controller';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import {
  TicketMessage,
  TicketMessageSchema,
} from './schemas/ticket-message.schema';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: TicketMessage.name, schema: TicketMessageSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TicketsController, AdminTicketsController],
  providers: [TicketsService, TicketsRealtimePublisher, TicketsGateway],
  exports: [TicketsService],
})
export class TicketsModule {}
