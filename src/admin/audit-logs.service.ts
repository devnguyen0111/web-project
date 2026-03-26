import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLog, AuditSeverity } from './schemas/audit-log.schema';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLog>,
  ) {}

  async logWrite(input: {
    userId?: string;
    userRole?: string;
    ip?: string;
    userAgent?: string;
    method: string;
    route: string;
    action: string;
    target?: string;
    statusCode: number;
    severity: AuditSeverity;
    errorMessage?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditLogModel.create({
      userId:
        input.userId && Types.ObjectId.isValid(input.userId)
          ? new Types.ObjectId(input.userId)
          : undefined,
      userRole: input.userRole,
      ip: input.ip,
      userAgent: input.userAgent,
      method: input.method,
      route: input.route,
      action: input.action,
      target: input.target,
      statusCode: input.statusCode,
      severity: input.severity,
      errorMessage: input.errorMessage,
      details: input.details,
    });
  }

  async list(query: AuditLogQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const filter: Record<string, unknown> = {};

    if (query.action?.trim()) {
      filter.action = query.action.trim();
    }

    if (query.severity) {
      filter.severity = query.severity;
    }

    if (query.userId && Types.ObjectId.isValid(query.userId)) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        (filter.createdAt as Record<string, unknown>).$gte = new Date(
          query.from,
        );
      }
      if (query.to) {
        (filter.createdAt as Record<string, unknown>).$lte = new Date(query.to);
      }
    }

    const [items, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }
}
