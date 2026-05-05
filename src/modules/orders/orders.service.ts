import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Pool } from 'pg';
import { randomBytes, createHash } from 'crypto';
import { ShippingSelectionDto } from './dto/checkout.dto';
import { ShippingService } from '../shipping/shipping.service';
import { VouchersService } from '../vouchers/vouchers.service';

interface SellerGroup {
  items: {
    cart_item_id: string;
    quantity: number;
    seller_id: string;
    product_id: string;
    variant_id: string;
    product_name: string;
    variant_name: string;
    stock: number;
    base_price: string | number;
    additional_price: string | number;
    calculated_price: number;
  }[];
  subtotal: number;
  shippingCost: number;
  shippingMethod: string;
}

interface PaymentMethodRow {
  id: string;
  name: string;
  code: string;
  type: string;
}

interface MidtransChargeResponse {
  transaction_id?: string;
  transaction_status?: string;
  payment_type?: string;
  fraud_status?: string;
  va_numbers?: { bank: string; va_number: string }[];
  permata_va_number?: string;
  bill_key?: string;
  biller_code?: string;
  actions?: {
    name: string;
    method: string;
    url?: string;
    fields?: unknown[];
  }[];
  qr_string?: string;
  expiry_time?: string;
  [key: string]: unknown;
}

const SERVICE_FEE = 2000;
const INSURANCE_FEE = 3200;

