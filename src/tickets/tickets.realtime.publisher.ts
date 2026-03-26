import { Injectable } from '@nestjs/common';
import {
  TicketMessageResponseDto,
  TicketResponseDto,
} from './dto/ticket-response.dto';

export interface TicketsRealtimeEmitter {
  emitTicketMessage(
    ticketId: string,
    message: TicketMessageResponseDto,
    isInternal: boolean,
  ): void;
  emitTicketUpdated(ticket: TicketResponseDto): void;
}

@Injectable()
export class TicketsRealtimePublisher {
  private emitter?: TicketsRealtimeEmitter;

  bindEmitter(emitter: TicketsRealtimeEmitter): void {
    this.emitter = emitter;
  }

  emitTicketMessage(
    ticketId: string,
    message: TicketMessageResponseDto,
    isInternal: boolean,
  ): void {
    this.emitter?.emitTicketMessage(ticketId, message, isInternal);
  }

  emitTicketUpdated(ticket: TicketResponseDto): void {
    this.emitter?.emitTicketUpdated(ticket);
  }
}
