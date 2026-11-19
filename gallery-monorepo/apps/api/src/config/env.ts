import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

/**
 * 环境变量加载与校验：以进程工作目录为基准加载 .env / .env.local。
 * 校验失败立即退出，避免带病启动。
 */
const workingDir = process.cwd();
const baseEnvFile = resolve(workingDir, '.env');
const localEnvFile = resolve(workingDir, '.env.local');

if (existsSync(baseEnvFile)) {
  loadEnv({ path: baseEnvFile, quiet: true });
}
if (existsSync(localEnvFile)) {
  loadEnv({ path: localEnvFile, override: true, quiet: true });
}

/** 环境变量契约：集中声明默认值与类型转换；布尔开关统一用 'true' / 'false' 字符串表示。 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('sylvie'),
  DB_PASSWORD: z.string().default('123456'),
  DB_NAME: z.string().default('sylvie_gallery'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET 长度至少 16 位'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(604800),

  CORS_ORIGIN: z.string().default('http://localhost:3001,http://localhost:8080'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_PRETTY: z.enum(['true', 'false']).optional(),

  MCP_ENABLED: z.enum(['true', 'false']).default('true'),
  MCP_ALLOW_WRITE: z.enum(['true', 'false']).default('false'),

  MQ_ENABLED: z.enum(['true', 'false']).default('false'),
  MQ_URL: z.string().default('amqp://sylvie:123456@127.0.0.1:5672'),
  MQ_QUEUE_PREFIX: z.string().default('sylvie'),
  MQ_PREFETCH: z.coerce.number().int().positive().default(1),

  CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  CACHE_PREFIX: z.string().default('sylvie'),
  CACHE_DEFAULT_TTL: z.coerce.number().int().positive().default(60),
  REDIS_URL: z.string().default(''),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),

  JOB_ENABLED: z.enum(['true', 'false']).default('false'),
  JOB_CONCURRENCY: z.coerce.number().int().positive().default(2),
  JOB_VIP_SWEEP_CRON: z.string().default('*/10 * * * *'),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_FROM: z.string().default('希尔薇图集 <noreply@sylvie.cc>'),

  S3_ENDPOINT: z.string().default('http://127.0.0.1:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('rustfsadmin'),
  S3_SECRET_KEY: z.string().default('rustfsadmin'),
  S3_BUCKET: z.string().default('sylvie'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
  S3_PUBLIC_URL: z.string().default(''),

  /** 开发环境固定验证码；接入真实邮件 / 短信后仍需保留用于本地联调。 */
  VERIFY_CODE_DEMO: z.string().default('123456'),
  /** 本地默认模拟支付；对接沙箱或生产支付宝时置为 'false'。 */
  ALIPAY_MOCK: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),

  ALIPAY_APP_ID: z.string().default(''),
  /** 应用私钥；支持用 \\n 表示换行。 */
  ALIPAY_PRIVATE_KEY: z.string().default(''),
  /** 支付宝公钥；支持用 \\n 表示换行。 */
  ALIPAY_PUBLIC_KEY: z.string().default(''),
  ALIPAY_GATEWAY: z.string().default('https://openapi-sandbox.dl.alipaydev.com/gateway.do'),
  ALIPAY_NOTIFY_URL: z.string().default('http://localhost:3000/api/orders/alipay/notify'),
  ALIPAY_RETURN_URL: z.string().default('http://localhost:3001/membership'),
  ALIPAY_SIGN_TYPE: z.enum(['RSA2', 'RSA']).default('RSA2'),
  ALIPAY_KEY_TYPE: z.enum(['PKCS1', 'PKCS8']).default('PKCS8'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('；');
  console.error(`环境变量校验失败：${detail}`);
  process.exit(1);
}

/** 校验并归一化后的环境变量；应用内统一从这里读取配置。 */
export const env = parsed.data;

/** CORS 白名单：将逗号分隔的配置拆成数组，并剔除空白项。 */
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
