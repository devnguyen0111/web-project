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
import { AUTHOR_PLUS_ROLES, Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { RateTicketDto } from './dto/rate-ticket.dto';
import { ReopenTicketDto } from './dto/reopen-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { TicketsService } from './tickets.service';

type AuthUser = {
  userId: string;
  role: Role;
};

@ApiTags('tickets')
@ApiBearerAuth()
@Roles(...AUTHOR_PLUS_ROLES)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Create support ticket' })
  @ApiBody({ type: CreateTicketDto })
  create(@CurrentUser() user: AuthUser, @Body() payload: CreateTicketDto) {
    return this.ticketsService.createTicket(user, payload);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my tickets' })
  listMine(
    @CurrentUser('userId') userId: string,
    @Query() query: TicketQueryDto,
  ) {
    return this.ticketsService.listMine(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket detail (owner/staff/admin)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  detail(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.getTicketDetail(id, user);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send message in ticket' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: CreateTicketMessageDto })
  addMessage(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: CreateTicketMessageDto,
  ) {
    return this.ticketsService.addMessage(id, user, payload);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Close ticket (owner)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: CloseTicketDto, required: false })
  close(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: CloseTicketDto,
  ) {
    return this.ticketsService.closeTicket(id, user, payload);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reopen ticket (owner)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: ReopenTicketDto, required: false })
  reopen(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: ReopenTicketDto,
  ) {
    return this.ticketsService.reopenTicket(id, user, payload);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Rate ticket after resolution/closure (owner)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of ticket' })
  @ApiBody({ type: RateTicketDto })
  rate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() payload: RateTicketDto,
  ) {
    return this.ticketsService.rateTicket(id, user, payload);
  }
}
