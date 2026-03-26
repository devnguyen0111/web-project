import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/constants/roles.constant';
import { UsersService } from '../users/users.service';
import { TicketsGateway } from './tickets.gateway';
import {
  TICKETS_WS_EVENTS,
  buildTicketPublicRoom,
} from './tickets.realtime.constants';
import { TicketsRealtimePublisher } from './tickets.realtime.publisher';
import { TicketsService } from './tickets.service';

type MockSocket = {
  id: string;
  handshake: { auth?: { token?: string } };
  data: {
    userId?: string;
    role?: Role;
    subscribedTicketIds?: Set<string>;
  };
  join: jest.Mock<Promise<void>, [string]>;
  leave: jest.Mock<Promise<void>, [string]>;
  emit: jest.Mock<void, [string, unknown]>;
  disconnect: jest.Mock<void, [boolean]>;
};

describe('TicketsGateway', () => {
  let gateway: TicketsGateway;
  let ticketsService: {
    assertRealtimeAccess: jest.Mock<Promise<unknown>, [string, unknown]>;
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
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(() => {
    ticketsService = {
      assertRealtimeAccess: jest.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439033',
      }),
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

    gateway = new TicketsGateway(
      ticketsService as unknown as TicketsService,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      realtimePublisher as unknown as TicketsRealtimePublisher,
    );
    (gateway as unknown as { server: unknown }).server = server;
    gateway.afterInit();
  });

  it('binds gateway as realtime emitter on init', () => {
    expect(realtimePublisher.bindEmitter).toHaveBeenCalledWith(gateway);
  });

  it('accepts valid token and emits ready event', async () => {
    const socket = makeSocket('Bearer valid-access-token');

    await gateway.handleConnection(socket as never);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-access-token', {
      secret: 'access-secret',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      TICKETS_WS_EVENTS.READY,
      expect.objectContaining({
        userId: '507f1f77bcf86cd799439011',
      }),
    );
  });

  it('rejects connection when token is missing', async () => {
    const socket = makeSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.emit).toHaveBeenCalledWith(
      TICKETS_WS_EVENTS.ERROR,
      expect.objectContaining({
        message: 'Missing access token',
      }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('subscribes author into public room', async () => {
    const socket = makeSocket('valid-token');
    await gateway.handleConnection(socket as never);

    await gateway.subscribeTicket(socket as never, {
      ticketId: '507f1f77bcf86cd799439033',
    });

    expect(ticketsService.assertRealtimeAccess).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439033',
      expect.objectContaining({
        userId: '507f1f77bcf86cd799439011',
        role: Role.AUTHOR,
      }),
    );
    expect(socket.join).toHaveBeenCalledWith(
      'ticket:507f1f77bcf86cd799439033:public',
    );
  });

  it('subscribes staff into internal room', async () => {
    usersService.findById.mockResolvedValueOnce({
      id: '507f1f77bcf86cd799439022',
      role: Role.STAFF,
      isActive: true,
    });
    jwtService.verifyAsync.mockResolvedValueOnce({
      sub: '507f1f77bcf86cd799439022',
      email: 'staff@example.com',
      role: Role.STAFF,
    });
    const socket = makeSocket('valid-token');
    await gateway.handleConnection(socket as never);

    await gateway.subscribeTicket(socket as never, {
      ticketId: '507f1f77bcf86cd799439033',
    });

    expect(socket.join).toHaveBeenCalledWith(
      'ticket:507f1f77bcf86cd799439033:internal',
    );
  });

  it('emits error when subscribe access is denied', async () => {
    ticketsService.assertRealtimeAccess.mockRejectedValueOnce(
      new Error('Forbidden'),
    );
    const socket = makeSocket('valid-token');
    await gateway.handleConnection(socket as never);

    await gateway.subscribeTicket(socket as never, {
      ticketId: '507f1f77bcf86cd799439033',
    });

    expect(socket.emit).toHaveBeenCalledWith(
      TICKETS_WS_EVENTS.ERROR,
      expect.objectContaining({
        message: 'Forbidden',
      }),
    );
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('emits internal message to internal room only', () => {
    gateway.emitTicketMessage(
      '507f1f77bcf86cd799439033',
      {
        id: '507f1f77bcf86cd799439044',
        ticketId: '507f1f77bcf86cd799439033',
        content: 'Internal note',
        attachments: [],
        isInternal: true,
        isSystem: false,
        senderId: '507f1f77bcf86cd799439022',
      },
      true,
    );

    expect(server.to).toHaveBeenCalledWith(
      'ticket:507f1f77bcf86cd799439033:internal',
    );
    expect(server.to).not.toHaveBeenCalledWith(
      buildTicketPublicRoom('507f1f77bcf86cd799439033'),
    );
    expect(roomEmit).toHaveBeenCalledWith(
      TICKETS_WS_EVENTS.MESSAGE,
      expect.objectContaining({
        ticketId: '507f1f77bcf86cd799439033',
      }),
    );
  });
});
