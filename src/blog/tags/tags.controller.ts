import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/constants/roles.constant';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagsService } from './tags.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List popular tags' })
  listPopular() {
    return this.tagsService.findPublicPopular();
  }

  @Public()
  @Get(':slug/posts')
  @ApiOperation({ summary: 'List published posts by tag slug' })
  @ApiParam({ name: 'slug' })
  listPostsByTagSlug(@Param('slug') slug: string) {
    return this.tagsService.findPublishedPostsBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Get('admin/all')
  @ApiOperation({ summary: 'List all tags (staff/admin)' })
  listAll() {
    return this.tagsService.findAll();
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create tag (staff/admin)' })
  @ApiBody({ type: CreateTagDto })
  create(@Body() payload: CreateTagDto) {
    return this.tagsService.create(payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update tag (staff/admin)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateTagDto })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateTagDto,
  ) {
    return this.tagsService.update(id, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete tag (staff/admin)' })
  @ApiParam({ name: 'id' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.tagsService.remove(id);
  }
}
