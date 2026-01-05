export interface CartsResponse {
  total_price: number;
  sellers: {
    seller_id: string;
    seller_name: string;
    seller_total: number;
    items: {
      cart_id: string;
      cart_item_id: string;
      product_id: string;
      product_name: string;
      variant_id: string;
      variant_name: string;

      price: number | null;
      original_price: number;
      discount: number | null;

      quantity: number;
      stock: number;
      subtotal: number;
    }[];
  }[];
}
