import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService) {}

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
    publicIdPrefix: string,
  ): Promise<{ secure_url: string; public_id: string }> {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Cloudinary configuration is incomplete');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rootFolder =
      this.config.get<string>('CLOUDINARY_FOLDER') || 'ecommerce';
    const targetFolder = `${rootFolder}/${folder}`.replace(/\/+/g, '/');
    const publicId = `${publicIdPrefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const signature = this.sign(
      { folder: targetFolder, public_id: publicId, timestamp },
      apiSecret,
    );

    const content = file.buffer.toString('base64');
    const mimeType = file.mimetype || 'application/octet-stream';
    const body = new URLSearchParams({
      file: `data:${mimeType};base64,${content}`,
      api_key: apiKey,
      folder: targetFolder,
      public_id: publicId,
      timestamp,
      signature,
    });

    const response = await axios.post<{
      secure_url: string;
      public_id: string;
    }>(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      secure_url: response.data.secure_url,
      public_id: response.data.public_id,
    };
  }

  private sign(params: Record<string, string>, apiSecret: string): string {
    const payload = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
  }
}
