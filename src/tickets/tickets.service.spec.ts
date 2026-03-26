import { Types } from 'mongoose';
import { Role } from '../common/constants/roles.constant';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from './tickets.service';
import {
  TicketCategory,
  TicketLastMessageBy,
  TicketPriority,
  TicketRelatedType,
  TicketStatus,
} from './schemas/ticket.schema';

const buildQuery = <T>(result: T) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

const createTicketDocument = (input?: {
  id?: string;
  createdBy?: string;
  status?: TicketStatus;
  assignedTo?: string;
}) => {
  const id = input?.id ?? new Types.ObjectId().toString();
  const createdBy = input?.createdBy ?? new Types.ObjectId().toString();
  const assignedTo = input?.assignedTo;
  return {
    id,
    _id: new Types.ObjectId(id),
    ticketNumber: 'TK-20260324-ABCDEF',
    createdBy: new Types.ObjectId(createdBy),
    assignedTo: assignedTo ? new Types.ObjectId(assignedTo) : undefined,
    relatedTo: undefined,
    subject: 'Custom order support',
    category: TicketCategory.CUSTOM_ORDER,
    priority: TicketPriority.HIGH,
    status: input?.status ?? TicketStatus.OPEN,
    sla: {
      firstResponseDue: new Date('2026-03-24T12:00:00.000Z'),
      resolutionDue: new Date('2026-03-25T12:00:00.000Z'),
    },
    firstResponseAt: undefined,
    resolvedAt: undefined,
    closedAt: undefined,
    satisfaction: undefined,
    tags: ['custom-order'],
    isEscalated: false,
    escalatedTo: undefined,
    messagesCount: 0,
    lastMessageAt: undefined,
    lastMessageBy: TicketLastMessageBy.USER,
    createdAt: new Date('2026-03-24T10:00:00.000Z'),
    updatedAt: new Date('2026-03-24T10:00:00.000Z'),
    save: jest.fn().mockResolvedValue(undefined),
  };
};

