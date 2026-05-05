export interface CreateProductResponse {
  id: string;
  name: string;
}

export interface SellerResponse {
  store: {
    id: string;
    name: string;
    desc: string;
    verified: boolean;
    phone?: string | null;
    city_id?: number | null;
    city?: string | null;
  };
}