@Injectable()
export class OrdersService {
  constructor(
    @Inject('DATABASE_POOL') private db: Pool,
    private readonly shippingService: ShippingService,
    private readonly vouchersService: VouchersService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async checkoutPreview(
    userId: string,
    cartItemIds: string[],
    shippingCostTotal?: number,
    voucherCode?: string,
  ) {
    if (!cartItemIds || cartItemIds.length === 0) {
      throw new BadRequestException('Cart items cannot be empty');
    }

    const result = await this.db.query<{
      cart_item_id: string;
      quantity: number;
      base_price: string;
      additional_price: string;
      original_price: string;
    }>(
      `SELECT
         ci.id AS cart_item_id,
         ci.quantity,
         COALESCE(NULLIF(p.price, 0), p.original_price) AS base_price,
         COALESCE(pv.additional_price, 0) AS additional_price,
         p.original_price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN product_variants pv ON pv.id = ci.variant_id
       WHERE ci.id = ANY($1)
         AND ci.cart_id IN (SELECT id FROM carts WHERE user_id = $2)`,
      [cartItemIds, userId],
    );

    if (result.rows.length !== cartItemIds.length) {
      throw new BadRequestException(
        'Some cart items are invalid or do not belong to you',
      );
    }
    let originalPrice = 0;
    let subtotal = 0;
    let itemsCount = 0;

    for (const item of result.rows) {
      const origUnit =
        Number(item.original_price) + Number(item.additional_price);
      const discountedUnit =
        Number(item.base_price) + Number(item.additional_price);
      originalPrice += origUnit * Number(item.quantity);
      subtotal += discountedUnit * Number(item.quantity);
      itemsCount += Number(item.quantity);
    }

    const itemDiscount = originalPrice - subtotal;
    const shippingCost = shippingCostTotal ?? 0;

    let voucherDiscount = 0;
    let voucherInfo: {
      voucher_id: string;
      code: string;
      type: string;
      discount_amount: number;
    } | null = null;

    if (voucherCode) {
      try {
        const v = await this.vouchersService.validateVoucher(
          voucherCode,
          userId,
          subtotal,
        );
        voucherDiscount = v.discount;
        voucherInfo = {
          voucher_id: v.voucher_id,
          code: v.code,
          type: v.type,
          discount_amount: v.discount,
        };
      } catch {
        throw new BadRequestException(
          'Voucher tidak valid atau sudah tidak berlaku',
        );
      }
    }

    const total = Math.max(
      0,
      subtotal - voucherDiscount + shippingCost + SERVICE_FEE + INSURANCE_FEE,
    );

    return {
      original_price: originalPrice,
      subtotal,
      item_discount: itemDiscount,
      shipping_cost: shippingCost,
      service_fee: SERVICE_FEE,
      insurance_fee: INSURANCE_FEE,
      voucher_discount: voucherDiscount,
      total,
      items_count: itemsCount,
      voucher: voucherInfo,
    };
  }

  async checkout(
    userId: string,
    cartItemIds: string[],
    paymentMethodCode?: string,
    address?: string,
    city?: string,
    postalCode?: string,
    shippingSelections?: ShippingSelectionDto[],
    shippingCostTotal?: number,
    shippingMethod?: string,
    voucherCode?: string,
  ) {
    if (!cartItemIds || cartItemIds.length === 0) {
      throw new BadRequestException('Cart items cannot be empty');
    }

    // Hitung ongkir dari RajaOngkir di backend sebelum transaksi DB
    const resolvedShippingMap = new Map<
      string,
      { cost: number; method: string }
    >();
    if (shippingSelections && shippingSelections.length > 0) {
      await Promise.all(
        shippingSelections.map(async (s) => {
          const cost = await this.shippingService.getServiceCost({
            origin_city_id: s.origin_city_id,
            destination_city_id: s.destination_city_id,
            weight: s.weight,
            courier: s.courier,
            service: s.service,
          });
          resolvedShippingMap.set(s.seller_id, {
            cost,
            method: `${s.courier.toUpperCase()} ${s.service.toUpperCase()}`,
          });
        }),
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query<{
        name: string;
        email: string;
        phone: string;
      }>('SELECT name, email, phone FROM users WHERE id = $1', [userId]);
      const user = userRes.rows[0];
      if (!user) throw new BadRequestException('User not found');

      const query = `
        SELECT
          ci.id AS cart_item_id, ci.quantity, ci.seller_id, ci.product_id, ci.variant_id,
          p.name AS product_name, pv.variant_name, pv.stock,
          COALESCE(NULLIF(p.price, 0), p.original_price) AS base_price,
          pv.additional_price
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        JOIN product_variants pv ON pv.id = ci.variant_id
        WHERE ci.id = ANY($1) AND ci.cart_id IN (SELECT id FROM carts WHERE user_id = $2)
      `;
      const cartItemsRes = await client.query<{
        cart_item_id: string;
        quantity: number;
        seller_id: string;
        product_id: string;
        variant_id: string;
        product_name: string;
        variant_name: string;
        stock: number;
        base_price: string | number;
        additional_price: string | number;
      }>(query, [cartItemIds, userId]);
      const items = cartItemsRes.rows;

      if (items.length !== cartItemIds.length) {
        throw new BadRequestException(
          'Some cart items are invalid or do not belong to you',
        );
      }

      const sellersMap = new Map<string, SellerGroup>();
      let totalGrossAmount = 0;

      for (const item of items) {
        if (Number(item.stock) < Number(item.quantity)) {
          throw new BadRequestException(
            `Stock insufficient for product ${item.product_name}`,
          );
        }

        const priceNum =
          Number(item.base_price) + Number(item.additional_price);
        const itemTotal = priceNum * Number(item.quantity);
        const calculatedItem = {
          ...item,
          calculated_price: priceNum,
        };

        if (!sellersMap.has(item.seller_id)) {
          const resolved = resolvedShippingMap.get(item.seller_id);
          sellersMap.set(item.seller_id, {
            items: [],
            subtotal: 0,
            shippingCost: resolved?.cost ?? 0,
            shippingMethod: resolved?.method ?? '',
          });
        }
        const sellerGroup = sellersMap.get(item.seller_id)!;
        sellerGroup.items.push(calculatedItem);
        sellerGroup.subtotal += itemTotal;
        totalGrossAmount += itemTotal;
      }

      // Distribusi ongkir: dari RajaOngkir jika ada shipping_selections,
      // atau dari flat shippingCostTotal ke seller pertama jika tidak
      if (!shippingSelections || shippingSelections.length === 0) {
        const sellerEntries = [...sellersMap.entries()];
        if (
          sellerEntries.length > 0 &&
          shippingCostTotal &&
          shippingCostTotal > 0
        ) {
          const perSeller = Math.floor(
            shippingCostTotal / sellerEntries.length,
          );
          const remainder =
            shippingCostTotal - perSeller * sellerEntries.length;
          sellerEntries.forEach(([, group], idx) => {
            group.shippingCost = perSeller + (idx === 0 ? remainder : 0);
            if (shippingMethod && !group.shippingMethod) {
              group.shippingMethod = shippingMethod;
            }
          });
        }
      }

      // Hitung subtotal produk dan total ongkir terpisah
      const productSubtotal = totalGrossAmount; // sebelum ditambah ongkir
      const totalShippingCost = [...sellersMap.values()].reduce(
        (s, g) => s + g.shippingCost,
        0,
      );
      totalGrossAmount += totalShippingCost;

      // Validasi & hitung diskon voucher
      let voucherDiscount = 0;
      let voucherId: string | null = null;
      if (voucherCode) {
        try {
          const v = await this.vouchersService.validateVoucher(
            voucherCode,
            userId,
            productSubtotal,
          );
          voucherDiscount = v.discount;
          voucherId = v.voucher_id;
        } catch {
          throw new BadRequestException(
            'Voucher tidak valid atau sudah tidak berlaku',
          );
        }
      }

      // Tambahkan service fee, asuransi, kurangi diskon voucher
      totalGrossAmount =
        totalGrossAmount + SERVICE_FEE + INSURANCE_FEE - voucherDiscount;
      if (totalGrossAmount < 0) totalGrossAmount = 0;

      const timestamp = new Date().getTime();
      const randomSuffix = randomBytes(4).toString('hex');
      const midtransOrderId = `TRX-${timestamp}-${randomSuffix}`;
      const paymentMethod = await this.getPaymentMethod(paymentMethodCode);

      const transaction = await this.chargeCoreApi({
        orderId: midtransOrderId,
        grossAmount: totalGrossAmount,
        user,
        paymentMethod,
      });
      const paymentInstructions = this.extractPaymentInstructions(transaction);

      const invoiceBase = `INV/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/TRX`;
      const orderIdList: string[] = [];

      let isFirstSeller = true;
      for (const [sellerId, group] of sellersMap.entries()) {
        const invoiceNumber = `${invoiceBase}/${sellerId.substring(0, 8).toUpperCase()}/${randomSuffix.toUpperCase()}`;

        // Distribusi diskon voucher proporsional per seller
        const sellerVoucherDiscount =
          productSubtotal > 0
            ? Math.round(voucherDiscount * (group.subtotal / productSubtotal))
            : 0;

        // Extra fees (service fee + asuransi) hanya ke seller pertama
        const extraFees = isFirstSeller ? SERVICE_FEE + INSURANCE_FEE : 0;
        isFirstSeller = false;

        const platformFee = group.subtotal * 0.01 + extraFees;
        const sellerEarning =
          group.subtotal -
          group.subtotal * 0.01 +
          group.shippingCost -
          sellerVoucherDiscount;
        const orderTotal =
          group.subtotal +
          group.shippingCost +
          extraFees -
          sellerVoucherDiscount;

        const orderRes = await client.query<{ id: string }>(
          `INSERT INTO orders
            (user_id, seller_id, total_price, shipping_cost, discount_amount, status, payment_status,
             invoice_number, created_at, updated_at, platform_fee, seller_earning, voucher_id)
           VALUES ($1, $2, $3, $4, $5, 'pending', 'unpaid', $6, NOW(), NOW(), $7, $8, $9)
           RETURNING id`,
          [
            userId,
            sellerId,
            orderTotal,
            group.shippingCost,
            sellerVoucherDiscount,
            invoiceNumber,
            platformFee,
            sellerEarning,
            voucherId,
          ],
        );
        const orderId = orderRes.rows[0].id;
        orderIdList.push(orderId);

        await client.query(
          `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
           VALUES (gen_random_uuid(), $1, 'pending', 'Order created', NOW())`,
          [orderId],
        );

        for (const item of group.items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, variant_id, quantity, price)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              orderId,
              item.product_id,
              item.variant_id,
              item.quantity,
              item.calculated_price,
            ],
          );

          const stockUpdateRes = await client.query(
            `UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
            [item.quantity, item.variant_id],
          );
          if (stockUpdateRes.rowCount === 0) {
            throw new BadRequestException(
              `Stock insufficient or race condition detected for product ${item.product_name}`,
            );
          }
        }

        await client.query(
          `INSERT INTO payments
            (id, order_id, payment_method_id, midtrans_order_id, transaction_id,
             payment_status, payment_type, payment_code, va_number, bill_key,
             biller_code, qr_string, deeplink_url, payment_actions, fraud_status,
             gross_amount, raw_response, expired_at, created_at, updated_at)
           VALUES
            (gen_random_uuid(), $1, $2, $3, $4,
             'pending', $5, $6, $7, $8,
             $9, $10, $11, $12::jsonb, $13,
             $14, $15::jsonb, NOW() + INTERVAL '24 hours', NOW(), NOW())`,
          [
            orderId,
            paymentMethod.id,
            midtransOrderId,
            transaction.transaction_id ?? null,
            transaction.payment_type ?? paymentInstructions.payment_type,
            paymentMethod.code,
            paymentInstructions.va_number,
            paymentInstructions.bill_key,
            paymentInstructions.biller_code,
            paymentInstructions.qr_string,
            paymentInstructions.deeplink_url,
            JSON.stringify(paymentInstructions.actions ?? null),
            transaction.fraud_status ?? null,
            orderTotal,
            JSON.stringify(transaction),
          ],
        );

        await client.query(
          `INSERT INTO shipping
            (id, order_id, address, city, postal_code, shipping_method, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'pending', NOW(), NOW())`,
          [
            orderId,
            address || 'TBD',
            city || 'TBD',
            postalCode || 'TBD',
            group.shippingMethod || null,
          ],
        );
      }

      // Increment voucher used_count jika ada
      if (voucherId) {
        await client.query(
          `UPDATE vouchers SET used_count = used_count + 1 WHERE id = $1`,
          [voucherId],
        );
      }

      await client.query(`DELETE FROM cart_items WHERE id = ANY($1)`, [
        cartItemIds,
      ]);
      await client.query(
        `DELETE FROM carts WHERE user_id = $1 AND id NOT IN (SELECT cart_id FROM cart_items)`,
        [userId],
      );

      await client.query('COMMIT');

      return {
        message: 'Checkout successful',
        data: {
          midtrans_order_id: midtransOrderId,
          order_ids: orderIdList,
          payment_method: paymentMethod,
          transaction_id: transaction.transaction_id ?? null,
          payment_type:
            transaction.payment_type ?? paymentInstructions.payment_type,
          instructions: paymentInstructions,
          expired_at: paymentInstructions.expired_at,
          summary: {
            subtotal: productSubtotal,
            shipping_cost: totalShippingCost,
            service_fee: SERVICE_FEE,
            insurance_fee: INSURANCE_FEE,
            voucher_discount: voucherDiscount,
            total: totalGrossAmount,
          },
        },
      };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      console.error('Checkout error:', e);
      throw e;
    } finally {
      client.release();
    }
  }

  private async getPaymentMethod(
    paymentMethodCode?: string,
  ): Promise<PaymentMethodRow> {
    const result = paymentMethodCode
      ? await this.db.query<PaymentMethodRow>(
          `SELECT id, name, code, type
           FROM payment_methods
           WHERE code = $1 AND is_active = true`,
          [paymentMethodCode],
        )
      : await this.db.query<PaymentMethodRow>(
          `SELECT id, name, code, type
           FROM payment_methods
           WHERE is_active = true
           ORDER BY type, name
           LIMIT 1`,
        );

    const method = result.rows[0];
    if (!method) {
      throw new BadRequestException('Payment method is not available');
    }

    return method;
  }

  private async chargeCoreApi(params: {
    orderId: string;
    grossAmount: number;
    user: { name: string; email: string; phone: string | null };
    paymentMethod: PaymentMethodRow;
  }) {
    const serverKey =
      this.config?.get<string>('MIDTRANS_SERVER_KEY') ||
      'SB-Mid-server-YOUR_SERVER_KEY';
    const baseUrl =
      this.config?.get<string>('MIDTRANS_ENV') === 'production'
        ? 'https://api.midtrans.com/v2/charge'
        : 'https://api.sandbox.midtrans.com/v2/charge';

    const payload = this.buildCoreChargePayload(params);
    const auth = Buffer.from(`${serverKey}:`).toString('base64');
    const response = await axios.post<MidtransChargeResponse>(
      baseUrl,
      payload,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );

    return response.data;
  }

  private buildCoreChargePayload(params: {
    orderId: string;
    grossAmount: number;
    user: { name: string; email: string; phone: string | null };
    paymentMethod: PaymentMethodRow;
  }): Record<string, unknown> {
    const { orderId, grossAmount, user, paymentMethod } = params;
    const basePayload: Record<string, unknown> = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(grossAmount),
      },
      customer_details: {
        first_name: user.name,
        email: user.email,
        phone: user.phone || '08000000000',
      },
    };

    const frontendUrl =
      this.config?.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    if (paymentMethod.code.endsWith('_va')) {
      const bank = paymentMethod.code.replace('_va', '');
      if (!['bca', 'bni', 'bri', 'permata', 'cimb'].includes(bank)) {
        throw new BadRequestException(
          `Payment method ${paymentMethod.code} is not supported by Core API`,
        );
      }
      return {
        ...basePayload,
        payment_type: 'bank_transfer',
        bank_transfer: { bank },
      };
    }

    if (paymentMethod.code === 'echannel') {
      return {
        ...basePayload,
        payment_type: 'echannel',
        echannel: {
          bill_info1: 'Payment For:',
          bill_info2: 'Ecommerce Order',
        },
      };
    }

    if (paymentMethod.code === 'gopay') {
      return {
        ...basePayload,
        payment_type: 'gopay',
        gopay: {
          enable_callback: true,
          callback_url: `${frontendUrl}/payments/finish`,
        },
      };
    }

    if (paymentMethod.code === 'qris') {
      return {
        ...basePayload,
        payment_type: 'qris',
      };
    }

    if (paymentMethod.code === 'shopeepay') {
      return {
        ...basePayload,
        payment_type: 'shopeepay',
        shopeepay: {
          callback_url: `${frontendUrl}/payments/finish`,
        },
      };
    }

    if (
      paymentMethod.code === 'alfamart' ||
      paymentMethod.code === 'indomaret'
    ) {
      return {
        ...basePayload,
        payment_type: 'cstore',
        cstore: {
          store: paymentMethod.code,
          message: 'Ecommerce payment',
        },
      };
    }

    throw new BadRequestException(
      `Payment method ${paymentMethod.code} is not supported by custom Core API checkout yet`,
    );
  }

  private extractPaymentInstructions(transaction: MidtransChargeResponse) {
    const actions = transaction.actions ?? [];
    const deeplinkAction = actions.find((action) => {
      return (
        action.name === 'deeplink-redirect' ||
        action.name === 'mobile_deeplink_checkout_url'
      );
    });
    const qrAction = actions.find((action) => {
      return (
        action.name === 'generate-qr-code' ||
        action.name === 'generate-qr-code-v2'
      );
    });

    return {
      payment_type: transaction.payment_type ?? null,
      va_number:
        transaction.va_numbers?.[0]?.va_number ??
        transaction.permata_va_number ??
        null,
      bill_key: transaction.bill_key ?? null,
      biller_code: transaction.biller_code ?? null,
      qr_string: transaction.qr_string ?? qrAction?.url ?? null,
      deeplink_url: deeplinkAction?.url ?? null,
      actions,
      expired_at: transaction.expiry_time ?? null,
    };
  }

  async getMyOrders(
    userId: string,
    status: string | undefined,
    page: number,
    limit: number,
  ) {
    const offset = (page - 1) * limit;
    const params: unknown[] = [userId, limit, offset];
    let statusClause = '';

    if (status) {
      params.push(status);
      statusClause = `AND o.status = $${params.length}`;
    }

    const sql = `
      SELECT
        o.id,
        o.invoice_number,
        o.status,
        o.payment_status,
        o.total_price,
        o.created_at,
        s.store_name,
        s.id AS seller_id,
        (
          SELECT json_agg(json_build_object(
            'product_name', p.name,
            'variant_name', pv.variant_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'image_url', p.image_url
          ))
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          LEFT JOIN product_variants pv ON pv.id = oi.variant_id
          WHERE oi.order_id = o.id
        ) AS items
      FROM orders o
      JOIN sellers s ON s.id = o.seller_id
      WHERE o.user_id = $1 ${statusClause}
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*) AS total FROM orders o
      WHERE o.user_id = $1 ${status ? 'AND o.status = $2' : ''}
    `;
    const countParams = status ? [userId, status] : [userId];

    const [ordersRes, countRes] = await Promise.all([
      this.db.query<{
        id: string;
        invoice_number: string;
        status: string;
        payment_status: string;
        total_price: string;
        created_at: Date;
        store_name: string;
        seller_id: string;
        items: unknown;
      }>(sql, params),
      this.db.query<{ total: string }>(countSql, countParams),
    ]);

    const total = parseInt(countRes.rows[0].total, 10);

    return {
      data: ordersRes.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getOrderDetail(orderId: string, userId: string) {
    const orderRes = await this.db.query<{
      id: string;
      invoice_number: string;
      status: string;
      payment_status: string;
      total_price: string;
      shipping_cost: string;
      discount_amount: string;
      seller_earning: string;
      platform_fee: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, invoice_number, status, payment_status, total_price,
              shipping_cost, discount_amount, seller_earning, platform_fee,
              created_at, updated_at
       FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');

    const [itemsRes, paymentRes, shippingRes, sellerRes] = await Promise.all([
      this.db.query<{
        id: string;
        product_id: string;
        product_name: string;
        image_url: string;
        variant_id: string;
        variant_name: string;
        quantity: number;
        price: string;
      }>(
        `SELECT oi.id, oi.product_id, p.name AS product_name, p.image_url,
                oi.variant_id, pv.variant_name, oi.quantity, oi.price
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         WHERE oi.order_id = $1`,
        [orderId],
      ),
      this.db.query<{
        payment_status: string;
        payment_type: string;
        payment_code: string;
        va_number: string;
        bill_key: string;
        biller_code: string;
        qr_string: string;
        deeplink_url: string;
        payment_actions: unknown;
        transaction_id: string;
        gross_amount: string;
        paid_at: Date;
        expired_at: Date;
      }>(
        `SELECT payment_status, payment_type, payment_code, va_number,
                bill_key, biller_code, qr_string, deeplink_url,
                payment_actions, transaction_id, gross_amount, paid_at,
                expired_at
         FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [orderId],
      ),
      this.db.query<{
        address: string;
        city: string;
        postal_code: string;
        shipping_method: string;
        tracking_number: string;
        status: string;
        estimated_delivery: string;
      }>(
        `SELECT address, city, postal_code, shipping_method, tracking_number,
                status, estimated_delivery
         FROM shipping WHERE order_id = $1`,
        [orderId],
      ),
      this.db.query<{ store_name: string; id: string }>(
        `SELECT s.store_name, s.id
         FROM orders o JOIN sellers s ON s.id = o.seller_id
         WHERE o.id = $1`,
        [orderId],
      ),
    ]);

