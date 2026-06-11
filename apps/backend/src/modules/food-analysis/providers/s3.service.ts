import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import * as sharp from 'sharp';
import { nanoid } from 'nanoid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3: AWS.S3;
  private readonly bucket: string;
  private readonly cloudfrontUrl: string | undefined;

  constructor(private configService: ConfigService) {
    this.s3 = new AWS.S3({
      accessKeyId: configService.get<string>('aws.accessKeyId'),
      secretAccessKey: configService.get<string>('aws.secretAccessKey'),
      region: configService.get<string>('aws.region', 'us-east-1'),
    });
    this.bucket = configService.get<string>('aws.s3Bucket', 'macrovision-images');
    this.cloudfrontUrl = configService.get<string>('aws.cloudfrontUrl');
  }

  async uploadFoodImage(
    buffer: Buffer,
    userId: string,
    mimeType: string,
  ): Promise<{ imageUrl: string; thumbnailUrl: string; imagePath: string }> {
    const imageId = nanoid(16);
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const imagePath = `analyses/${userId}/${imageId}.${ext}`;
    const thumbnailPath = `analyses/${userId}/${imageId}_thumb.${ext}`;

    // Optimizar imagen principal (máx 1024px, 80% calidad)
    const optimized = await sharp(buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    // Thumbnail (256px)
    const thumbnail = await sharp(buffer)
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();

    const [imageResult, thumbnailResult] = await Promise.all([
      this.upload(optimized, imagePath, 'image/jpeg'),
      this.upload(thumbnail, thumbnailPath, 'image/jpeg'),
    ]);

    return {
      imageUrl: this.getPublicUrl(imagePath),
      thumbnailUrl: this.getPublicUrl(thumbnailPath),
      imagePath,
    };
  }

  async deleteImage(imagePath: string): Promise<void> {
    await this.s3
      .deleteObject({ Bucket: this.bucket, Key: imagePath })
      .promise();
  }

  async getBase64(buffer: Buffer): Promise<string> {
    return buffer.toString('base64');
  }

  private async upload(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<AWS.S3.ManagedUpload.SendData> {
    return this.s3
      .upload({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'max-age=31536000',
      })
      .promise();
  }

  private getPublicUrl(key: string): string {
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
}
