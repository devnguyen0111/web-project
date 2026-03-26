import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AUTHOR_PLUS_ROLES, Role } from '../common/constants/roles.constant';
import { UsersService } from '../users/users.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import {
  NOTIFICATIONS_WS_EVENTS,
  NOTIFICATIONS_WS_NAMESPACE,
  buildNotificationsUserRoom,
} from './notifications.realtime.constants';
import {
  NotificationsRealtimeEmitter,
  NotificationsRealtimePublisher,
} from './notifications.realtime.publisher';
import { NotificationsService } from './notifications.service';

type NotificationsSocket = Socket & {
  data: {
    userId?: string;
    role?: Role;
  };
};

@WebSocketGateway({
  namespace: NOTIFICATIONS_WS_NAMESPACE,
})
export class NotificationsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    NotificationsRealtimeEmitter
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly realtimePublisher: NotificationsRealtimePublisher,
  ) {}

  afterInit(): void {
    this.realtimePublisher.bindEmitter(this);
  }

  async handleConnection(client: NotificationsSocket): Promise<void> {
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
      await client.join(this.userRoom(user.id));

      const { unreadCount } = await this.notificationsService.getUnreadCount(
        user.id,
      );
      client.emit(NOTIFICATIONS_WS_EVENTS.READY, {
        userId: user.id,
        unreadCount,
        connectedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      this.logger.warn(
        `Notifications socket auth failed for client=${client.id}: ${message}`,
      );
      this.rejectClient(client, 'Unauthorized');
    }
  }

  handleDisconnect(client: NotificationsSocket): void {
    if (client.data?.userId) {
      this.logger.debug(
        `Notifications socket disconnected user=${client.data.userId} client=${client.id}`,
      );
    }
  }

  emitNotificationCreated(
    userId: string,
    notification: NotificationResponseDto,
  ): void {
    this.server
      .to(this.userRoom(userId))
      .emit(NOTIFICATIONS_WS_EVENTS.NEW, { notification });
  }

  emitUnreadCount(userId: string, unreadCount: number): void {
    this.server
      .to(this.userRoom(userId))
      .emit(NOTIFICATIONS_WS_EVENTS.UNREAD_COUNT, { unreadCount });
  }

  emitNotificationRead(userId: string, id: string, readAt: Date): void {
    this.server
      .to(this.userRoom(userId))
      .emit(NOTIFICATIONS_WS_EVENTS.READ, { id, readAt });
  }

  emitNotificationsReadAll(
    userId: string,
    updated: number,
    readAt: Date,
  ): void {
    this.server
      .to(this.userRoom(userId))
      .emit(NOTIFICATIONS_WS_EVENTS.READ_ALL, { updated, readAt });
  }

  private rejectClient(client: NotificationsSocket, message: string): void {
    client.emit(NOTIFICATIONS_WS_EVENTS.ERROR, { message });
    client.disconnect(true);
  }

  private extractAccessToken(client: NotificationsSocket): string | undefined {
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

  private userRoom(userId: string): string {
    return buildNotificationsUserRoom(userId);
  }
}
