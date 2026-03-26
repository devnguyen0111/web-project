export const TICKETS_WS_NAMESPACE =
  process.env.WS_TICKETS_NAMESPACE?.trim() || '/tickets';

export const TICKETS_WS_EVENTS = {
  READY: 'tickets:ready',
  SUBSCRIBE: 'tickets:subscribe',
  UNSUBSCRIBE: 'tickets:unsubscribe',
  SUBSCRIBED: 'tickets:subscribed',
  MESSAGE: 'tickets:message',
  TICKET_UPDATED: 'tickets:ticket-updated',
  ERROR: 'tickets:error',
} as const;

export const buildTicketPublicRoom = (ticketId: string) =>
  `ticket:${ticketId}:public`;

export const buildTicketInternalRoom = (ticketId: string) =>
  `ticket:${ticketId}:internal`;
