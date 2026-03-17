import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue;
  }

  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const parseEndpoint = (value: string) => {
  if (!/^https?:\/\//i.test(value)) {
    return {
      endpoint: value,
      inferredPort: undefined as number | undefined,
      inferredUseSSL: undefined as boolean | undefined,
    };
  }

  const parsed = new URL(value);

  return {
    endpoint: parsed.hostname,
    inferredPort: parsed.port ? Number(parsed.port) : undefined,
    inferredUseSSL: parsed.protocol === 'https:',
  };
};

export default registerAs('minio', () => {
  const rawEndpoint = process.env.S3_ENDPOINT ?? '127.0.0.1';
  const { endpoint, inferredPort, inferredUseSSL } = parseEndpoint(rawEndpoint);
  const useSSL = parseBoolean(process.env.S3_USE_SSL, inferredUseSSL ?? false);
  const fallbackPort = useSSL ? 443 : 9000;

  return {
    endpoint,
    port: Number(process.env.S3_PORT ?? inferredPort ?? fallbackPort),
    useSSL,
    initBuckets: parseBoolean(process.env.S3_INIT_BUCKETS, true),
    accessKey: process.env.S3_ACCESS_KEY ?? '',
    secretKey: process.env.S3_SECRET_KEY ?? '',
    region: process.env.S3_REGION ?? 'us-east-1',
    publicUrl: process.env.S3_PUBLIC_URL ?? '',
    buckets: {
      blogImages: process.env.S3_BUCKET_BLOG_IMAGES ?? 'blog-images',
      avatars: process.env.S3_BUCKET_AVATARS ?? 'avatars',
      public: process.env.S3_BUCKET_PUBLIC ?? 'public',
      products: process.env.S3_BUCKET_PRODUCTS ?? 'products',
      tickets: process.env.S3_BUCKET_TICKETS ?? 'tickets',
    },
  };
});
