import { Injectable, Logger } from '@nestjs/common';

type QueueTask = {
  id: string;
  attempt: number;
  run: () => Promise<void>;
};

@Injectable()
export class NotificationMailQueueService {
  private readonly logger = new Logger(NotificationMailQueueService.name);
  private readonly maxAttempts = 3;
  private readonly queue: QueueTask[] = [];
  private processing = false;

  enqueue(task: () => Promise<void>): void {
    this.queue.push({
      id: `mail-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      attempt: 1,
      run: task,
    });
    this.scheduleProcess();
  }

  private scheduleProcess(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    setImmediate(() => {
      void this.processLoop();
    });
  }

  private async processLoop(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (!task) {
          continue;
        }

        try {
          await task.run();
        } catch (error) {
          if (task.attempt >= this.maxAttempts) {
            this.logger.error(
              `Mail queue task failed permanently (${task.id}): ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            );
            continue;
          }

          const nextAttempt = task.attempt + 1;
          const delayMs = 250 * nextAttempt;
          this.logger.warn(
            `Mail queue task retry (${task.id}) attempt=${nextAttempt} in ${delayMs}ms`,
          );
          setTimeout(() => {
            this.queue.push({ ...task, attempt: nextAttempt });
            this.scheduleProcess();
          }, delayMs);
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this.scheduleProcess();
      }
    }
  }
}
