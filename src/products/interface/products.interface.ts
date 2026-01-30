export interface ProductsItem {
  id: string;
  name: string;
  image_url: string;
  image_url_2?: string;
  image_url_3?: string;
  image_url_4?: string;
  image_url_5?: string;
  original_price: number;
  description?: string;
  price?: number | null;
  category_id: string;
  category_name?: string;
  discount?: number | null;
  rating?: number;
  sold?: number;
  stock?: number;
  location?: string;
  seller_id?: string;
  store_name?: string;
  verified?: boolean;
  active?: boolean;
  store_type?: string;
  seller_location?: string;
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

export interface ProductDetailResponse {
  id: string;
  name: string;
  description: string;
  discount_percent?: number | null;
  price: number | null;
  original_price: number;
  rating: {
    average: number;
    count: number;
  };
  sold_count: number;
  stock: number;
  images: string[];
  active?: boolean;
  variants: { id: string; name: string; price: number; stock: number }[];

  seller: {
    id: string;
    store_name: string;
    verified: boolean;
    store_type: string;
    location: string;
  };
  category: {
    id: string;
    name: string;
  };
}
