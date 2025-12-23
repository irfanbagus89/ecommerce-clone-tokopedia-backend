export interface CreateProductResponse {
  id: string;
  name: string;
}
export interface ProductsItem {
  id: string;
  name: string;
  image_url: string;
  category_id: string;
  price: number;
  original_price?: number | null;
  discount?: number | null;

  rating?: number;
  sold?: number;
  stock?: number;
  location?: string;
}

export interface ProductsResponse {
  page: number;
  totalPages: number;
  products: ProductsItem[];
}

export interface ParsedQuery {
  intent: 'product_search' | 'product_price' | 'unknown';
  entities: {
    product_name?: string | null;
    keywords?: string[] | null;
    variant_keywords?: string[] | null;
    min_price?: number | null;
    max_price?: number | null;
  };
}
