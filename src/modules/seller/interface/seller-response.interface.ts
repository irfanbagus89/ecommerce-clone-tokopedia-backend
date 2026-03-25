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
  };
}
