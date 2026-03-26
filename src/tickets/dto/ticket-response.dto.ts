import {
  TicketCategory,
  TicketLastMessageBy,
  TicketPriority,
  TicketRelatedType,
  TicketStatus,
} from '../schemas/ticket.schema';

export class TicketRelatedResponseDto {
  type: TicketRelatedType;
  id: string;
}

export class TicketSlaResponseDto {
  firstResponseDue: Date;
  resolutionDue: Date;
}

export class TicketSatisfactionResponseDto {
  rating?: number;
  comment?: string;
  ratedAt?: Date;
}

export class TicketMessageAttachmentResponseDto {
  fileName: string;
  url: string;
  size?: number;
  mimeType?: string;
}

export class TicketMessageResponseDto {
  id: string;
  ticketId: string;
  senderId?: string;
  content: string;
  attachments: TicketMessageAttachmentResponseDto[];
  isInternal: boolean;
  isSystem: boolean;
  systemEvent?: string;
  createdAt?: Date;
}

export class TicketResponseDto {
  id: string;
  ticketNumber: string;
  createdBy: string;
  assignedTo?: string;
  relatedTo?: TicketRelatedResponseDto;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  sla: TicketSlaResponseDto;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  satisfaction?: TicketSatisfactionResponseDto;
  tags: string[];
  isEscalated: boolean;
  escalatedTo?: string;
  messagesCount: number;
  lastMessageAt?: Date;
  lastMessageBy: TicketLastMessageBy;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TicketDetailResponseDto {
  ticket: TicketResponseDto;
  messages: TicketMessageResponseDto[];
}
