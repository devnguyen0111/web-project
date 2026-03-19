import { OrderDocument } from '../orders/schemas/order.schema';
import { ProductEstimatedDays, ProductImage, ProductSubscriberDiscount } from '../products/schemas/product.schema';

export interface CartProductView {
  id: string;
  slug: string;
  name: string;
  type: string;
  price: number;
  originalPrice?: number;
  isOnSale: boolean;
  isFeatured: boolean;
  status: string;
  previewUrl?: string;
  images: ProductImage[];
  rating: number;
  reviewsCount: number;
  salesCount: number;
  tags: string[];
  categoryId?: string;
  estimatedDays?: ProductEstimatedDays;
  subscriberDiscount?: ProductSubscriberDiscount;
}

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  selected: boolean;
  buyerNote?: string;
  customData?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  available: boolean;
  lineTotal: number;
  product: CartProductView | null;
}

export interface CartSummary {
  itemCount: number;
  selectedCount: number;
  subtotal: number;
}

export interface CartView {
  items: CartItemView[];
  summary: CartSummary;
}

export interface CheckoutFailedItem {
  itemId: string;
  productId?: string;
  quantity: number;
  reason: string;
}

export interface CheckoutSummary extends CartSummary {
  successCount: number;
  failedCount: number;
}

export interface CheckoutResponse {
  createdOrders: OrderDocument[];
  failedItems: CheckoutFailedItem[];
  summary: CheckoutSummary;
}
