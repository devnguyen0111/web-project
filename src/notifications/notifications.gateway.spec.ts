import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '../common/constants/roles.constant';
import { UsersService } from '../users/users.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  NOTIFICATIONS_WS_EVENTS,
  buildNotificationsUserRoom,
} from './notifications.realtime.constants';
import { NotificationsRealtimePublisher } from './notifications.realtime.publisher';
import { NotificationsService } from './notifications.service';

type MockSocket = {
  id: string;
  handshake: { auth?: { token?: string } };
  data: { userId?: string; role?: Role };
  join: jest.Mock<Promise<void>, [string]>;
  emit: jest.Mock<void, [string, unknown]>;
  disconnect: jest.Mock<void, [boolean]>;
};

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let notificationsService: {
    getUnreadCount: jest.Mock<Promise<{ unreadCount: number }>, [string]>;
  };
  let usersService: {
    findById: jest.Mock<
      Promise<{ id: string; role: Role; isActive: boolean } | null>,
      [string]
    >;
  };
  let jwtService: {
    verifyAsync: jest.Mock<
      Promise<{ sub: string; email: string; role: Role }>,
      [string, { secret: string }]
    >;
  };
  let configService: {
    getOrThrow: jest.Mock<string, [string]>;
  };
  let realtimePublisher: {
    bindEmitter: jest.Mock<void, [unknown]>;
  };
  let roomEmit: jest.Mock<void, [string, unknown]>;
  let server: {
    to: jest.Mock<{ emit: jest.Mock<void, [string, unknown]> }, [string]>;
  };

  const makeSocket = (token?: string): MockSocket => ({
    id: 'socket-1',
    handshake: token ? { auth: { token } } : { auth: {} },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(() => {
    notificationsService = {
      getUnreadCount: jest.fn().mockResolvedValue({ unreadCount: 5 }),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        role: Role.AUTHOR,
        isActive: true,
      }),
    };
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: '507f1f77bcf86cd799439011',
        email: 'author@example.com',
        role: Role.AUTHOR,
      }),
    };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('access-secret'),
    };
    realtimePublisher = {
      bindEmitter: jest.fn(),
    };
    roomEmit = jest.fn();
    server = {
      to: jest.fn().mockReturnValue({ emit: roomEmit }),
    };

    gateway = new NotificationsGateway(
      notificationsService as unknown as NotificationsService,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      realtimePublisher as unknown as NotificationsRealtimePublisher,
    );
    (gateway as unknown as { server: unknown }).server = server;
    gateway.afterInit();
  });

  it('binds gateway as realtime emitter on init', () => {
    expect(realtimePublisher.bindEmitter).toHaveBeenCalledWith(gateway);
  });

  it('accepts valid token, joins room, and emits ready event', async () => {
    const socket = makeSocket('Bearer valid-access-token');

    await gateway.handleConnection(socket as never);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-access-token', {
      secret: 'access-secret',
    });
    expect(usersService.findById).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
    );
    expect(socket.join).toHaveBeenCalledWith(
      buildNotificationsUserRoom('507f1f77bcf86cd799439011'),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_WS_EVENTS.READY,
      expect.objectContaining({
        userId: '507f1f77bcf86cd799439011',
        unreadCount: 5,
      }),
    );
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('rejects socket when token is missing', async () => {
    const socket = makeSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.emit).toHaveBeenCalledWith(NOTIFICATIONS_WS_EVENTS.ERROR, {
      message: 'Missing access token',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects socket when token is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValueOnce(new Error('jwt malformed'));
    const socket = makeSocket('bad-token');

    await gateway.handleConnection(socket as never);

    expect(socket.emit).toHaveBeenCalledWith(NOTIFICATIONS_WS_EVENTS.ERROR, {
      message: 'Unauthorized',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects socket when user role is not allowed', async () => {
    usersService.findById.mockResolvedValueOnce({
      id: '507f1f77bcf86cd799439011',
      role: Role.GUEST,
      isActive: true,
    });
    const socket = makeSocket('valid-token');

    await gateway.handleConnection(socket as never);

    expect(socket.emit).toHaveBeenCalledWith(NOTIFICATIONS_WS_EVENTS.ERROR, {
      message: 'Forbidden',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits realtime notification payload to user room', () => {
    gateway.emitNotificationCreated('507f1f77bcf86cd799439011', {
      id: '507f1f77bcf86cd799439022',
      userId: '507f1f77bcf86cd799439011',
      category: 'subscription' as never,
      type: 'subscription_renewed' as never,
      title: 'Renewed',
      message: 'Renewed successfully',
      readAt: undefined,
      metadata: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(server.to).toHaveBeenCalledWith(
      buildNotificationsUserRoom('507f1f77bcf86cd799439011'),
    );
    expect(roomEmit).toHaveBeenCalledWith(NOTIFICATIONS_WS_EVENTS.NEW, {
      notification: expect.objectContaining({
        id: '507f1f77bcf86cd799439022',
      }),
    });
  });
});
