import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '../common/constants/roles.constant';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AdminTicketsController } from './admin-tickets.controller';
import { TicketsService } from './tickets.service';

describe('AdminTicketsController', () => {
  let controller: AdminTicketsController;
  const ticketsService = {
    listForAdmin: jest.fn(),
    assignTicket: jest.fn(),
    updateTicketStatus: jest.fn(),
    createInternalNote: jest.fn(),
    listAssignableStaff: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminTicketsController(
      ticketsService as unknown as TicketsService,
    );
  });

  it('uses staff/admin role guard metadata on controller', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminTicketsController);
    expect(roles).toEqual([Role.STAFF, Role.ADMIN]);
  });

  it('maps assignees endpoint and delegates to service', async () => {
    ticketsService.listAssignableStaff.mockResolvedValue([
      { id: 'u1', fullName: 'Support Staff', role: Role.STAFF },
    ]);

    const result = await controller.listAssignees();

    expect(result).toEqual([
      { id: 'u1', fullName: 'Support Staff', role: Role.STAFF },
    ]);
    expect(ticketsService.listAssignableStaff).toHaveBeenCalledTimes(1);
    const routePath = Reflect.getMetadata(
      PATH_METADATA,
      AdminTicketsController.prototype.listAssignees,
    );
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      AdminTicketsController.prototype.listAssignees,
    );
    expect(routePath).toBe('assignees');
    expect(method).toBe(RequestMethod.GET);
  });
});