const createMessageDocument = (input?: {
  ticketId?: string;
  senderId?: string;
}) => {
  const ticketId = input?.ticketId ?? new Types.ObjectId().toString();
  const senderId = input?.senderId ?? new Types.ObjectId().toString();
  return {
    id: new Types.ObjectId().toString(),
    _id: new Types.ObjectId(),
    ticketId: new Types.ObjectId(ticketId),
    senderId: new Types.ObjectId(senderId),
    content: 'Initial message',
    attachments: [],
    isInternal: false,
    isSystem: false,
    systemEvent: undefined,
    createdAt: new Date('2026-03-24T10:05:00.000Z'),
  };
};

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketModel: {
    create: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let ticketMessageModel: {
    create: jest.Mock;
    find: jest.Mock;
  };
  let orderModel: {
    findById: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
    find: jest.Mock;
  };
  let notificationsService: {
    createTicketNotification: jest.Mock;
  };
  let realtimePublisher: {
    emitTicketMessage: jest.Mock;
    emitTicketUpdated: jest.Mock;
  };

  beforeEach(() => {
    ticketModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn().mockReturnValue(buildQuery([])),
    };
    ticketMessageModel = {
      create: jest.fn(),
      find: jest.fn(),
    };
    orderModel = {
      findById: jest.fn(),
    };
    userModel = {
      findById: jest.fn(),
      find: jest.fn().mockReturnValue(buildQuery([])),
    };
    notificationsService = {
      createTicketNotification: jest.fn().mockResolvedValue(undefined),
    };
    realtimePublisher = {
      emitTicketMessage: jest.fn(),
      emitTicketUpdated: jest.fn(),
    };

    service = new TicketsService(
      ticketModel as never,
      ticketMessageModel as never,
      orderModel as never,
      userModel as never,
      notificationsService as unknown as NotificationsService,
      realtimePublisher as never,
    );
  });

  it('creates ticket with first public message', async () => {
    const actor = {
      userId: new Types.ObjectId().toString(),
      role: Role.AUTHOR,
    };
    const ticket = createTicketDocument({
      createdBy: actor.userId,
      status: TicketStatus.OPEN,
    });
    const message = createMessageDocument({
      ticketId: ticket.id,
      senderId: actor.userId,
    });
    ticketModel.create.mockResolvedValue([ticket]);
    ticketMessageModel.create.mockResolvedValue([message]);

    const result = await service.createTicket(actor, {
      subject: 'Need support with custom request',
      category: TicketCategory.CUSTOM_ORDER,
      priority: TicketPriority.HIGH,
      message: 'Please review custom requirements.',
      tags: ['custom-order'],
    });

    expect(result.ticket.ticketNumber).toBe(ticket.ticketNumber);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].ticketId).toBe(ticket.id);
    expect(ticketModel.create).toHaveBeenCalledTimes(1);
    expect(ticketMessageModel.create).toHaveBeenCalledTimes(1);
    expect(
      notificationsService.createTicketNotification,
    ).not.toHaveBeenCalled();
  });

  it('staff reply updates status and emits notification to ticket owner', async () => {
    const buyerId = new Types.ObjectId().toString();
    const staffId = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      createdBy: buyerId,
      status: TicketStatus.OPEN,
      assignedTo: staffId,
    });
    const message = createMessageDocument({
      ticketId: ticket.id,
      senderId: staffId,
    });
    ticketModel.findById.mockReturnValue(buildQuery(ticket));
    ticketMessageModel.create.mockResolvedValue([message]);

    await service.addMessage(
      ticket.id,
      { userId: staffId, role: Role.STAFF },
      { content: 'I have started reviewing this custom order.' },
    );

    expect(ticket.status).toBe(TicketStatus.AWAITING_USER);
    expect(ticket.firstResponseAt).toBeDefined();
    expect(ticket.save).toHaveBeenCalledTimes(1);
    expect(notificationsService.createTicketNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: buyerId,
        type: NotificationType.TICKET_REPLY,
      }),
    );
  });

  it('ticket owner can close ticket and create system message', async () => {
    const buyerId = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      createdBy: buyerId,
      status: TicketStatus.IN_PROGRESS,
    });
    const systemMessage = createMessageDocument({
      ticketId: ticket.id,
      senderId: buyerId,
    });
    ticketModel.findById.mockReturnValue(buildQuery(ticket));
    ticketMessageModel.create.mockResolvedValue([systemMessage]);

    const result = await service.closeTicket(
      ticket.id,
      { userId: buyerId, role: Role.AUTHOR },
      { reason: 'Resolved already' },
    );

    expect(result.status).toBe(TicketStatus.CLOSED);
    expect(ticket.closedAt).toBeDefined();
    expect(ticketMessageModel.create).toHaveBeenCalledWith([
      expect.objectContaining({
        ticketId: ticket._id,
        isSystem: true,
      }),
    ]);
  });

  it('reuses existing custom-order ticket when already present', async () => {
    const buyerId = new Types.ObjectId().toString();
    const orderId = new Types.ObjectId().toString();
    const existing = createTicketDocument({
      createdBy: buyerId,
      status: TicketStatus.OPEN,
    });
    ticketModel.findOne.mockReturnValue(buildQuery(existing));

    const result = await service.ensureCustomOrderTicketForOrder({
      orderId,
      orderNumber: 'ORD-20260324-ABC123',
      buyerId,
      customData: { brief: 'Need source file' },
    });

    expect(result.id).toBe(existing.id);
    expect(ticketModel.create).not.toHaveBeenCalled();
  });

  it('filters my tickets by related order id when relatedType and relatedId are provided', async () => {
    const buyerId = new Types.ObjectId().toString();
    const orderId = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      createdBy: buyerId,
      status: TicketStatus.OPEN,
    });

    ticketModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([ticket]),
    });
    ticketModel.countDocuments.mockResolvedValue(1);

    await service.listMine(
      buyerId,
      {
        page: 1,
        limit: 10,
        relatedType: TicketRelatedType.ORDER,
        relatedId: orderId,
      } as never,
    );

    const filter = ticketModel.find.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.createdBy).toEqual(new Types.ObjectId(buyerId));
    expect(filter['relatedTo.type']).toBe(TicketRelatedType.ORDER);
    expect(String(filter['relatedTo.id'])).toBe(orderId);
  });

  it('notifies active staff/admin when new ticket has no default assignee', async () => {
    const actor = {
      userId: new Types.ObjectId().toString(),
      role: Role.AUTHOR,
    };
    const staffId = new Types.ObjectId().toString();
    const adminId = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      createdBy: actor.userId,
      status: TicketStatus.OPEN,
    });
    const message = createMessageDocument({
      ticketId: ticket.id,
      senderId: actor.userId,
    });
    ticketModel.create.mockResolvedValue([ticket]);
    ticketMessageModel.create.mockResolvedValue([message]);
    userModel.find.mockReturnValue(
      buildQuery([
        {
          id: staffId,
          fullName: 'Support Staff',
          role: Role.STAFF,
        },
        {
          id: adminId,
          fullName: 'Admin Ops',
          role: Role.ADMIN,
        },
      ]),
    );

    await service.createTicket(actor, {
      subject: 'Need support with custom request',
      category: TicketCategory.GENERAL,
      priority: TicketPriority.MEDIUM,
      message: 'Please help.',
    });

    expect(notificationsService.createTicketNotification).toHaveBeenCalledTimes(
      2,
    );
    const notifiedUserIds = notificationsService.createTicketNotification.mock.calls
      .map((call) => String(call[0]?.userId))
      .sort();
    expect(notifiedUserIds).toEqual(
      expect.arrayContaining([
        staffId,
        adminId,
      ]),
    );
  });

  it('auto-assigns custom-order ticket to valid seller assignee first', async () => {
    const buyerId = new Types.ObjectId().toString();
    const orderId = new Types.ObjectId().toString();
    const sellerId = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      createdBy: buyerId,
      status: TicketStatus.OPEN,
      assignedTo: sellerId,
    });
    const message = createMessageDocument({
      ticketId: ticket.id,
      senderId: buyerId,
    });
    ticketModel.findOne.mockReturnValue(buildQuery(null));
    userModel.findById.mockReturnValue(
      buildQuery({
        id: sellerId,
        role: Role.STAFF,
        isActive: true,
      }),
    );
    ticketModel.create.mockResolvedValue([ticket]);
    ticketMessageModel.create.mockResolvedValue([message]);

    await service.ensureCustomOrderTicketForOrder({
      orderId,
      orderNumber: 'ORD-20260324-ABC123',
      buyerId,
      sellerId,
      customData: { brief: 'Need source file' },
    });

    const createdPayload = ticketModel.create.mock.calls[0]?.[0]?.[0] as {
      assignedTo?: Types.ObjectId;
    };
    expect(String(createdPayload.assignedTo)).toBe(sellerId);
  });

  it('falls back to least-load active assignee when default seller is unavailable', async () => {
    const actor = {
      userId: new Types.ObjectId().toString(),
      role: Role.AUTHOR,
    };
    const staffA = new Types.ObjectId();
    const staffB = new Types.ObjectId();
    const ticket = createTicketDocument({
      createdBy: actor.userId,
      status: TicketStatus.OPEN,
      assignedTo: staffB.toString(),
    });
    const message = createMessageDocument({
      ticketId: ticket.id,
      senderId: actor.userId,
    });
    userModel.find.mockReturnValue(
      buildQuery([
        {
          _id: staffA,
          role: Role.STAFF,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
        {
          _id: staffB,
          role: Role.ADMIN,
          createdAt: new Date('2026-03-21T10:00:00.000Z'),
        },
      ]),
    );
    ticketModel.aggregate.mockReturnValue(
      buildQuery([
        { _id: staffA, count: 4 },
        { _id: staffB, count: 1 },
      ]),
    );
    ticketModel.create.mockResolvedValue([ticket]);
    ticketMessageModel.create.mockResolvedValue([message]);

    await service.createTicket(actor, {
      subject: 'Need support with custom request',
      category: TicketCategory.GENERAL,
      priority: TicketPriority.MEDIUM,
      message: 'Please help.',
    });

    const createdPayload = ticketModel.create.mock.calls[0]?.[0]?.[0] as {
      assignedTo?: Types.ObjectId;
    };
    expect(String(createdPayload.assignedTo)).toBe(staffB.toString());
  });

  it('keeps ticket unassigned when there is no active staff/admin candidate', async () => {
    const actor = {
      userId: new Types.ObjectId().toString(),
      role: Role.AUTHOR,
    };
    const ticket = createTicketDocument({
      createdBy: actor.userId,
      status: TicketStatus.OPEN,
    });
    const message = createMessageDocument({
      ticketId: ticket.id,
      senderId: actor.userId,
    });
    userModel.find.mockReturnValue(buildQuery([]));
    ticketModel.aggregate.mockReturnValue(buildQuery([]));
    ticketModel.create.mockResolvedValue([ticket]);
    ticketMessageModel.create.mockResolvedValue([message]);

    await service.createTicket(actor, {
      subject: 'Need support with custom request',
      category: TicketCategory.GENERAL,
      priority: TicketPriority.MEDIUM,
      message: 'Please help.',
    });

    const createdPayload = ticketModel.create.mock.calls[0]?.[0]?.[0] as {
      assignedTo?: Types.ObjectId;
    };
    expect(createdPayload.assignedTo).toBeUndefined();
    expect(
      notificationsService.createTicketNotification,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.TICKET_CREATED,
      }),
    );
  });

  it('blocks staff from reassigning others and updating tickets not assigned to self', async () => {
    const ticketId = new Types.ObjectId().toString();
    const buyerId = new Types.ObjectId().toString();
    const currentAssignee = new Types.ObjectId().toString();
    const otherStaffId = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      id: ticketId,
      createdBy: buyerId,
      status: TicketStatus.OPEN,
      assignedTo: currentAssignee,
    });

    ticketModel.findById.mockReturnValue(buildQuery(ticket));

    await expect(
      service.assignTicket(
        ticketId,
        { userId: currentAssignee, role: Role.STAFF },
        { assignedTo: otherStaffId },
      ),
    ).rejects.toThrow('Staff can only claim ticket to their own account');

    await expect(
      service.addMessage(
        ticketId,
        { userId: otherStaffId, role: Role.STAFF },
        { content: 'Can I take over this ticket?' },
      ),
    ).rejects.toThrow('Staff can only update tickets assigned to you');

    await expect(
      service.updateTicketStatus(
        ticketId,
        { userId: otherStaffId, role: Role.STAFF },
        { status: TicketStatus.IN_PROGRESS },
      ),
    ).rejects.toThrow('Staff can only update tickets assigned to you');
  });

  it('allows admin to override assignment and status', async () => {
    const adminId = new Types.ObjectId().toString();
    const buyerId = new Types.ObjectId().toString();
    const staffA = new Types.ObjectId().toString();
    const staffB = new Types.ObjectId().toString();
    const ticket = createTicketDocument({
      createdBy: buyerId,
      status: TicketStatus.OPEN,
      assignedTo: staffA,
    });
    const assignSystemMessage = createMessageDocument({
      ticketId: ticket.id,
      senderId: adminId,
    });
    const statusSystemMessage = createMessageDocument({
      ticketId: ticket.id,
      senderId: adminId,
    });
    ticketModel.findById
      .mockReturnValueOnce(buildQuery(ticket))
      .mockReturnValueOnce(buildQuery(ticket));
    userModel.findById.mockReturnValue(
      buildQuery({
        id: staffB,
        role: Role.STAFF,
        isActive: true,
      }),
    );
    ticketMessageModel.create
      .mockResolvedValueOnce([assignSystemMessage])
      .mockResolvedValueOnce([statusSystemMessage]);

    const assigned = await service.assignTicket(
      ticket.id,
      { userId: adminId, role: Role.ADMIN },
      { assignedTo: staffB },
    );
    const updated = await service.updateTicketStatus(
      ticket.id,
      { userId: adminId, role: Role.ADMIN },
      { status: TicketStatus.CLOSED, note: 'Force-closed by admin' },
    );

    expect(assigned.assignedTo).toBe(staffB);
    expect(updated.status).toBe(TicketStatus.CLOSED);
    expect(ticket.closedAt).toBeDefined();
  });

  it('lists assignable assignees with active staff/admin roles only', async () => {
    const staffId = new Types.ObjectId().toString();
    const adminId = new Types.ObjectId().toString();
    userModel.find.mockReturnValue(
      buildQuery([
        {
          id: staffId,
          fullName: 'Support Staff',
          role: Role.STAFF,
        },
        {
          id: adminId,
          fullName: 'Admin Ops',
          role: Role.ADMIN,
        },
      ]),
    );

    const result = await service.listAssignableStaff();

    expect(userModel.find).toHaveBeenCalledWith({
      role: { $in: [Role.STAFF, Role.ADMIN] },
      isActive: { $ne: false },
    });
    expect(result).toEqual([
      { id: staffId, fullName: 'Support Staff', role: Role.STAFF },
      { id: adminId, fullName: 'Admin Ops', role: Role.ADMIN },
    ]);
  });
});
