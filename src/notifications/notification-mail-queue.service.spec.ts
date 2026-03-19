import { NotificationMailQueueService } from './notification-mail-queue.service';

describe('NotificationMailQueueService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('retries failed mail task and succeeds before max attempts', async () => {
    const service = new NotificationMailQueueService();
    const logger = (service as unknown as { logger: { warn: jest.Mock } }).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const task = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error('temporary-1'))
      .mockRejectedValueOnce(new Error('temporary-2'))
      .mockResolvedValue(undefined);

    service.enqueue(task);

    await jest.runOnlyPendingTimersAsync();
    await jest.advanceTimersByTimeAsync(500);
    await jest.runOnlyPendingTimersAsync();
    await jest.advanceTimersByTimeAsync(750);
    await jest.runOnlyPendingTimersAsync();

    expect(task).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('marks task as permanently failed after max attempts', async () => {
    const service = new NotificationMailQueueService();
    const logger = (service as unknown as {
      logger: { error: jest.Mock; warn: jest.Mock };
    }).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const task = jest.fn<Promise<void>, []>().mockRejectedValue(new Error('hard-fail'));
    service.enqueue(task);

    await jest.runOnlyPendingTimersAsync();
    await jest.advanceTimersByTimeAsync(500);
    await jest.runOnlyPendingTimersAsync();
    await jest.advanceTimersByTimeAsync(750);
    await jest.runOnlyPendingTimersAsync();

    expect(task).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
