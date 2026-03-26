import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
    private readonly corsCredentials: boolean,
  ) {
    super(app);
  }

  override createIOServer(port: number, options: Record<string, unknown> = {}) {
    const fallbackOrigin =
      this.corsOrigins.length === 0 || this.corsOrigins.includes('*')
        ? true
        : this.corsOrigins;

    const serverOptions = {
      ...options,
      cors: {
        origin: fallbackOrigin,
        credentials: this.corsCredentials,
        ...((options.cors as Record<string, unknown> | undefined) ?? {}),
      },
    };

    return super.createIOServer(port, serverOptions);
  }
}
