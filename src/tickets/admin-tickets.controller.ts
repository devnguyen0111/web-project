import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateInternalNoteDto } from './dto/create-internal-note.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { TicketsService } from './tickets.service';

type AuthUser = {
  userId: string;
  role: Role;
};

@ApiTags('admin-tickets')
@ApiBearerAuth()
@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/tickets')
export class AdminTicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('assignees')
  @ApiOperation({ summary: 'List active staff/admin assignees' })
  listAssignees() {
    return this.ticketsService.listAssignableStaff();
  }

  @Get()
  @ApiOperation({ summary: 'List all tickets (staff/admin)' })
  list(@CurrentUser() user: AuthUser, @Query() query: TicketQueryDto) {
    return this.ticketsService.listForAdmin(user, query);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign ticket to staff/admin' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: AssignTicketDto })
  assign(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: AssignTicketDto,
  ) {
    return this.ticketsService.assignTicket(id, user, payload);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update ticket status (staff/admin)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: UpdateTicketStatusDto })
  updateStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: UpdateTicketStatusDto,
  ) {
    return this.ticketsService.updateTicketStatus(id, user, payload);
  }

  @Post(':id/internal-note')
  @ApiOperation({ summary: 'Add internal note to ticket (staff/admin)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: CreateInternalNoteDto })
  createInternalNote(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: CreateInternalNoteDto,
  ) {
    return this.ticketsService.createInternalNote(id, user, payload);
  }
}
