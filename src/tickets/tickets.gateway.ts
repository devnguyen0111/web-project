import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AUTHOR_PLUS_ROLES, Role } from '../common/constants/roles.constant';
import { UsersService } from '../users/users.service';
import {
  TicketMessageResponseDto,
  TicketResponseDto,
} from './dto/ticket-response.dto';
import {
  TICKETS_WS_EVENTS,
  TICKETS_WS_NAMESPACE,
  buildTicketInternalRoom,
  buildTicketPublicRoom,
} from './tickets.realtime.constants';
import {
  TicketsRealtimeEmitter,
  TicketsRealtimePublisher,
} from './tickets.realtime.publisher';
import { TicketsService } from './tickets.service';

type TicketsSocket = Socket & {
  data: {
    userId?: string;
    role?: Role;
    subscribedTicketIds?: Set<string>;
  };
};

@WebSocketGateway({
  namespace: TICKETS_WS_NAMESPACE,
})
export class TicketsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    TicketsRealtimeEmitter
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(TicketsGateway.name);

  constructor(
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly realtimePublisher: TicketsRealtimePublisher,
  ) {}

  afterInit(): void {
    this.realtimePublisher.bindEmitter(this);
  }

  async handleConnection(client: TicketsSocket): Promise<void> {
    const accessToken = this.extractAccessToken(client);
    if (!accessToken) {
      this.rejectClient(client, 'Missing access token');
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        accessToken,
        {
          secret: this.configService.getOrThrow<string>(
            'jwt.accessTokenSecret',
          ),
        },
      );

      const user = await this.usersService.findById(payload.sub);
      if (!user || user.isActive === false) {
        this.rejectClient(client, 'Unauthorized');
        return;
      }
      if (!AUTHOR_PLUS_ROLES.includes(user.role)) {
        this.rejectClient(client, 'Forbidden');
        return;
      }

      client.data.userId = user.id;
      client.data.role = user.role;
      client.data.subscribedTicketIds = new Set<string>();
      client.emit(TICKETS_WS_EVENTS.READY, {
        userId: user.id,
        connectedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      this.logger.warn(
        `Tickets socket auth failed for client=${client.id}: ${message}`,
      );
      this.rejectClient(client, 'Unauthorized');
    }
  }

  handleDisconnect(client: TicketsSocket): void {
    if (client.data?.userId) {
      this.logger.debug(
        `Tickets socket disconnected user=${client.data.userId} client=${client.id}`,
      );
    }
  }

  @SubscribeMessage(TICKETS_WS_EVENTS.SUBSCRIBE)
  async subscribeTicket(
    @ConnectedSocket() client: TicketsSocket,
    @MessageBody() payload?: { ticketId?: string },
  ): Promise<void> {
    const actor = this.resolveActor(client);
    if (!actor) {
      this.rejectClient(client, 'Unauthorized');
      return;
    }

    const ticketId = payload?.ticketId?.trim();
    if (!ticketId) {
      client.emit(TICKETS_WS_EVENTS.ERROR, { message: 'Missing ticketId' });
      return;
    }

    try {
      await this.ticketsService.assertRealtimeAccess(ticketId, actor);
      if (this.isStaffRole(actor.role)) {
        await client.join(buildTicketInternalRoom(ticketId));
      } else {
        await client.join(buildTicketPublicRoom(ticketId));
      }
      client.data.subscribedTicketIds?.add(ticketId);
      client.emit(TICKETS_WS_EVENTS.SUBSCRIBED, {
        ticketId,
        subscribedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to subscribe';
      client.emit(TICKETS_WS_EVENTS.ERROR, { message });
    }
  }

  @SubscribeMessage(TICKETS_WS_EVENTS.UNSUBSCRIBE)
  async unsubscribeTicket(
    @ConnectedSocket() client: TicketsSocket,
    @MessageBody() payload?: { ticketId?: string },
  ): Promise<void> {
    const ticketId = payload?.ticketId?.trim();
    if (!ticketId) {
      return;
    }

    await client.leave(buildTicketPublicRoom(ticketId));
    await client.leave(buildTicketInternalRoom(ticketId));
    client.data.subscribedTicketIds?.delete(ticketId);
  }

  emitTicketMessage(
    ticketId: string,
    message: TicketMessageResponseDto,
    isInternal: boolean,
  ): void {
    const payload = {
      ticketId,
      message,
    };

    if (isInternal) {
      this.server
        .to(buildTicketInternalRoom(ticketId))
        .emit(TICKETS_WS_EVENTS.MESSAGE, payload);
      return;
    }

    this.server
      .to(buildTicketPublicRoom(ticketId))
      .emit(TICKETS_WS_EVENTS.MESSAGE, payload);
    this.server
      .to(buildTicketInternalRoom(ticketId))
      .emit(TICKETS_WS_EVENTS.MESSAGE, payload);
  }

  emitTicketUpdated(ticket: TicketResponseDto): void {
    const payload = { ticket };
    this.server
      .to(buildTicketPublicRoom(ticket.id))
      .emit(TICKETS_WS_EVENTS.TICKET_UPDATED, payload);
    this.server
      .to(buildTicketInternalRoom(ticket.id))
      .emit(TICKETS_WS_EVENTS.TICKET_UPDATED, payload);
  }

  private resolveActor(client: TicketsSocket):
    | { userId: string; role: Role }
    | undefined {
    if (!client.data.userId || !client.data.role) {
      return undefined;
    }
    return {
      userId: client.data.userId,
      role: client.data.role,
    };
  }

  private rejectClient(client: TicketsSocket, message: string): void {
    client.emit(TICKETS_WS_EVENTS.ERROR, { message });
    client.disconnect(true);
  }

  private extractAccessToken(client: TicketsSocket): string | undefined {
    const rawToken = client.handshake.auth?.token;
    if (typeof rawToken !== 'string') {
      return undefined;
    }

    const token = rawToken.trim();
    if (!token) {
      return undefined;
    }

    if (token.toLowerCase().startsWith('bearer ')) {
      const bearerToken = token.slice(7).trim();
      return bearerToken || undefined;
    }

    return token;
  }

  private isStaffRole(role: Role): boolean {
    return role === Role.STAFF || role === Role.ADMIN;
  }
}
