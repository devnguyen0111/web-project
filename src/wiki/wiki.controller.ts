import {
  Body,
  Controller,
  Delete,
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
import { AUTHENTICATED_ROLES, Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { CreateWikiArticleDto } from './dto/create-wiki-article.dto';
import { UpdateWikiArticleDto } from './dto/update-wiki-article.dto';
import { WikiHelpfulVoteDto } from './dto/wiki-helpful-vote.dto';
import { WikiQueryDto } from './dto/wiki-query.dto';
import { WikiService } from './wiki.service';

@ApiTags('wiki')
@Controller('wiki')
export class WikiController {
  constructor(private readonly wikiService: WikiService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public wiki articles' })
  list(@Query() query: WikiQueryDto) {
    return this.wikiService.listPublic(query);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'List active wiki categories' })
  listCategories() {
    return this.wikiService.listCategories();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get public wiki article by slug' })
  @ApiParam({ name: 'slug', description: 'Wiki article slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.wikiService.getPublicBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create wiki article' })
  @ApiBody({ type: CreateWikiArticleDto })
  create(
    @CurrentUser('userId') actorUserId: string,
    @Body() payload: CreateWikiArticleDto,
  ) {
    return this.wikiService.createArticle(actorUserId, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update wiki article and create new version' })
  @ApiParam({ name: 'id', description: 'Wiki article ObjectId' })
  @ApiBody({ type: UpdateWikiArticleDto })
  update(
    @Param('id', ParseObjectIdPipe) articleId: string,
    @CurrentUser('userId') actorUserId: string,
    @Body() payload: UpdateWikiArticleDto,
  ) {
    return this.wikiService.updateArticle(articleId, actorUserId, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Archive wiki article' })
  @ApiParam({ name: 'id', description: 'Wiki article ObjectId' })
  remove(
    @Param('id', ParseObjectIdPipe) articleId: string,
    @CurrentUser('userId') actorUserId: string,
  ) {
    return this.wikiService.archiveArticle(articleId, actorUserId);
  }

  @ApiBearerAuth()
  @Roles(...AUTHENTICATED_ROLES)
  @Post(':id/helpful')
  @ApiOperation({ summary: 'Vote helpful for wiki article' })
  @ApiParam({ name: 'id', description: 'Wiki article ObjectId' })
  @ApiBody({ type: WikiHelpfulVoteDto })
  voteHelpful(
    @Param('id', ParseObjectIdPipe) articleId: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: WikiHelpfulVoteDto,
  ) {
    return this.wikiService.voteHelpful(articleId, userId, payload);
  }
}

