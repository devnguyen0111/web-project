import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { Role } from '../common/constants/roles.constant';
import { Order } from '../store/orders/schemas/order.schema';
import { ProductType } from '../store/products/schemas/product.schema';
import { User } from '../users/schemas/user.schema';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { CreateInternalNoteDto } from './dto/create-internal-note.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { RateTicketDto } from './dto/rate-ticket.dto';
import { ReopenTicketDto } from './dto/reopen-ticket.dto';
import {
  TicketDetailResponseDto,
  TicketMessageResponseDto,
  TicketResponseDto,
} from './dto/ticket-response.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import {
  Ticket,
  TicketCategory,
  TicketDocument,
  TicketLastMessageBy,
  TicketPriority,
  TicketRelatedType,
  TicketStatus,
} from './schemas/ticket.schema';
import {
  TicketMessage,
  TicketMessageDocument,
} from './schemas/ticket-message.schema';
import { TicketsRealtimePublisher } from './tickets.realtime.publisher';

type AuthUser = {
  userId: string;
  role: Role;
};

const OPEN_ASSIGNABLE_STATUSES: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.AWAITING_USER,
  TicketStatus.IN_PROGRESS,
  TicketStatus.ESCALATED,
  TicketStatus.REOPENED,
];

const STAFF_OPERATIONAL_STATUSES: TicketStatus[] = [
  TicketStatus.IN_PROGRESS,
  TicketStatus.AWAITING_USER,
  TicketStatus.RESOLVED,
  TicketStatus.ESCALATED,
];

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<Ticket>,
    @InjectModel(TicketMessage.name)
    private readonly ticketMessageModel: Model<TicketMessage>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
    private readonly realtimePublisher: TicketsRealtimePublisher,
  ) {}

  async createTicket(
    actor: AuthUser,
    payload: CreateTicketDto,
  ): Promise<TicketDetailResponseDto> {
    const subject = payload.subject.trim();
    const content = this.normalizeMessageContent(payload.message);
    const priority = payload.priority ?? TicketPriority.MEDIUM;
    const category = payload.category ?? TicketCategory.GENERAL;
    const relatedContext = await this.resolveRelatedContext(
      actor,
      payload.relatedTo,
      category,
    );
    const autoAssigneeId = await this.resolveAutoAssignee({
      preferredUserId: relatedContext.defaultAssigneeId,
      excludeUserId: actor.userId,
    });
    const now = new Date();
    const ticketId = new Types.ObjectId();

    const [ticket] = await this.ticketModel.create([
      {
        _id: ticketId,
        ticketNumber: this.buildTicketNumber(ticketId),
        createdBy: new Types.ObjectId(actor.userId),
        assignedTo: this.toObjectIdOrUndefined(autoAssigneeId),
        relatedTo: relatedContext.relatedTo,
        subject,
        category,
        priority,
        status: TicketStatus.OPEN,
        sla: this.buildSla(priority, now),
        tags: this.normalizeTags(payload.tags),
        messagesCount: 1,
        lastMessageAt: now,
        lastMessageBy: this.mapRoleToLastMessageBy(actor.role),
      },
    ]);

    const [message] = await this.ticketMessageModel.create([
      {
        ticketId: ticket._id,
        senderId: new Types.ObjectId(actor.userId),
        content,
        attachments: this.normalizeAttachments(payload.attachments),
        isInternal: false,
        isSystem: false,
      },
    ]);

    const assigneeRecipients = this.collectRecipients(
      [autoAssigneeId],
      actor.userId,
    );
    const notifyRecipients =
      assigneeRecipients.length > 0
        ? assigneeRecipients
        : await this.listAssignableStaffIds(actor.userId);
    await this.safeNotify(
      notifyRecipients,
      NotificationType.TICKET_CREATED,
      `New ticket ${ticket.ticketNumber}`,
      subject,
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        priority: ticket.priority,
      },
    );

    const response = {
      ticket: this.toTicketResponse(ticket),
      messages: [this.toMessageResponse(message)],
    };
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      response.messages[0],
      false,
    );
    this.realtimePublisher.emitTicketUpdated(response.ticket);
    return response;
  }

  async ensureCustomOrderTicketForOrder(input: {
    orderId: string;
    orderNumber: string;
    buyerId: string;
    sellerId?: string;
    customData?: Record<string, unknown>;
  }): Promise<TicketResponseDto> {
    if (
      !Types.ObjectId.isValid(input.orderId) ||
      !Types.ObjectId.isValid(input.buyerId)
    ) {
      throw new BadRequestException('Invalid custom-order ticket payload');
    }

    const existing = await this.ticketModel
      .findOne({
        createdBy: new Types.ObjectId(input.buyerId),
        category: TicketCategory.CUSTOM_ORDER,
        'relatedTo.type': TicketRelatedType.ORDER,
        'relatedTo.id': new Types.ObjectId(input.orderId),
      })
      .exec();
    if (existing) {
      return this.toTicketResponse(existing);
    }

    const now = new Date();
    const ticketId = new Types.ObjectId();
    const autoAssigneeId = await this.resolveAutoAssignee({
      preferredUserId: input.sellerId,
      excludeUserId: input.buyerId,
    });
    const assigneeId = this.toObjectIdOrUndefined(autoAssigneeId);
    const initialMessage = this.buildCustomOrderInitialMessage(
      input.orderNumber,
      input.customData,
    );

    const [ticket] = await this.ticketModel.create([
      {
        _id: ticketId,
        ticketNumber: this.buildTicketNumber(ticketId),
        createdBy: new Types.ObjectId(input.buyerId),
        assignedTo: assigneeId,
        relatedTo: {
          type: TicketRelatedType.ORDER,
          id: new Types.ObjectId(input.orderId),
        },
        subject: `Custom order ${input.orderNumber}`,
        category: TicketCategory.CUSTOM_ORDER,
        priority: TicketPriority.HIGH,
        status: TicketStatus.OPEN,
        sla: this.buildSla(TicketPriority.HIGH, now),
        tags: ['custom-order'],
        messagesCount: 1,
        lastMessageAt: now,
        lastMessageBy: TicketLastMessageBy.USER,
      },
    ]);

    const [message] = await this.ticketMessageModel.create([
      {
        ticketId: ticket._id,
        senderId: new Types.ObjectId(input.buyerId),
        content: initialMessage,
        attachments: [],
        isInternal: false,
        isSystem: false,
      },
    ]);

    const assigneeRecipients = this.collectRecipients(
      [autoAssigneeId],
      input.buyerId,
    );
    const notifyRecipients =
      assigneeRecipients.length > 0
        ? assigneeRecipients
        : await this.listAssignableStaffIds(input.buyerId);
    await this.safeNotify(
      notifyRecipients,
      NotificationType.TICKET_CREATED,
      `Custom order ticket ${ticket.ticketNumber}`,
      'A new custom-order discussion has started.',
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        orderId: input.orderId,
      },
    );
    const response = this.toTicketResponse(ticket);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      this.toMessageResponse(message),
      false,
    );
    this.realtimePublisher.emitTicketUpdated(response);
    return response;
  }

  async createOrAppendOrderRequestTicket(input: {
    userId: string;
    userRole: Role;
    orderId: string;
    orderNumber: string;
    category: TicketCategory.ORDER_ISSUE | TicketCategory.REFUND;
    subject: string;
    message: string;
    tags?: string[];
  }): Promise<{
    ticket: TicketResponseDto;
    appended: boolean;
  }> {
    if (
      !Types.ObjectId.isValid(input.userId) ||
      !Types.ObjectId.isValid(input.orderId)
    ) {
      throw new BadRequestException('Invalid order request ticket payload');
    }

    const existing = await this.ticketModel
      .findOne({
        createdBy: new Types.ObjectId(input.userId),
        category: input.category,
        'relatedTo.type': TicketRelatedType.ORDER,
        'relatedTo.id': new Types.ObjectId(input.orderId),
        status: {
          $in: [
            TicketStatus.OPEN,
            TicketStatus.AWAITING_USER,
            TicketStatus.IN_PROGRESS,
            TicketStatus.ESCALATED,
            TicketStatus.REOPENED,
          ],
        },
      })
      .sort({ updatedAt: -1 })
      .exec();

    if (existing) {
      await this.addMessage(
        existing.id,
        {
          userId: input.userId,
          role: input.userRole,
        },
        {
          content: input.message,
        },
      );

      const refreshed = await this.findTicketByIdOrFail(existing.id);
      return {
        ticket: this.toTicketResponse(refreshed),
        appended: true,
      };
    }

    const detail = await this.createTicket(
      {
        userId: input.userId,
        role: input.userRole,
      },
      {
        subject: input.subject,
        category: input.category,
        relatedTo: {
          type: TicketRelatedType.ORDER,
          id: input.orderId,
        },
        message: input.message,
        tags: input.tags,
      },
    );

    return {
      ticket: detail.ticket,
      appended: false,
    };
  }

  async listMine(
    userId: string,
    query: TicketQueryDto,
  ): Promise<PaginatedResponseDto<TicketResponseDto>> {
    const filter = this.buildListFilter(query, {
      createdBy: new Types.ObjectId(userId),
      includeAdminFilters: false,
    });
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.ticketModel
        .find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.ticketModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(
      items.map((item) => this.toTicketResponse(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async listForAdmin(
    actor: AuthUser,
    query: TicketQueryDto,
  ): Promise<PaginatedResponseDto<TicketResponseDto>> {
    const filter = this.buildListFilter(query, {
      includeAdminFilters: actor.role === Role.ADMIN,
    });
    if (actor.role === Role.STAFF) {
      const visibilityFilter = [
        { assignedTo: new Types.ObjectId(actor.userId) },
        { assignedTo: { $exists: false } },
        { assignedTo: null },
      ];
      if (Array.isArray(filter.$or)) {
        filter.$and = [{ $or: filter.$or }, { $or: visibilityFilter }];
        delete filter.$or;
      } else {
        filter.$or = visibilityFilter;
      }
    }
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.ticketModel
        .find(filter)
        .sort({ priority: -1, lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.ticketModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(
      items.map((item) => this.toTicketResponse(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async getTicketDetail(
    ticketId: string,
    actor: AuthUser,
  ): Promise<TicketDetailResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketReadable(ticket, actor);

    const messageFilter: Record<string, unknown> = {
      ticketId: ticket._id,
    };
    if (!this.isStaffRole(actor.role)) {
      messageFilter.isInternal = { $ne: true };
    }

    const messages = await this.ticketMessageModel
      .find(messageFilter)
      .sort({ createdAt: 1 })
      .exec();

    return {
      ticket: this.toTicketResponse(ticket),
      messages: messages.map((item) => this.toMessageResponse(item)),
    };
  }

  async assertRealtimeAccess(
    ticketId: string,
    actor: AuthUser,
  ): Promise<TicketResponseDto> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new BadRequestException('Invalid ticket id');
    }

    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketReadable(ticket, actor);
    return this.toTicketResponse(ticket);
  }

  async addMessage(
    ticketId: string,
    actor: AuthUser,
    payload: CreateTicketMessageDto,
  ): Promise<TicketMessageResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketWritable(ticket, actor);

    if ([TicketStatus.CLOSED, TicketStatus.RESOLVED].includes(ticket.status)) {
      throw new BadRequestException(
        'Ticket is resolved or closed, please reopen before replying',
      );
    }

    const now = new Date();
    const [message] = await this.ticketMessageModel.create([
      {
        ticketId: ticket._id,
        senderId: new Types.ObjectId(actor.userId),
        content: this.normalizeMessageContent(payload.content),
        attachments: this.normalizeAttachments(payload.attachments),
        isInternal: false,
        isSystem: false,
      },
    ]);

    this.bumpTicketAfterMessage(ticket, actor, now);
    this.applyAutoStatusOnReply(ticket, actor);
    await ticket.save();

    const senderIsStaff = this.isStaffRole(actor.role);
    const recipients = senderIsStaff
      ? this.collectRecipients([ticket.createdBy.toString()], actor.userId)
      : this.collectRecipients(
          await this.resolveStaffRecipientsForTicket(ticket),
          actor.userId,
        );
    if (!senderIsStaff && recipients.length === 0) {
      recipients.push(...(await this.listAssignableStaffIds(actor.userId)));
    }

    await this.safeNotify(
      recipients,
      NotificationType.TICKET_REPLY,
      `New reply in ${ticket.ticketNumber}`,
      ticket.subject,
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      },
    );

    const responseMessage = this.toMessageResponse(message);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      responseMessage,
      responseMessage.isInternal,
    );
    this.realtimePublisher.emitTicketUpdated(this.toTicketResponse(ticket));
    return responseMessage;
  }

  async closeTicket(
    ticketId: string,
    actor: AuthUser,
    payload?: CloseTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketOwner(ticket, actor.userId);

    if (ticket.status === TicketStatus.CLOSED) {
      return this.toTicketResponse(ticket);
    }

    ticket.status = TicketStatus.CLOSED;
    ticket.closedAt = new Date();

    const reason = payload?.reason?.trim();
    const systemMessage = await this.appendSystemMessage(
      ticket,
      actor,
      reason ? `Ticket closed by user: ${reason}` : 'Ticket closed by user',
      'ticket_closed_by_user',
    );
    await ticket.save();

    const staffRecipients = this.collectRecipients(
      await this.resolveStaffRecipientsForTicket(ticket),
      actor.userId,
    );
    if (staffRecipients.length === 0) {
      staffRecipients.push(...(await this.listAssignableStaffIds(actor.userId)));
    }
    await this.safeNotify(
      staffRecipients,
      NotificationType.TICKET_STATUS_CHANGED,
      `Ticket ${ticket.ticketNumber} was closed`,
      ticket.subject,
      {
        ticketId: ticket.id,
        status: ticket.status,
      },
    );

    const response = this.toTicketResponse(ticket);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      this.toMessageResponse(systemMessage),
      false,
    );
    this.realtimePublisher.emitTicketUpdated(response);
    return response;
  }

  async reopenTicket(
    ticketId: string,
    actor: AuthUser,
    payload?: ReopenTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketOwner(ticket, actor.userId);

    if (![TicketStatus.CLOSED, TicketStatus.RESOLVED].includes(ticket.status)) {
      throw new BadRequestException(
        'Only closed or resolved ticket can be reopened',
      );
    }

    ticket.status = TicketStatus.REOPENED;
    ticket.closedAt = undefined;

    const reason = payload?.reason?.trim();
    const systemMessage = await this.appendSystemMessage(
      ticket,
      actor,
      reason ? `Ticket reopened by user: ${reason}` : 'Ticket reopened by user',
      'ticket_reopened_by_user',
    );
    await ticket.save();

    const staffRecipients = this.collectRecipients(
      await this.resolveStaffRecipientsForTicket(ticket),
      actor.userId,
    );
    if (staffRecipients.length === 0) {
      staffRecipients.push(...(await this.listAssignableStaffIds(actor.userId)));
    }
    await this.safeNotify(
      staffRecipients,
      NotificationType.TICKET_STATUS_CHANGED,
      `Ticket ${ticket.ticketNumber} was reopened`,
      ticket.subject,
      {
        ticketId: ticket.id,
        status: ticket.status,
      },
    );

    const response = this.toTicketResponse(ticket);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      this.toMessageResponse(systemMessage),
      false,
    );
    this.realtimePublisher.emitTicketUpdated(response);
    return response;
  }

  async rateTicket(
    ticketId: string,
    actor: AuthUser,
    payload: RateTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketOwner(ticket, actor.userId);

    if (![TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(ticket.status)) {
      throw new BadRequestException(
        'Ticket can only be rated after it is resolved or closed',
      );
    }

    if (ticket.satisfaction?.rating) {
      throw new BadRequestException('Ticket has already been rated');
    }

    ticket.satisfaction = {
      rating: payload.rating,
      comment: payload.comment?.trim(),
      ratedAt: new Date(),
    };
    await ticket.save();

    const response = this.toTicketResponse(ticket);
    this.realtimePublisher.emitTicketUpdated(response);
    return response;
  }

  async assignTicket(
    ticketId: string,
    actor: AuthUser,
    payload: AssignTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    const currentAssignee = ticket.assignedTo?.toString();
    if (actor.role === Role.STAFF) {
      if (payload.assignedTo !== actor.userId) {
        throw new ForbiddenException(
          'Staff can only claim ticket to their own account',
        );
      }
      if (currentAssignee && currentAssignee !== actor.userId) {
        throw new ForbiddenException('Staff can only claim unassigned tickets');
      }
    }

    if (currentAssignee === payload.assignedTo) {
      return this.toTicketResponse(ticket);
    }

    const assignee = await this.userModel
      .findById(payload.assignedTo)
      .select({ _id: 1, role: 1, isActive: 1 })
      .exec();
    if (!assignee) {
      throw new NotFoundException('Assignee user not found');
    }
    if (assignee.isActive === false) {
      throw new BadRequestException('Assignee account is disabled');
    }
    if (![Role.STAFF, Role.ADMIN].includes(assignee.role)) {
      throw new BadRequestException('Assignee must be staff or admin');
    }

    ticket.assignedTo = new Types.ObjectId(payload.assignedTo);
    if ([TicketStatus.OPEN, TicketStatus.REOPENED].includes(ticket.status)) {
      ticket.status = TicketStatus.IN_PROGRESS;
    }
    const systemMessage = await this.appendSystemMessage(
      ticket,
      actor,
      `Ticket assigned to ${payload.assignedTo}`,
      'ticket_assigned',
    );
    await ticket.save();

    const recipients = this.collectRecipients(
      [payload.assignedTo, ticket.createdBy.toString()],
      actor.userId,
    );
    await this.safeNotify(
      recipients,
      NotificationType.TICKET_ASSIGNED,
      `Ticket ${ticket.ticketNumber} assigned`,
      ticket.subject,
      {
        ticketId: ticket.id,
        assignedTo: payload.assignedTo,
        status: ticket.status,
      },
    );

    const response = this.toTicketResponse(ticket);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      this.toMessageResponse(systemMessage),
      false,
    );
    this.realtimePublisher.emitTicketUpdated(response);
    return response;
  }

  async updateTicketStatus(
    ticketId: string,
    actor: AuthUser,
    payload: UpdateTicketStatusDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    if (actor.role === Role.STAFF) {
      if (ticket.assignedTo?.toString() !== actor.userId) {
        throw new ForbiddenException(
          'Staff can only update tickets assigned to you',
        );
      }
      if (!STAFF_OPERATIONAL_STATUSES.includes(payload.status)) {
        throw new BadRequestException(
          'Staff can only set status to in_progress, awaiting_user, resolved, or escalated',
        );
      }
    }

    if (
      payload.status === TicketStatus.ESCALATED &&
      payload.escalatedTo &&
      !Types.ObjectId.isValid(payload.escalatedTo)
    ) {
      throw new BadRequestException('Invalid escalatedTo user id');
    }
    if (payload.status === TicketStatus.ESCALATED && !payload.escalatedTo) {
      throw new BadRequestException('Escalated ticket requires escalatedTo');
    }
    if (actor.role === Role.STAFF && payload.status === TicketStatus.ESCALATED) {
      const escalatedTo = await this.userModel
        .findById(payload.escalatedTo)
        .select({ _id: 1, role: 1, isActive: 1 })
        .exec();
      if (!escalatedTo || escalatedTo.isActive === false) {
        throw new BadRequestException('Invalid escalatedTo user');
      }
      if (escalatedTo.role !== Role.ADMIN) {
        throw new BadRequestException('Staff can only escalate to admin');
      }
    }

    const previousStatus = ticket.status;
    ticket.status = payload.status;

    if (payload.status === TicketStatus.RESOLVED) {
      ticket.resolvedAt = new Date();
    }

    if (payload.status === TicketStatus.CLOSED) {
      ticket.closedAt = new Date();
    }

    if (payload.status !== TicketStatus.CLOSED) {
      ticket.closedAt = undefined;
    }
    if (payload.status !== TicketStatus.RESOLVED) {
      ticket.resolvedAt = undefined;
    }

    if (payload.status === TicketStatus.ESCALATED) {
      ticket.isEscalated = true;
      ticket.escalatedTo = this.toObjectIdOrUndefined(payload.escalatedTo);
    } else {
      ticket.isEscalated = false;
      ticket.escalatedTo = undefined;
    }

    const baseMessage = `Status changed from ${previousStatus} to ${payload.status}`;
    const note = payload.note?.trim();
    const systemMessage = await this.appendSystemMessage(
      ticket,
      actor,
      note ? `${baseMessage}: ${note}` : baseMessage,
      'ticket_status_changed',
    );
    await ticket.save();

    const recipients = this.collectRecipients(
      [
        ticket.createdBy.toString(),
        ticket.assignedTo?.toString(),
        ticket.escalatedTo?.toString(),
      ],
      actor.userId,
    );
    await this.safeNotify(
      recipients,
      NotificationType.TICKET_STATUS_CHANGED,
      `Ticket ${ticket.ticketNumber} status updated`,
      `Current status: ${ticket.status}`,
      {
        ticketId: ticket.id,
        status: ticket.status,
      },
    );

    const response = this.toTicketResponse(ticket);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      this.toMessageResponse(systemMessage),
      false,
    );
    this.realtimePublisher.emitTicketUpdated(response);
    return response;
  }

  async createInternalNote(
    ticketId: string,
    actor: AuthUser,
    payload: CreateInternalNoteDto,
  ): Promise<TicketMessageResponseDto> {
    const ticket = await this.findTicketByIdOrFail(ticketId);
    this.ensureTicketWritable(ticket, actor);

    const now = new Date();
    const [note] = await this.ticketMessageModel.create([
      {
        ticketId: ticket._id,
        senderId: new Types.ObjectId(actor.userId),
        content: this.normalizeMessageContent(payload.content),
        attachments: this.normalizeAttachments(payload.attachments),
        isInternal: true,
        isSystem: false,
      },
    ]);

    this.bumpTicketAfterMessage(ticket, actor, now);
    await ticket.save();

    const responseMessage = this.toMessageResponse(note);
    this.realtimePublisher.emitTicketMessage(
      ticket.id,
      responseMessage,
      responseMessage.isInternal,
    );
    this.realtimePublisher.emitTicketUpdated(this.toTicketResponse(ticket));
    return responseMessage;
  }

  async listAssignableStaff(): Promise<
    Array<{
      id: string;
      fullName: string;
      role: Role.STAFF | Role.ADMIN;
    }>
  > {
    const items = await this.userModel
      .find({
        role: { $in: [Role.STAFF, Role.ADMIN] },
        isActive: { $ne: false },
      })
      .select({ _id: 1, fullName: 1, role: 1 })
      .sort({ role: 1, fullName: 1, createdAt: 1 })
      .exec();

    return items.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      role: item.role as Role.STAFF | Role.ADMIN,
    }));
  }

  private async resolveRelatedContext(
    actor: AuthUser,
    relatedTo: CreateTicketDto['relatedTo'] | undefined,
    category: TicketCategory,
  ): Promise<{
    relatedTo?: { type: TicketRelatedType; id: Types.ObjectId };
    defaultAssigneeId?: string;
  }> {
    if (!relatedTo) {
      return {};
    }

    const normalized = {
      type: relatedTo.type,
      id: new Types.ObjectId(relatedTo.id),
    };

    if (relatedTo.type !== TicketRelatedType.ORDER) {
      return {
        relatedTo: normalized,
      };
    }

    const order = await this.orderModel
      .findById(relatedTo.id)
      .select({ _id: 1, buyerId: 1, sellerId: 1, items: 1 })
      .exec();
    if (!order) {
      throw new NotFoundException('Related order not found');
    }

    if (
      !this.isStaffRole(actor.role) &&
      order.buyerId.toString() !== actor.userId
    ) {
      throw new ForbiddenException('You cannot create ticket for this order');
    }

    if (category === TicketCategory.CUSTOM_ORDER) {
      const customOrder = order.items.some(
        (item) => item.productType === ProductType.CUSTOM_ORDER,
      );
      if (!customOrder) {
        throw new BadRequestException(
          'Related order is not a custom-order type',
        );
      }
    }

    return {
      relatedTo: normalized,
      defaultAssigneeId: order.sellerId?.toString(),
    };
  }

  private async resolveAutoAssignee(input: {
    preferredUserId?: string;
    excludeUserId?: string;
  }): Promise<string | undefined> {
    const preferred = await this.validateAssignableUserId(input.preferredUserId);
    if (preferred && preferred !== input.excludeUserId) {
      return preferred;
    }

    return this.findLeastLoadAssignableStaffId(input.excludeUserId);
  }

  private async validateAssignableUserId(
    userId?: string,
  ): Promise<string | undefined> {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return undefined;
    }

    const user = await this.userModel
      .findById(userId)
      .select({ _id: 1, role: 1, isActive: 1 })
      .exec();
    if (!user || user.isActive === false) {
      return undefined;
    }
    if (![Role.STAFF, Role.ADMIN].includes(user.role)) {
      return undefined;
    }

    return user.id;
  }

  private async findLeastLoadAssignableStaffId(
    excludeUserId?: string,
  ): Promise<string | undefined> {
    const candidateFilter: Record<string, unknown> = {
      role: { $in: [Role.STAFF, Role.ADMIN] },
      isActive: { $ne: false },
    };
    if (excludeUserId && Types.ObjectId.isValid(excludeUserId)) {
      candidateFilter._id = { $ne: new Types.ObjectId(excludeUserId) };
    }

    const candidates = await this.userModel
      .find(candidateFilter)
      .select({ _id: 1, role: 1, createdAt: 1 })
      .lean()
      .exec();
    if (!candidates.length) {
      return undefined;
    }

    const candidateIds = candidates.map((item) => new Types.ObjectId(item._id));
    const ticketLoads = await this.ticketModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            assignedTo: { $in: candidateIds },
            status: { $in: OPEN_ASSIGNABLE_STATUSES },
          },
        },
        {
          $group: {
            _id: '$assignedTo',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();
    const loadMap = new Map(
      ticketLoads.map((item) => [item._id.toString(), item.count]),
    );

    const sorted = [...candidates].sort((a, b) => {
      const aCount = loadMap.get(String(a._id)) ?? 0;
      const bCount = loadMap.get(String(b._id)) ?? 0;
      if (aCount !== bCount) {
        return aCount - bCount;
      }

      const aRoleRank = a.role === Role.STAFF ? 0 : 1;
      const bRoleRank = b.role === Role.STAFF ? 0 : 1;
      if (aRoleRank !== bRoleRank) {
        return aRoleRank - bRoleRank;
      }

      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }

      return String(a._id).localeCompare(String(b._id));
    });

    const selected = sorted[0];
    return selected ? String(selected._id) : undefined;
  }

  private buildListFilter(
    query: TicketQueryDto,
    options: {
      includeAdminFilters: boolean;
      createdBy?: Types.ObjectId;
    },
  ) {
    const filter: Record<string, unknown> = {};

    if (options.createdBy) {
      filter.createdBy = options.createdBy;
    }

    if (query.status) {
      filter.status = query.status;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }
    if (query.category) {
      filter.category = query.category;
    }
    if (query.relatedType) {
      filter['relatedTo.type'] = query.relatedType;
    }
    if (query.relatedType && query.relatedId) {
      filter['relatedTo.id'] = new Types.ObjectId(query.relatedId);
    }

    if (options.includeAdminFilters && query.assignedTo) {
      filter.assignedTo = new Types.ObjectId(query.assignedTo);
    }
    if (options.includeAdminFilters && query.createdBy) {
      filter.createdBy = new Types.ObjectId(query.createdBy);
    }

    const keyword = query.q?.trim();
    if (keyword) {
      const safeRegex = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { subject: { $regex: safeRegex, $options: 'i' } },
        { ticketNumber: { $regex: safeRegex, $options: 'i' } },
      ];
    }

    return filter;
  }

  private async findTicketByIdOrFail(
    ticketId: string,
  ): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(ticketId).exec();
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  private ensureTicketReadable(ticket: TicketDocument, actor: AuthUser): void {
    if (actor.role === Role.ADMIN) {
      return;
    }
    if (actor.role === Role.STAFF) {
      const assignedTo = ticket.assignedTo?.toString();
      if (!assignedTo || assignedTo === actor.userId) {
        return;
      }
      throw new ForbiddenException(
        'Staff can only access assigned or unassigned tickets',
      );
    }
    this.ensureTicketOwner(ticket, actor.userId);
  }

  private ensureTicketWritable(ticket: TicketDocument, actor: AuthUser): void {
    if (actor.role === Role.ADMIN) {
      return;
    }
    if (actor.role === Role.STAFF) {
      if (ticket.assignedTo?.toString() === actor.userId) {
        return;
      }
      throw new ForbiddenException(
        'Staff can only update tickets assigned to you',
      );
    }
    this.ensureTicketOwner(ticket, actor.userId);
  }

  private ensureTicketOwner(ticket: TicketDocument, userId: string): void {
    if (ticket.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'You do not have permission for this ticket',
      );
    }
  }

  private bumpTicketAfterMessage(
    ticket: TicketDocument,
    actor: AuthUser,
    when: Date,
  ): void {
    ticket.messagesCount = (ticket.messagesCount ?? 0) + 1;
    ticket.lastMessageAt = when;
    ticket.lastMessageBy = this.mapRoleToLastMessageBy(actor.role);
    if (this.isStaffRole(actor.role) && !ticket.firstResponseAt) {
      ticket.firstResponseAt = when;
    }
  }

  private applyAutoStatusOnReply(
    ticket: TicketDocument,
    actor: AuthUser,
  ): void {
    const staffReply = this.isStaffRole(actor.role);
    if (staffReply) {
      if (
        [
          TicketStatus.OPEN,
          TicketStatus.IN_PROGRESS,
          TicketStatus.REOPENED,
        ].includes(ticket.status)
      ) {
        ticket.status = TicketStatus.AWAITING_USER;
      }
      return;
    }

    if (ticket.status === TicketStatus.AWAITING_USER) {
      ticket.status = TicketStatus.IN_PROGRESS;
    } else if (ticket.status === TicketStatus.OPEN) {
      ticket.status = TicketStatus.IN_PROGRESS;
    }
  }

  private async appendSystemMessage(
    ticket: TicketDocument,
    actor: AuthUser,
    content: string,
    systemEvent: string,
  ): Promise<TicketMessageDocument> {
    const [message] = await this.ticketMessageModel.create([
      {
        ticketId: ticket._id,
        senderId: new Types.ObjectId(actor.userId),
        content,
        attachments: [],
        isInternal: false,
        isSystem: true,
        systemEvent,
      },
    ]);

    this.bumpTicketAfterMessage(ticket, actor, message.createdAt ?? new Date());
    return message;
  }

  private async resolveStaffRecipientsForTicket(
    ticket: TicketDocument,
  ): Promise<string[]> {
    const recipients = new Set<string>();

    if (ticket.assignedTo) {
      recipients.add(ticket.assignedTo.toString());
    }
    if (ticket.escalatedTo) {
      recipients.add(ticket.escalatedTo.toString());
    }

    if (
      ticket.relatedTo?.type === TicketRelatedType.ORDER &&
      ticket.relatedTo.id &&
      Types.ObjectId.isValid(ticket.relatedTo.id.toString())
    ) {
      const order = await this.orderModel
        .findById(ticket.relatedTo.id)
        .select({ sellerId: 1 })
        .exec();
      if (order?.sellerId) {
        recipients.add(order.sellerId.toString());
      }
    }

    return [...recipients];
  }

  private async listAssignableStaffIds(
    excludeUserId?: string,
  ): Promise<string[]> {
    const staffMembers = await this.listAssignableStaff();
    return this.collectRecipients(
      staffMembers.map((item) => item.id),
      excludeUserId,
    );
  }

  private async safeNotify(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!userIds.length) {
      return;
    }

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          await this.notificationsService.createTicketNotification({
            userId,
            type,
            title,
            message,
            metadata,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to push ticket notification to user=${userId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }),
    );
  }

  private normalizeMessageContent(content: string): string {
    const trimmed = content?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException('Message content is required');
    }

    return trimmed;
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    const deduped = new Set<string>();
    for (const tag of tags) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      deduped.add(normalized.slice(0, 64));
      if (deduped.size >= 20) {
        break;
      }
    }

    return [...deduped];
  }

  private normalizeAttachments(
    attachments?: Array<{
      fileName: string;
      url: string;
      size?: number;
      mimeType?: string;
    }>,
  ) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [];
    }

    return attachments
      .map((item) => ({
        fileName: item.fileName.trim(),
        url: item.url.trim(),
        size: item.size,
        mimeType: item.mimeType?.trim(),
      }))
      .filter((item) => item.fileName.length > 0 && item.url.length > 0)
      .slice(0, 10);
  }

  private mapRoleToLastMessageBy(role: Role): TicketLastMessageBy {
    return this.isStaffRole(role)
      ? TicketLastMessageBy.STAFF
      : TicketLastMessageBy.USER;
  }

  private isStaffRole(role: Role): boolean {
    return role === Role.STAFF || role === Role.ADMIN;
  }

  private buildTicketNumber(ticketId: Types.ObjectId): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const suffix = ticketId.toString().slice(-6).toUpperCase();
    return `TK-${year}${month}${day}-${suffix}`;
  }

  private buildSla(priority: TicketPriority, now: Date) {
    const presets: Record<
      TicketPriority,
      { firstResponseMinutes: number; resolutionMinutes: number }
    > = {
      [TicketPriority.LOW]: {
        firstResponseMinutes: 24 * 60,
        resolutionMinutes: 72 * 60,
      },
      [TicketPriority.MEDIUM]: {
        firstResponseMinutes: 8 * 60,
        resolutionMinutes: 48 * 60,
      },
      [TicketPriority.HIGH]: {
        firstResponseMinutes: 2 * 60,
        resolutionMinutes: 24 * 60,
      },
      [TicketPriority.URGENT]: {
        firstResponseMinutes: 30,
        resolutionMinutes: 8 * 60,
      },
    };
    const preset = presets[priority];

    return {
      firstResponseDue: new Date(
        now.getTime() + preset.firstResponseMinutes * 60000,
      ),
      resolutionDue: new Date(now.getTime() + preset.resolutionMinutes * 60000),
    };
  }

  private buildCustomOrderInitialMessage(
    orderNumber: string,
    customData?: Record<string, unknown>,
  ): string {
    const rawMessage =
      typeof customData?.message === 'string'
        ? customData.message
        : typeof customData?.brief === 'string'
          ? customData.brief
          : undefined;

    if (rawMessage?.trim()) {
      return rawMessage.trim().slice(0, 4000);
    }

    if (customData && Object.keys(customData).length > 0) {
      const serialized = JSON.stringify(customData, null, 2) ?? '';
      return `Custom order request for ${orderNumber}:\n${serialized}`.slice(
        0,
        4000,
      );
    }

    return `Custom order request created for ${orderNumber}.`;
  }

  private toObjectIdOrUndefined(
    value: string | undefined,
  ): Types.ObjectId | undefined {
    if (!value || !Types.ObjectId.isValid(value)) {
      return undefined;
    }
    return new Types.ObjectId(value);
  }

  private collectRecipients(
    userIds: Array<string | undefined>,
    excludeUserId?: string,
  ): string[] {
    const deduped = new Set<string>();
    for (const userId of userIds) {
      if (!userId || !Types.ObjectId.isValid(userId)) {
        continue;
      }
      if (excludeUserId && userId === excludeUserId) {
        continue;
      }
      deduped.add(userId);
    }

    return [...deduped];
  }

  private toTicketResponse(ticket: TicketDocument): TicketResponseDto {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      createdBy: ticket.createdBy.toString(),
      assignedTo: ticket.assignedTo?.toString(),
      relatedTo: ticket.relatedTo
        ? {
            type: ticket.relatedTo.type,
            id: ticket.relatedTo.id.toString(),
          }
        : undefined,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      sla: {
        firstResponseDue: ticket.sla.firstResponseDue,
        resolutionDue: ticket.sla.resolutionDue,
      },
      firstResponseAt: ticket.firstResponseAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      satisfaction: ticket.satisfaction
        ? {
            rating: ticket.satisfaction.rating,
            comment: ticket.satisfaction.comment,
            ratedAt: ticket.satisfaction.ratedAt,
          }
        : undefined,
      tags: Array.isArray(ticket.tags) ? ticket.tags : [],
      isEscalated: ticket.isEscalated === true,
      escalatedTo: ticket.escalatedTo?.toString(),
      messagesCount: ticket.messagesCount ?? 0,
      lastMessageAt: ticket.lastMessageAt,
      lastMessageBy: ticket.lastMessageBy,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  private toMessageResponse(
    message: TicketMessageDocument,
  ): TicketMessageResponseDto {
    return {
      id: message.id,
      ticketId: message.ticketId.toString(),
      senderId: message.senderId?.toString(),
      content: message.content,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((item) => ({
            fileName: item.fileName,
            url: item.url,
            size: item.size,
            mimeType: item.mimeType,
          }))
        : [],
      isInternal: message.isInternal === true,
      isSystem: message.isSystem === true,
      systemEvent: message.systemEvent,
      createdAt: message.createdAt,
    };
  }
}
