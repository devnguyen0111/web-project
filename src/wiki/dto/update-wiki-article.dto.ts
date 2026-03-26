import { PartialType } from '@nestjs/swagger';
import { CreateWikiArticleDto } from './create-wiki-article.dto';

export class UpdateWikiArticleDto extends PartialType(CreateWikiArticleDto) {}

