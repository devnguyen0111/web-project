import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Role } from '../constants/roles.constant';
import { AuditLogsService } from '../../admin/audit-logs.service';
import { AuditSeverity } from '../../admin/schemas/audit-log.schema';

type AuthenticatedRequestUser = {
  userId?: string;
  role?: Role;
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);
  private readonly writableMethods = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ]);
  private readonly sensitiveKeys = [
    'password',
    'token',
    'secret',
    'code',
    'backupcode',
    'backupcodes',
    'refreshtoken',
  ];

  constructor(private readonly auditLogsService: AuditLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = (request?.method || '').toUpperCase();
    if (!this.writableMethods.has(method)) {
      return next.handle();
    }

    const route = this.getNormalizedRoute(request);
    const action = `${method} ${route}`;
    const user = (request?.user || {}) as AuthenticatedRequestUser;
    const target = this.resolveTarget(request?.params || {});
    const details = {
      params: this.sanitizePayload(request?.params || {}),
      query: this.sanitizePayload(request?.query || {}),
      body: this.sanitizePayload(request?.body || {}),
    };

    return next.handle().pipe(
      tap(() => {
        const statusCode =
          typeof response?.statusCode === 'number' ? response.statusCode : 200;
        this.logEvent({
          userId: user.userId,
          userRole: user.role,
          ip: request?.ip,
          userAgent: request?.headers?.['user-agent'],
          method,
          route,
          action,
          target,
          details,
          statusCode,
          severity: this.mapSeverity(statusCode),
        });
      }),
      catchError((error: unknown) => {
        const statusCode = this.resolveErrorStatus(error, response?.statusCode);
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        this.logEvent({
          userId: user.userId,
          userRole: user.role,
          ip: request?.ip,
          userAgent: request?.headers?.['user-agent'],
          method,
          route,
          action,
          target,
          details,
          statusCode,
          severity: this.mapSeverity(statusCode),
          errorMessage: message,
        });

        return throwError(() => error);
      }),
    );
  }

  private logEvent(input: {
    userId?: string;
    userRole?: string;
    ip?: string;
    userAgent?: string;
    method: string;
    route: string;
    action: string;
    target?: string;
    details: Record<string, unknown>;
    statusCode: number;
    severity: AuditSeverity;
    errorMessage?: string;
  }): void {
    void this.auditLogsService.logWrite(input).catch((error) => {
      this.logger.warn(
        `Failed to write audit log (${input.action}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    });
  }

  private getNormalizedRoute(request: {
    baseUrl?: string;
    route?: { path?: string };
    originalUrl?: string;
  }): string {
    const routePath = request.route?.path;
    if (routePath) {
      return `${request.baseUrl || ''}${routePath}`;
    }

    const originalUrl = request.originalUrl || '';
    const [pathOnly] = originalUrl.split('?');
    return pathOnly || '/';
  }

  private resolveTarget(params: Record<string, unknown>): string | undefined {
    const keys = [
      'id',
      'userId',
      'postId',
      'orderId',
      'ticketId',
      'productId',
      'transactionId',
      'commentId',
      'reviewId',
    ];

    for (const key of keys) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private resolveErrorStatus(error: unknown, fallback?: number): number {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : fallback;

    if (typeof status === 'number' && status >= 100 && status <= 599) {
      return status;
    }

    return 500;
  }

  private mapSeverity(statusCode: number): AuditSeverity {
    if (statusCode >= 500) {
      return AuditSeverity.ERROR;
    }
    if (statusCode >= 400) {
      return AuditSeverity.WARNING;
    }

    return AuditSeverity.INFO;
  }

  private sanitizePayload(payload: unknown): unknown {
    if (Array.isArray(payload)) {
      return payload.map((item) => this.sanitizePayload(item));
    }

    if (payload && typeof payload === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]';
          continue;
        }
        sanitized[key] = this.sanitizePayload(value);
      }
      return sanitized;
    }

    if (typeof payload === 'string') {
      if (payload.length > 2000) {
        return `${payload.slice(0, 2000)}...[truncated]`;
      }
      return payload;
    }

    return payload;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.replace(/[^a-zA-Z]/g, '').toLowerCase();
    return this.sensitiveKeys.some((sensitiveKey) =>
      normalized.includes(sensitiveKey),
    );
  }
}
