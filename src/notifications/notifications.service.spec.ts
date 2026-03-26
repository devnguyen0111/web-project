import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  NotificationCategory,
  NotificationType,
} from './schemas/notification.schema';
import { NotificationsRealtimePublisher } from './notifications.realtime.publisher';
import { NotificationsService } from './notifications.service';

const USER_ID = '507f1f77bcf86cd799439011';
const NOTIFICATION_ID = '507f1f77bcf86cd799439022';

const createNotificationDocument = (input?: {
  readAt?: Date;
  title?: string;
  message?: string;
}) => {
  const save = jest.fn().mockResolvedValue(undefined);
  return {
    id: NOTIFICATION_ID,
    userId: new Types.ObjectId(USER_ID),
    category: NotificationCategory.SUBSCRIPTION,
    type: NotificationType.SUBSCRIPTION_RENEWED,
    title: input?.title ?? 'Title',
    message: input?.message ?? 'Message',
    readAt: input?.readAt,
    metadata: undefined,
    createdAt: new Date('2026-03-24T12:00:00.000Z'),
    updatedAt: new Date('2026-03-24T12:00:00.000Z'),
    save,
  };
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationModel: {
    create: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    updateMany: jest.Mock;
  };
  let realtimePublisher: {
    emitNotificationCreated: jest.Mock<void, [string, unknown]>;
    emitUnreadCount: jest.Mock<void, [string, number]>;
    emitNotificationRead: jest.Mock<void, [string, string, Date]>;
    emitNotificationsReadAll: jest.Mock<void, [string, number, Date]>;
  };

  beforeEach(() => {
    notificationModel = {
      create: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      updateMany: jest.fn(),
    };
    realtimePublisher = {
      emitNotificationCreated: jest.fn(),
      emitUnreadCount: jest.fn(),
      emitNotificationRead: jest.fn(),
      emitNotificationsReadAll: jest.fn(),
    };

    service = new NotificationsService(
      notificationModel as never,
      realtimePublisher as unknown as NotificationsRealtimePublisher,
    );
  });

  it('emits new and unread-count events after creating notification', async () => {
    const document = createNotificationDocument();
    notificationModel.create.mockResolvedValue([document]);
    notificationModel.countDocuments.mockResolvedValue(3);

    const created = await service.createSubscriptionNotification({
      userId: USER_ID,
      type: NotificationType.SUBSCRIPTION_RENEWED,
      title: 'Renewed',
      message: 'Your plan has been renewed.',
    });

    expect(created).toBe(document);
    expect(realtimePublisher.emitNotificationCreated).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        id: NOTIFICATION_ID,
        userId: USER_ID,
      }),
    );
    expect(realtimePublisher.emitUnreadCount).toHaveBeenCalledWith(USER_ID, 3);
  });

  it('emits read and unread-count when markRead changes unread notification', async () => {
    const document = createNotificationDocument({ readAt: undefined });
    notificationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(document),
    });
    notificationModel.countDocuments.mockResolvedValue(2);

    const result = await service.markRead(USER_ID, NOTIFICATION_ID);

    expect(document.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(NOTIFICATION_ID);
    expect(realtimePublisher.emitNotificationRead).toHaveBeenCalledWith(
      USER_ID,
      NOTIFICATION_ID,
      expect.any(Date),
    );
    expect(realtimePublisher.emitUnreadCount).toHaveBeenCalledWith(USER_ID, 2);
  });

  it('does not emit read events when markRead hits already-read notification', async () => {
    const document = createNotificationDocument({
      readAt: new Date('2026-03-24T12:30:00.000Z'),
    });
    notificationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(document),
    });

    await service.markRead(USER_ID, NOTIFICATION_ID);

    expect(document.save).not.toHaveBeenCalled();
    expect(realtimePublisher.emitNotificationRead).not.toHaveBeenCalled();
    expect(realtimePublisher.emitUnreadCount).not.toHaveBeenCalled();
  });

  it('throws not-found when markRead cannot find notification', async () => {
    notificationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.markRead(USER_ID, NOTIFICATION_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emits read-all and unread-count when markAllRead updates records', async () => {
    notificationModel.updateMany.mockResolvedValue({ modifiedCount: 4 });
    notificationModel.countDocuments.mockResolvedValue(0);

    const result = await service.markAllRead(USER_ID);

    expect(result).toEqual({ updated: 4 });
    expect(realtimePublisher.emitNotificationsReadAll).toHaveBeenCalledWith(
      USER_ID,
      4,
      expect.any(Date),
    );
    expect(realtimePublisher.emitUnreadCount).toHaveBeenCalledWith(USER_ID, 0);
  });

  it('does not emit read-all event when nothing is updated', async () => {
    notificationModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const result = await service.markAllRead(USER_ID);

    expect(result).toEqual({ updated: 0 });
    expect(realtimePublisher.emitNotificationsReadAll).not.toHaveBeenCalled();
    expect(realtimePublisher.emitUnreadCount).not.toHaveBeenCalled();
  });
});
