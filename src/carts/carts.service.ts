import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CartsResponse } from './interfaces/carts-response.interface';

@Injectable()
export class CartsService {
  constructor(@Inject('PG_POOL') private db: Pool) {}

  private calcDiscount(price: number, original: number) {
    if (price >= original) return 0;

    const percent = ((original - price) / original) * 100;

    return Math.max(1, Math.round(percent));
  }

  async createCart(
    userId: string,
    sellerId: string,
    productId: string,
    variantId: string,
    quantity: number,
    type: string | undefined,
  ): Promise<any> {
    const checkCartItem = await this.db.query<{ id: string; cart_id: string }>(
      `SELECT ci.id, ci.cart_id FROM cart_items ci LEFT JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1 AND ci.seller_id = $2`,
      [userId, sellerId],
    );
    const exitistingCheckCartItem = checkCartItem.rows[0];
    // Pengecakan apakah item sudah ada di cart
    if (!exitistingCheckCartItem) {
      // Jika item belum ada, buat cart baru dan tambahkan item
      const createCart = await this.db.query<{ id: string }>(
        'INSERT INTO carts (user_id) VALUES ($1) RETURNING id',
        [userId],
      );
      const checkStock = await this.db.query<{ stock: number }>(
        'SELECT stock FROM product_variants WHERE id = $1',
        [variantId],
      );

      if (Number(checkStock.rows[0].stock) < quantity) {
        throw new ConflictException('Stock tidak mencukupi');
      }

      const createCartItem = await this.db.query<{ cart_id: string }>(
        'INSERT INTO cart_items (cart_id, seller_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING cart_id',
        [createCart.rows[0].id, sellerId, productId, variantId, quantity],
      );
      return {
        data: { cart_id: createCartItem.rows[0].cart_id },
        message: 'Product berhasil ditambahkan',
      };
    } else {
      // Jika item sudah ada, perbarui kuantitas cart item jika produk dan varian sama atau buat item baru jika berbeda
      const checkCartProductItem = await this.db.query<{
        id: string;
        quantity_item: number;
        cart_id: string;
      }>(
        `SELECT ci.id, quantity AS quantity_item, ci.cart_id FROM cart_items ci LEFT JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1 AND ci.variant_id = $2`,
        [userId, variantId],
      );

      const existingCartProductItem = checkCartProductItem.rows[0];
      if (existingCartProductItem) {
        //   Jika produk dan varian sudah ada di cart, perbarui kuantitasnya
        const checkStock = await this.db.query<{ stock: number }>(
          'SELECT stock FROM product_variants WHERE id = $1',
          [variantId],
        );
        if (quantity <= 0) {
          await this.db.query('DELETE FROM cart_items WHERE id = $1', [
            exitistingCheckCartItem.id,
          ]);
          const checkEmptyCart = await this.db.query<{ id: string }>(
            'SELECT id FROM cart_items WHERE cart_id = $1',
            [existingCartProductItem.cart_id],
          );
          if (checkEmptyCart.rowCount === 0) {
            await this.db.query('DELETE FROM carts WHERE id = $1', [
              existingCartProductItem.cart_id,
            ]);
          }
          return {
            data: exitistingCheckCartItem.id,
            message: 'Product berhasil dihapus',
          };
        }

        if (Number(checkStock.rows[0].stock) < quantity) {
          throw new ConflictException('Stock tidak mencukupi');
        }
        const dataUpdate = await this.db.query<{
          id: string;
          quantity_prev: number;
        }>(
          `SELECT ci.id, ci.quantity AS quantity_prev FROM cart_items ci LEFT JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1 AND ci.variant_id = $2`,
          [userId, variantId],
        );
        const updateCartItem = await this.db.query<{ cart_id: string }>(
          'UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING cart_id',
          [
            type === 'insert' && type !== undefined
              ? quantity + Number(dataUpdate.rows[0].quantity_prev)
              : quantity,
            dataUpdate.rows[0].id,
          ],
        );
        return {
          data: { cart_id: updateCartItem.rows[0].cart_id },
          message: 'Product berhasil diperbarui',
        };
      } else {
        //   Jika produk atau varian berbeda, buat item cart baru
        const checkStock = await this.db.query<{ stock: number }>(
          'SELECT stock FROM product_variants WHERE id = $1',
          [variantId],
        );

        if (Number(checkStock.rows[0].stock) < quantity) {
          throw new ConflictException('Stock tidak mencukupi');
        }

        const createCartItem = await this.db.query<{ cart_id: string }>(
          'INSERT INTO cart_items (cart_id, seller_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING cart_id',
          [
            exitistingCheckCartItem.cart_id,
            sellerId,
            productId,
            variantId,
            quantity,
          ],
        );
        return {
          data: { cart_id: createCartItem.rows[0].cart_id },
          message: 'Product berhasil ditambahkan',
        };
      }
    }
  }

  async getMyCart(userId: string): Promise<CartsResponse> {
    const cart = await this.db.query<{ id: string }>(
      `SELECT id FROM carts WHERE user_id = $1`,
      [userId],
    );

    if (cart.rowCount === 0) {
      throw new NotFoundException('Cart kosong');
    }

    const cartItems = await this.db.query<{
      cart_id: string;
      cart_item_id: string;
      seller_id: string;
      seller_name: string;
      product_id: string;
      product_name: string;
      price: number | null;
      original_price: number;
      variant_id: string;
      variant_name: string;
      additional_price: number;
      stock: number;
      quantity: number;
      image_url: string;
    }>(
      `
    SELECT 
      ci.cart_id,
      ci.id AS cart_item_id,
      ci.seller_id,
      s.store_name AS seller_name,
      p.id AS product_id,
      p.name AS product_name,
      p.price,
      p.original_price,
      pv.id AS variant_id,
      pv.variant_name AS variant_name,
      pv.additional_price,
      pv.stock,
      ci.quantity,
      p.image_url
    FROM cart_items ci
    JOIN carts c ON c.id = ci.cart_id
    JOIN products p ON p.id = ci.product_id
    JOIN product_variants pv ON pv.id = ci.variant_id
    JOIN sellers s ON s.id = ci.seller_id
    WHERE c.user_id = $1
    ORDER BY s.store_name ASC, p.name ASC
    `,
      [userId],
    );

    const sellers: CartsResponse['sellers'] = [];

    for (const item of cartItems.rows) {
      let seller = sellers.find((s) => s.seller_id === item.seller_id);

      if (!seller) {
        seller = {
          seller_id: item.seller_id,
          seller_name: item.seller_name,
          items: [],
        };
        sellers.push(seller);
      }

      seller.items.push({
        cart_id: item.cart_id,
        cart_item_id: item.cart_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        variant_name: item.variant_name,

        price: item.price
          ? Number(item.price) + Number(item.additional_price)
          : null,
        original_price:
          Number(item.original_price) + Number(item.additional_price),
        discount: item.price
          ? this.calcDiscount(item.price, item.original_price)
          : null,

        quantity: item.quantity,
        stock: item.stock,
        image_url: item.image_url,
      });
    }

    return {
      sellers,
    };
  }
}
