import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { CategoryScope } from '../../blog/categories/schemas/category.schema';
import { MinioService } from '../../minio/minio.service';
import { ProductsService } from './products.service';
import { ProductStatus, ProductType } from './schemas/product.schema';

const buildExec = <T>(result: T) => ({
  exec: jest.fn().mockResolvedValue(result),
});

const buildSelectLeanExec = <T>(result: T) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

describe('ProductsService', () => {
  let service: ProductsService;
  let productModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
  };
  let categoryModel: {
    findById: jest.Mock;
  };
  let orderModel: {
    aggregate: jest.Mock;
    collection: { name: string };
  };
  let reviewModel: {
    aggregate: jest.Mock;
    collection: { name: string };
  };

  beforeEach(() => {
    productModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
    };
    categoryModel = {
      findById: jest.fn(),
    };
    orderModel = {
      aggregate: jest.fn(),
      collection: { name: 'orders' },
    };
    reviewModel = {
      aggregate: jest.fn(),
      collection: { name: 'reviews' },
    };

    service = new ProductsService(
      productModel as never,
      categoryModel as never,
      orderModel as never,
      reviewModel as never,
      {
        getBucket: jest.fn(),
        uploadFile: jest.fn(),
        removeObject: jest.fn(),
      } as unknown as MinioService,
    );
  });

  it('rejects review submission for digital product without asset', async () => {
    const ownerId = new Types.ObjectId().toString();
    const productDoc = {
      id: new Types.ObjectId().toString(),
      status: ProductStatus.DRAFT,
      type: ProductType.DIGITAL,
      digitalAsset: undefined,
      createdBy: new Types.ObjectId(ownerId),
      save: jest.fn(),
    };
    productModel.findById.mockReturnValue(buildExec(productDoc));

    await expect(
      service.submitForReview(productDoc.id, {
        userId: ownerId,
        role: Role.STAFF,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(productDoc.save).not.toHaveBeenCalled();
  });

  it('approves pending product and marks review metadata', async () => {
    const reviewerId = new Types.ObjectId().toString();
    const productDoc = {
      id: new Types.ObjectId().toString(),
      status: ProductStatus.PENDING_REVIEW,
      type: ProductType.DIGITAL,
      digitalAsset: {
        bucketName: 'products',
        objectName: 'abc',
        fileName: 'asset.zip',
      },
      categoryId: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    productModel.findById.mockReturnValue(buildExec(productDoc));
    categoryModel.findById.mockReturnValue(
      buildSelectLeanExec({
        _id: productDoc.categoryId,
        scope: CategoryScope.STORE,
      }),
    );

    const result = await service.approvePendingReview(
      productDoc.id,
      reviewerId,
    );

    expect(result.status).toBe(ProductStatus.ACTIVE);
    expect(result.reviewedBy.toString()).toBe(reviewerId);
    expect(result.reviewedAt).toBeInstanceOf(Date);
    expect(productDoc.save).toHaveBeenCalled();
  });

  it('prevents staff from updating other owner product', async () => {
    const ownerId = new Types.ObjectId().toString();
    const actorId = new Types.ObjectId().toString();
    const productDoc = {
      id: new Types.ObjectId().toString(),
      name: 'Product A',
      type: ProductType.DIGITAL,
      status: ProductStatus.DRAFT,
      createdBy: new Types.ObjectId(ownerId),
      save: jest.fn(),
    };
    productModel.findById.mockReturnValue(buildExec(productDoc));

    await expect(
      service.update(
        {
          userId: actorId,
          role: Role.STAFF,
        },
        productDoc.id,
        {
          description: 'update',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
