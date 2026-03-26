export const NOTIFICATIONS_WS_NAMESPACE =
  process.env.WS_NOTIFICATIONS_NAMESPACE?.trim() || '/notifications';

export const NOTIFICATIONS_WS_EVENTS = {
  READY: 'notifications:ready',
  NEW: 'notifications:new',
  UNREAD_COUNT: 'notifications:unread-count',
  READ: 'notifications:read',
  READ_ALL: 'notifications:read-all',
  ERROR: 'notifications:error',
} as const;

export const buildNotificationsUserRoom = (userId: string) => `user:${userId}`;
