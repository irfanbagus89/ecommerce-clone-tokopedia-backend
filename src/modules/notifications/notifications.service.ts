import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class NotificationsService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async getNotifications(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query(
      `SELECT id, type, title, body, is_read, ref_id, ref_type, created_at
       FROM notifications
       WHERE user_id = $1 AND ($2 IS FALSE OR is_read = false)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, unreadOnly, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = $1 AND ($2 IS FALSE OR is_read = false)`,
      [userId, unreadOnly],
    );

    const unreadRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      unread_count: Number(unreadRes.rows[0].count),
      data: rows.rows,
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const res = await this.db.query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    if (res.rowCount === 0)
      throw new NotFoundException('Notification not found');
    return { message: 'Notification marked as read' };
  }

  async markAllAsRead(userId: string) {
    await this.db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return { message: 'All notifications marked as read' };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const res = await this.db.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    if (res.rowCount === 0)
      throw new NotFoundException('Notification not found');
    return { message: 'Notification deleted' };
  }

  async getUnreadCount(userId: string) {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return { unread_count: Number(res.rows[0].count) };
  }
  async sendNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    refId?: string,
    refType?: string,
  ) {
    await this.db.query(
      `INSERT INTO notifications (id, user_id, type, title, body, ref_id, ref_type, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
      [userId, type, title, body, refId ?? null, refType ?? null],
    );
  }
}
