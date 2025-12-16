export interface CreateProductResponse {
  id: string;
  name: string;
}

export interface ProductsBySeller {
  page: number;
  total: number;
  products: [
    {
      id: string;
      name: string;
      price: number;
      image_url: string;
    },
  ];
}
