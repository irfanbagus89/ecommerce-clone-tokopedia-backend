export interface CreateProductResponse {
  id: string;
  name: string;
}

export interface ProductsItem {
  id: string;
  name: string;
  price: number;
  image_url: string | null;

  rating?: number;
  sold?: number;
  store_type?: string;

  /** Flash Sale only */
  stock?: number;
  max_per_user?: number;
}

export interface ProductsResponse {
  page: number;
  totalPages: number;
  products: ProductsItem[];
}
