import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../common/constants/roles.constant';
import { User } from '../users/schemas/user.schema';
import { Post, PostStatus } from '../blog/posts/schemas/post.schema';
import {
  Product,
  ProductStatus,
} from '../store/products/schemas/product.schema';
import { Order, OrderStatus } from '../store/orders/schemas/order.schema';
import { Ticket, TicketStatus } from '../tickets/schemas/ticket.schema';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../wallet/schemas/transaction.schema';
import {
  AggregationGroupBy,
  AggregationQueryDto,
} from './dto/aggregation-query.dto';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<Ticket>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<Transaction>,
  ) {}

  async getStats() {
    const [
      usersTotal,
      usersActive,
      usersByRoleAgg,
      postsTotal,
      postsPublished,
      postsPending,
      productsTotal,
      productsActive,
      productsPending,
      ordersTotal,
      ordersRevenueCount,
      ticketsTotal,
      ticketsOpen,
      transactionsTotal,
      depositsCompleted,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ isActive: { $ne: false } }),
      this.userModel.aggregate<{ _id: Role; count: number }>([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      this.postModel.countDocuments(),
      this.postModel.countDocuments({ status: PostStatus.PUBLISHED }),
      this.postModel.countDocuments({ status: PostStatus.PENDING }),
      this.productModel.countDocuments(),
      this.productModel.countDocuments({ status: ProductStatus.ACTIVE }),
      this.productModel.countDocuments({
        status: ProductStatus.PENDING_REVIEW,
      }),
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({
        status: {
          $in: [OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED],
        },
      }),
      this.ticketModel.countDocuments(),
      this.ticketModel.countDocuments({
        status: {
          $in: [
            TicketStatus.OPEN,
            TicketStatus.REOPENED,
            TicketStatus.IN_PROGRESS,
            TicketStatus.AWAITING_USER,
            TicketStatus.ESCALATED,
          ],
        },
      }),
      this.transactionModel.countDocuments(),
      this.transactionModel.countDocuments({
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
      }),
    ]);

    const usersByRole = usersByRoleAgg.reduce<Record<string, number>>(
      (result, item) => {
        if (item._id) {
          result[item._id] = item.count;
        }
        return result;
      },
      {},
    );

    return {
      users: {
        total: usersTotal,
        active: usersActive,
        byRole: usersByRole,
      },
      content: {
        postsTotal,
        postsPublished,
        postsPending,
        productsTotal,
        productsActive,
        productsPending,
      },
      commerce: {
        ordersTotal,
        revenueTrackedOrders: ordersRevenueCount,
        transactionsTotal,
        depositsCompleted,
      },
      support: {
        ticketsTotal,
        ticketsOpen,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getRevenue(query: AggregationQueryDto) {
    const range = this.resolveRange(query);
    const format = this.getDateFormat(query.groupBy);

    const series = await this.orderModel.aggregate<{
      _id: string;
      revenue: number;
      orders: number;
    }>([
      {
        $match: {
          createdAt: {
            $gte: range.from,
            $lte: range.to,
          },
          status: {
            $in: [
              OrderStatus.PAID,
              OrderStatus.DELIVERED,
              OrderStatus.COMPLETED,
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format,
              date: '$createdAt',
            },
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totals = series.reduce(
      (acc, item) => {
        acc.totalRevenue += item.revenue;
        acc.totalOrders += item.orders;
        return acc;
      },
      { totalRevenue: 0, totalOrders: 0 },
    );

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      groupBy: query.groupBy,
      ...totals,
      series: series.map((item) => ({
        period: item._id,
        revenue: item.revenue,
        orders: item.orders,
      })),
    };
  }

  async getUsersGrowth(query: AggregationQueryDto) {
    const range = this.resolveRange(query);
    const format = this.getDateFormat(query.groupBy);

    const [baseCount, rawSeries] = await Promise.all([
      this.userModel.countDocuments({ createdAt: { $lt: range.from } }),
      this.userModel.aggregate<{ _id: string; newUsers: number }>([
        {
          $match: {
            createdAt: {
              $gte: range.from,
              $lte: range.to,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format,
                date: '$createdAt',
              },
            },
            newUsers: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    let runningTotal = baseCount;
    const series = rawSeries.map((item) => {
      runningTotal += item.newUsers;
      return {
        period: item._id,
        newUsers: item.newUsers,
        totalUsers: runningTotal,
      };
    });

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      groupBy: query.groupBy,
      baseCount,
      series,
    };
  }

  private resolveRange(query: AggregationQueryDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      from,
      to,
    };
  }

  private getDateFormat(groupBy: AggregationGroupBy): string {
    if (groupBy === AggregationGroupBy.MONTH) {
      return '%Y-%m';
    }

    if (groupBy === AggregationGroupBy.WEEK) {
      return '%Y-W%U';
    }

    return '%Y-%m-%d';
  }
}