    return {
      ...order,
      seller: sellerRes.rows[0] ?? null,
      items: itemsRes.rows,
      payment: paymentRes.rows[0] ?? null,
      shipping: shippingRes.rows[0] ?? null,
    };
  }

  async confirmOrderReceived(orderId: string, userId: string) {
    const orderRes = await this.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'shipped') {
      throw new BadRequestException(
        'Order can only be confirmed when status is "shipped"',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'delivered', 'Buyer confirmed receipt', NOW())`,
        [orderId],
      );
      await client.query('COMMIT');
      return { message: 'Order confirmed as delivered' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async cancelOrder(orderId: string, userId: string) {
    const orderRes = await this.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'pending') {
      throw new BadRequestException(
        'Order can only be cancelled when status is "pending"',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Restore stock
      const itemsRes = await client.query<{
        variant_id: string;
        quantity: number;
      }>(`SELECT variant_id, quantity FROM order_items WHERE order_id = $1`, [
        orderId,
      ]);
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE product_variants SET stock = stock + $1 WHERE id = $2`,
          [item.quantity, item.variant_id],
        );
      }

      await client.query(
        `UPDATE orders
         SET status = 'cancelled', payment_status = 'cancelled', updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'cancelled', 'Cancelled by buyer', NOW())`,
        [orderId],
      );
      await client.query('COMMIT');
      return { message: 'Order cancelled successfully' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getSellerOrders(
    userId: string,
    status: string | undefined,
    page: number,
    limit: number,
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const offset = (page - 1) * limit;
    const params: unknown[] = [sellerId, limit, offset];
    let statusClause = '';

    if (status) {
      params.push(status);
      statusClause = `AND o.status = $${params.length}`;
    }

    const sql = `
      SELECT
        o.id,
        o.invoice_number,
        o.status,
        o.payment_status,
        o.total_price,
        o.created_at,
        u.name AS buyer_name,
        u.email AS buyer_email,
        (
          SELECT json_agg(json_build_object(
            'product_name', p.name,
            'variant_name', pv.variant_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'image_url', p.image_url
          ))
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          LEFT JOIN product_variants pv ON pv.id = oi.variant_id
          WHERE oi.order_id = o.id
        ) AS items
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.seller_id = $1 ${statusClause}
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*) AS total FROM orders o
      WHERE o.seller_id = $1 ${status ? 'AND o.status = $2' : ''}
    `;
    const countParams = status ? [sellerId, status] : [sellerId];

    const [ordersRes, countRes] = await Promise.all([
      this.db.query<{
        id: string;
        invoice_number: string;
        status: string;
        payment_status: string;
        total_price: string;
        created_at: Date;
        buyer_name: string;
        buyer_email: string;
        items: unknown;
      }>(sql, params),
      this.db.query<{ total: string }>(countSql, countParams),
    ]);

    const total = parseInt(countRes.rows[0].total, 10);

    return {
      data: ordersRes.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async acceptOrder(orderId: string, userId: string) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const orderRes = await this.db.query<{
      status: string;
      payment_status: string;
    }>(
      `SELECT status, payment_status FROM orders WHERE id = $1 AND seller_id = $2`,
      [orderId, sellerId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.payment_status !== 'paid') {
      throw new BadRequestException('Order has not been paid yet');
    }
    if (order.status !== 'pending' && order.status !== 'processing') {
      throw new BadRequestException(
        'Order cannot be accepted in its current status',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'processing', 'Order accepted by seller', NOW())`,
        [orderId],
      );
      await client.query('COMMIT');
      return { message: 'Order accepted and is now processing' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async shipOrder(
    orderId: string,
    userId: string,
    trackingNumber: string,
    shippingMethod?: string,
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const orderRes = await this.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1 AND seller_id = $2`,
      [orderId, sellerId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'processing') {
      throw new BadRequestException(
        'Order must be in "processing" status to be shipped',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `UPDATE shipping
         SET tracking_number = $1,
             shipping_method = COALESCE($2, shipping_method),
             status = 'shipped',
             updated_at = NOW()
         WHERE order_id = $3`,
        [trackingNumber, shippingMethod ?? null, orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'shipped', $2, NOW())`,
        [orderId, `Shipped with tracking number: ${trackingNumber}`],
      );
      await client.query('COMMIT');
      return {
        message: 'Order marked as shipped',
        tracking_number: trackingNumber,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getOrderHistory(orderId: string, userId: string) {
    // Allow both buyer and seller to view — verify ownership first
    const orderRes = await this.db.query<{
      user_id: string;
      seller_id: string;
    }>(
      `SELECT o.user_id, s.user_id AS seller_user_id
       FROM orders o
       JOIN sellers s ON s.id = o.seller_id
       WHERE o.id = $1`,
      [orderId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');

    // Accept row if columns match either buyer or seller
    const raw = orderRes.rows[0] as unknown as {
      user_id: string;
      seller_user_id: string;
    };
    if (raw.user_id !== userId && raw.seller_user_id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const historyRes = await this.db.query<{
      id: string;
      status: string;
      note: string;
      created_at: Date;
    }>(
      `SELECT id, status, note, created_at
       FROM order_status_histories
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId],
    );

    return { order_id: orderId, history: historyRes.rows };
  }

  async handleMidtransWebhook(payload: Record<string, unknown>) {
    const data = payload as unknown as {
      order_id: string;
      transaction_status: string;
      fraud_status?: string;
      payment_type?: string;
      transaction_id?: string;
      status_code?: string;
      gross_amount?: string;
      signature_key?: string;
      va_numbers?: { bank: string; va_number: string }[];
      permata_va_number?: string;
      bill_key?: string;
      biller_code?: string;
      actions?: unknown[];
      expiry_time?: string;
    };
    if (!data.order_id) return { status: 'ignored', message: 'No order_id' };

    const serverKey =
      process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-YOUR_SERVER_KEY';
    if (data.status_code && data.gross_amount && data.signature_key) {
      const hash = createHash('sha512');
      hash.update(
        `${data.order_id}${data.status_code}${data.gross_amount}${serverKey}`,
      );
      const expectedSignature = hash.digest('hex');

      if (expectedSignature !== data.signature_key) {
        throw new BadRequestException(
          'Invalid signature key: Webhook spoofing detected!',
        );
      }
    } else {
      if (process.env.MIDTRANS_ENV === 'production') {
        throw new BadRequestException('Missing signature components');
      }
    }

    const { order_id, transaction_status, fraud_status } = data;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      let paymentStatus = 'pending';
      let isPaid = false;

      if (transaction_status === 'capture') {
        if (fraud_status === 'challenge') {
          paymentStatus = 'pending';
        } else if (fraud_status === 'accept') {
          paymentStatus = 'paid';
          isPaid = true;
        }
      } else if (transaction_status === 'settlement') {
        paymentStatus = 'paid';
        isPaid = true;
      } else if (transaction_status === 'cancel') {
        paymentStatus = 'cancelled';
      } else if (transaction_status === 'deny') {
        paymentStatus = 'failed';
      } else if (transaction_status === 'expire') {
        paymentStatus = 'expired';
      } else if (transaction_status === 'pending') {
        paymentStatus = 'pending';
      }

      const orderPaymentStatus = isPaid
        ? 'paid'
        : paymentStatus === 'expired' ||
            paymentStatus === 'cancelled' ||
            paymentStatus === 'failed'
          ? paymentStatus
          : 'unpaid';
      const orderGeneralStatus = isPaid
        ? 'processing'
        : paymentStatus === 'expired' ||
            paymentStatus === 'cancelled' ||
            paymentStatus === 'failed'
          ? 'cancelled'
          : 'pending';

      const paymentsRes = await client.query<{
        order_id: string;
        payment_status: string;
      }>(
        `SELECT order_id, payment_status FROM payments WHERE midtrans_order_id = $1`,
        [order_id],
      );
      const orderIds = paymentsRes.rows.map((r) => r.order_id);
      const alreadyProcessed = paymentsRes.rows.every((row) => {
        return row.payment_status === paymentStatus;
      });

      if (alreadyProcessed && orderIds.length > 0) {
        await client.query('COMMIT');
        return { status: 'ok', message: 'Webhook already processed' };
      }

      if (orderIds.length > 0) {
        await client.query(
          `UPDATE payments 
           SET payment_status = $1,
               payment_type = $2,
               transaction_id = $3,
               va_number = COALESCE($4, va_number),
               bill_key = COALESCE($5, bill_key),
               biller_code = COALESCE($6, biller_code),
               payment_actions = COALESCE($7::jsonb, payment_actions),
               fraud_status = $8,
               raw_response = $9::jsonb,
               paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END,
               updated_at = NOW()
           WHERE midtrans_order_id = $10`,
          [
            paymentStatus,
            data.payment_type || null,
            data.transaction_id || null,
            data.va_numbers?.[0]?.va_number ?? data.permata_va_number ?? null,
            data.bill_key ?? null,
            data.biller_code ?? null,
            data.actions ? JSON.stringify(data.actions) : null,
            data.fraud_status ?? null,
            JSON.stringify(payload),
            order_id,
          ],
        );

        await client.query(
          `UPDATE orders 
             SET payment_status = $1, status = $2, updated_at = NOW() 
             WHERE id = ANY($3)`,
          [orderPaymentStatus, orderGeneralStatus, orderIds],
        );

        for (const oid of orderIds) {
          await client.query(
            `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
            [
              oid,
              orderGeneralStatus,
              `Payment status updated to ${orderPaymentStatus}`,
            ],
          );
        }

        if (
          paymentStatus === 'expired' ||
          paymentStatus === 'cancelled' ||
          paymentStatus === 'failed'
        ) {
          for (const oid of orderIds) {
            const itemsRes = await client.query<{
              variant_id: string;
              quantity: number;
            }>(
              `SELECT variant_id, quantity FROM order_items WHERE order_id = $1`,
              [oid],
            );
            for (const item of itemsRes.rows) {
              await client.query(
                `UPDATE product_variants SET stock = stock + $1 WHERE id = $2`,
                [item.quantity, item.variant_id],
              );
            }
          }
        }
      }

      await client.query('COMMIT');
      return { status: 'ok', message: 'Webhook processed successfully' };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      console.error('Webhook error:', e);
      throw e;
    } finally {
      client.release();
    }
  }
}
