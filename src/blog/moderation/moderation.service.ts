import { Injectable } from '@nestjs/common';
import { PostsQueryDto } from '../posts/dto/posts-query.dto';
import { PostsService } from '../posts/posts.service';

@Injectable()
export class ModerationService {
  constructor(private readonly postsService: PostsService) {}

  listPending(query: PostsQueryDto) {
    return this.postsService.listPending(query);
  }

  approve(postId: string, reviewerId: string) {
    return this.postsService.approve(postId, reviewerId);
  }

  reject(postId: string, reviewerId: string, reason: string) {
    return this.postsService.reject(postId, reviewerId, reason);
  }
}
