import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toSlug } from '../../common/utils/slug.util';
import { Post, PostStatus } from '../posts/schemas/post.schema';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { Tag, TagDocument } from './schemas/tag.schema';

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  async create(payload: CreateTagDto): Promise<TagDocument> {
    const normalizedName = payload.name.toLowerCase().trim();

    const existing = await this.tagModel
      .findOne({ name: normalizedName })
      .exec();
    if (existing) {
      throw new ConflictException('Tag name already exists');
    }

    const slug = await this.ensureUniqueSlug(normalizedName);

    return this.tagModel.create({
      ...payload,
      name: normalizedName,
      slug,
    });
  }

  async findPublicPopular() {
    return this.tagModel
      .find({ isApproved: true })
      .sort({ usageCount: -1, createdAt: -1 })
      .limit(100);
  }

  async findAll() {
    return this.tagModel.find().sort({ createdAt: -1 });
  }

  async findPublishedPostsBySlug(slug: string) {
    const tag = await this.tagModel.findOne({ slug, isApproved: true }).exec();
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return this.postModel
      .find({ tags: tag._id, status: PostStatus.PUBLISHED })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
  }

  async update(id: string, payload: UpdateTagDto): Promise<TagDocument> {
    const updatePayload: Record<string, unknown> = { ...payload };

    if (payload.name) {
      const normalizedName = payload.name.toLowerCase().trim();
      updatePayload.name = normalizedName;
      updatePayload.slug = await this.ensureUniqueSlug(normalizedName, id);
    }

    const tag = await this.tagModel
      .findByIdAndUpdate(id, updatePayload, {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  async remove(id: string) {
    const tag = await this.tagModel.findByIdAndDelete(id).exec();

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return { message: 'Tag deleted successfully' };
  }

  async incrementUsage(tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }

    await this.tagModel.updateMany(
      { _id: { $in: tagIds } },
      { $inc: { usageCount: 1 } },
    );
  }

  async decrementUsage(tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }

    await this.tagModel.updateMany(
      { _id: { $in: tagIds } },
      { $inc: { usageCount: -1 } },
    );
  }

  async existsMany(tagIds: string[]): Promise<boolean> {
    if (tagIds.length === 0) {
      return true;
    }

    const count = await this.tagModel.countDocuments({ _id: { $in: tagIds } });
    return count === tagIds.length;
  }

  private async ensureUniqueSlug(
    name: string,
    ignoreId?: string,
  ): Promise<string> {
    const baseSlug = toSlug(name);
    let slug = baseSlug;
    let index = 1;

    while (true) {
      const existing = await this.tagModel.findOne({ slug }).exec();
      if (!existing || existing.id === ignoreId) {
        return slug;
      }

      slug = `${baseSlug}-${index}`;
      index += 1;
    }
  }
}
