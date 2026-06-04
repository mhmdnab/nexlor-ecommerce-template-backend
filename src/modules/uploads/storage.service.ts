import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Env } from '../../config/env.validation';

export interface PresignResult {
  /** PUT this URL directly from the browser with the file body. */
  uploadUrl: string;
  /** Where the object will be publicly served once uploaded. */
  publicUrl: string;
  /** Object key in the bucket. */
  key: string;
}

/**
 * Storage abstraction so the template can swap R2 for any S3-compatible (or
 * other) provider without touching feature code. Inject the abstract token;
 * the concrete R2 implementation is bound in UploadsModule.
 */
export abstract class StorageService {
  abstract presignUpload(filename: string, contentType: string): Promise<PresignResult>;
  abstract isConfigured(): boolean;
}

@Injectable()
export class R2StorageService extends StorageService {
  private readonly logger = new Logger('R2Storage');
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
    const accountId = this.config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = this.config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    this.bucket = this.config.get('R2_BUCKET', { infer: true });
    this.publicBase = this.config.get('R2_PUBLIC_BASE_URL', { infer: true });

    const endpoint =
      this.config.get('R2_ENDPOINT', { infer: true }) ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    if (accessKeyId && secretAccessKey && endpoint) {
      this.client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn('R2 not configured — upload presigning is disabled (503).');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Image storage is not configured. Set R2_* env vars to enable uploads.',
      );
    }
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    // Stable-ish unique key without Math.random (timestamp + counter-free token).
    const key = `products/${Date.now().toString(36)}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 60 * 5 });
    const publicUrl = `${this.publicBase.replace(/\/$/, '')}/${key}`;
    return { uploadUrl, publicUrl, key };
  }
}
