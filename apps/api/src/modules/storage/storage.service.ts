import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('minio.endpoint')!;
    const accessKey = this.config.get<string>('minio.accessKey')!;
    const secretKey = this.config.get<string>('minio.secretKey')!;
    this.bucket = this.config.get<string>('minio.bucket')!;

    this.client = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.debug(`Bucket created: ${this.bucket}`);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
        this.logger.debug(`Bucket already exists: ${this.bucket}`);
        return;
      }
      this.logger.error(`Failed to ensure bucket exists: ${this.bucket}`, err);
      throw new InternalServerErrorException('Failed to initialize storage bucket');
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    this.logger.debug(`Uploading object: bucket=${this.bucket} key=${key} contentType=${contentType}`);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (err: unknown) {
      this.logger.error(`Upload failed: key=${key}`, err);
      throw new InternalServerErrorException('Failed to upload object to storage');
    }
  }

  async download(key: string): Promise<Buffer> {
    this.logger.debug(`Downloading object: bucket=${this.bucket} key=${key}`);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      if (name === 'NoSuchKey') {
        throw new NotFoundException(`Object not found: ${key}`);
      }
      this.logger.error(`Download failed: key=${key}`, err);
      throw new InternalServerErrorException('Failed to download object from storage');
    }
  }

  async delete(key: string): Promise<void> {
    this.logger.debug(`Deleting object: bucket=${this.bucket} key=${key}`);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err: unknown) {
      this.logger.error(`Delete failed: key=${key}`, err);
      throw new InternalServerErrorException('Failed to delete object from storage');
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    this.logger.debug(`Deleting objects by prefix: bucket=${this.bucket} prefix=${prefix}`);
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = listResponse.Contents ?? [];

      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key! })),
              Quiet: true,
            },
          }),
        );
        this.logger.debug(`Deleted ${objects.length} objects with prefix=${prefix}`);
      }

      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  async headObject(key: string): Promise<boolean> {
    this.logger.debug(`Checking object existence: bucket=${this.bucket} key=${key}`);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return false;
      }
      this.logger.error(`HeadObject failed: key=${key}`, err);
      throw new InternalServerErrorException('Failed to check object existence in storage');
    }
  }
}
