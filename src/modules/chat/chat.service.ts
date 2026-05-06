import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CloudinaryService } from 'src/common';

@Injectable()
export class ChatService {
  constructor(
    @Inject('DATABASE_POOL') private db: Pool,
    @Optional() private readonly cloudinary?: CloudinaryService,
  ) {}

  async getConversations(userId: string) {
    const rows = await this.db.query<{
      id: string;
      product_id: string | null;
      product_name: string | null;
      product_image: string | null;
      seller_id: string;
      store_name: string;
      buyer_id: string;
      buyer_name: string;
      buyer_avatar: string | null;
      last_message: string | null;
      last_message_at: string | null;
      unread_count: string;
      updated_at: string;
    }>(
      `SELECT
         cc.id,
         cc.product_id,
         p.name AS product_name,
         p.image_url AS product_image,
         s.id AS seller_id,
         s.store_name,
         u.id AS buyer_id,
         u.name AS buyer_name,
         u.avatar AS buyer_avatar,
         (SELECT cm.message FROM chat_messages cm
          WHERE cm.conversation_id = cc.id
          ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
         (SELECT cm.created_at FROM chat_messages cm
          WHERE cm.conversation_id = cc.id
          ORDER BY cm.created_at DESC LIMIT 1) AS last_message_at,
         (SELECT COUNT(*) FROM chat_messages cm
          WHERE cm.conversation_id = cc.id AND cm.is_read = false
            AND cm.sender_id != $1) AS unread_count,
         cc.updated_at
       FROM chat_conversations cc
       JOIN sellers s ON s.id = cc.seller_id
       JOIN users u ON u.id = cc.buyer_id
       LEFT JOIN products p ON p.id = cc.product_id
       WHERE cc.buyer_id = $1 OR s.user_id = $1
       ORDER BY cc.updated_at DESC`,
      [userId],
    );

    return rows.rows.map((r) => ({
      ...r,
      unread_count: Number(r.unread_count),
    }));
  }

  async getMessages(
    conversationId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    const convRes = await this.db.query<{
      id: string;
      buyer_id: string;
      seller_user_id: string;
    }>(
      `SELECT cc.id, cc.buyer_id, s.user_id AS seller_user_id
       FROM chat_conversations cc
       JOIN sellers s ON s.id = cc.seller_id
       WHERE cc.id = $1`,
      [conversationId],
    );
    const conv = convRes.rows[0];
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.buyer_id !== userId && conv.seller_user_id !== userId) {
      throw new BadRequestException('Access denied');
    }

    const offset = (page - 1) * limit;
    const rows = await this.db.query(
      `SELECT cm.id, cm.sender_id, u.name AS sender_name, u.avatar AS sender_avatar,
              cm.message, cm.image_url, cm.is_read, cm.created_at
       FROM chat_messages cm
       JOIN users u ON u.id = cm.sender_id
       WHERE cm.conversation_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset],
    );
    await this.db.query(
      `UPDATE chat_messages SET is_read = true
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false`,
      [conversationId, userId],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM chat_messages WHERE conversation_id = $1`,
      [conversationId],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      data: rows.rows.reverse(),
    };
  }

  async startOrGetConversation(
    buyerId: string,
    sellerId: string,
    productId?: string,
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE id = $1`,
      [sellerId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const existRes = await this.db.query<{ id: string }>(
      `SELECT id FROM chat_conversations
       WHERE buyer_id = $1 AND seller_id = $2`,
      [buyerId, sellerId],
    );

    if (existRes.rows[0]) {
      return { conversation_id: existRes.rows[0].id, is_new: false };
    }

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO chat_conversations (buyer_id, seller_id, product_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [buyerId, sellerId, productId ?? null],
    );

    return { conversation_id: result.rows[0].id, is_new: true };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    message?: string,
    imageFile?: Express.Multer.File,
  ) {
    const convRes = await this.db.query<{
      id: string;
      buyer_id: string;
      seller_user_id: string;
    }>(
      `SELECT cc.id, cc.buyer_id, s.user_id AS seller_user_id
       FROM chat_conversations cc
       JOIN sellers s ON s.id = cc.seller_id
       WHERE cc.id = $1`,
      [conversationId],
    );
    const conv = convRes.rows[0];
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.buyer_id !== senderId && conv.seller_user_id !== senderId) {
      throw new BadRequestException('Access denied');
    }

    if (!message && !imageFile) {
      throw new BadRequestException('Message or image is required');
    }

    let imageUrl: string | null = null;
    let cloudinaryPublicId: string | null = null;
    if (imageFile) {
      if (!this.cloudinary) {
        throw new BadRequestException('Cloudinary service is not available');
      }
      const uploaded = await this.cloudinary.uploadImage(
        imageFile,
        'chat',
        `chat-${conversationId}`,
      );
      imageUrl = uploaded.secure_url;
      cloudinaryPublicId = uploaded.public_id;
    }

    const hasPublicIdColumn = cloudinaryPublicId
      ? await this.hasColumn('chat_messages', 'cloudinary_public_id')
      : false;
    const result = hasPublicIdColumn
      ? await this.db.query<{ id: string }>(
          `INSERT INTO chat_messages
             (conversation_id, sender_id, message, image_url, cloudinary_public_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            conversationId,
            senderId,
            message ?? null,
            imageUrl,
            cloudinaryPublicId,
          ],
        )
      : await this.db.query<{ id: string }>(
          `INSERT INTO chat_messages (conversation_id, sender_id, message, image_url)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [conversationId, senderId, message ?? null, imageUrl],
        );

    await this.db.query(
      `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );

    return { message_id: result.rows[0].id };
  }

  async getUnreadCount(userId: string) {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM chat_messages cm
       JOIN chat_conversations cc ON cc.id = cm.conversation_id
       JOIN sellers s ON s.id = cc.seller_id
       WHERE (cc.buyer_id = $1 OR s.user_id = $1)
         AND cm.sender_id != $1
         AND cm.is_read = false`,
      [userId],
    );
    return { unread_count: Number(res.rows[0].count) };
  }

  async deleteConversation(conversationId: string, userId: string) {
    const convRes = await this.db.query<{
      id: string;
      buyer_id: string;
      seller_user_id: string;
    }>(
      `SELECT cc.id, cc.buyer_id, s.user_id AS seller_user_id
       FROM chat_conversations cc
       JOIN sellers s ON s.id = cc.seller_id
       WHERE cc.id = $1`,
      [conversationId],
    );
    const conv = convRes.rows[0];
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.buyer_id !== userId && conv.seller_user_id !== userId) {
      throw new BadRequestException('Access denied');
    }

    await this.db.query(`DELETE FROM chat_conversations WHERE id = $1`, [
      conversationId,
    ]);

    return { message: 'Conversation deleted' };
  }

  private async hasColumn(tableName: string, columnName: string) {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
       )`,
      [tableName, columnName],
    );

    return result.rows[0]?.exists ?? false;
  }
}
