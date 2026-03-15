import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { toSlug } from '../../common/utils/slug.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  Category,
  CategoryDocument,
  CategoryScope,
} from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) {}

  async create(payload: CreateCategoryDto): Promise<CategoryDocument> {
    const slug = await this.ensureUniqueSlug(payload.name);

    try {
      return await this.categoryModel.create({
        ...payload,
        slug,
        parentId: payload.parentId
          ? new Types.ObjectId(payload.parentId)
          : undefined,
      });
    } catch {
      throw new ConflictException('Category slug already exists');
    }
  }

  async findPublic(scope?: CategoryScope) {
    const query: Record<string, unknown> = { isActive: true };

    if (scope) {
      query.scope = scope;
    }

    return this.categoryModel.find(query).sort({ order: 1, createdAt: -1 });
  }

  async findAll() {
    return this.categoryModel.find().sort({ createdAt: -1 });
  }

  async update(
    id: string,
    payload: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const updatePayload: Record<string, unknown> = {
      ...payload,
    };

    if (payload.name) {
      updatePayload.slug = await this.ensureUniqueSlug(payload.name, id);
    }

    if (payload.parentId) {
      updatePayload.parentId = new Types.ObjectId(payload.parentId);
    }

    const category = await this.categoryModel
      .findByIdAndUpdate(id, updatePayload, {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async remove(id: string) {
    const category = await this.categoryModel.findByIdAndDelete(id).exec();

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return { message: 'Category deleted successfully' };
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.categoryModel.countDocuments({ _id: id });
    return count > 0;
  }

  private async ensureUniqueSlug(
    name: string,
    ignoreId?: string,
  ): Promise<string> {
    const baseSlug = toSlug(name);
    let slug = baseSlug;
    let index = 1;

    while (true) {
      const existing = await this.categoryModel.findOne({ slug });
      if (!existing || existing.id === ignoreId) {
        return slug;
      }

      slug = `${baseSlug}-${index}`;
      index += 1;
    }
  }
}
