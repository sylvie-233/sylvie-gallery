/**
 * 本地文件系统对象存储后端实现（LocalStore）。
 *
 * 把「桶 + 键」映射为 `<rootDir>/<bucket>/<key>`，与 S3 后端保持同一套对象语义；
 * 适合本地开发、单机部署与测试，不跨机器共享。只做对象级读写，不含图片处理。
 *
 * 内容类型无法从文件系统推断，按对象键记录在**进程内**：写入时记住 `contentType`，
 * 重启后 `head` / `get` 的 `contentType` 会回退为 null / `application/octet-stream`；
 * 其余元信息（大小、修改时间、ETag）始终从文件系统实时读取。
 */
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  LocalStoreOptions,
  ObjectInfo,
  StorageBackend,
  StoredObject,
} from './types.js';

/**
 * 判断文件系统错误是否为「对象不存在」。
 *
 * 文件缺失为 ENOENT；键的中间路径落在普通文件上时为 ENOTDIR，
 * 两种情况都按不存在处理。
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * 校验并规范化对象键，防止路径穿越。
 *
 * 统一使用 `/` 分隔；拒绝空键、绝对路径、空段与 `..` 段，
 * 从而保证最终路径始终位于桶目录内。
 *
 * @throws 键为空或包含非法路径片段。
 */
function normalizeKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  if (!normalized.trim()) {
    throw new Error('LocalStore: key 不能为空');
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`LocalStore: key 不能是绝对路径：${key}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`LocalStore: key 包含非法路径片段：${key}`);
  }
  return normalized;
}

/**
 * 校验桶名（作为根目录下的子目录名）。
 *
 * @throws 桶名为空或包含路径分隔符 / 穿越片段。
 */
function assertBucket(bucket: string): void {
  if (!bucket.trim() || bucket.includes('/') || bucket.includes('\\') || bucket.includes('..')) {
    throw new Error(`LocalStore: bucket 非法：${bucket}`);
  }
}

/**
 * 本地文件系统对象存储后端。
 *
 * - 配置由调用方注入，包内不读取环境变量；
 * - 不包含图片处理逻辑，只负责对象的上传、读取、探测与删除；
 * - 对象键做路径穿越校验，非法键直接抛错；
 * - 除「不存在」按 null / 空操作处理外，其余文件系统错误直接抛出。
 */
export class LocalStore implements StorageBackend {
  /** 桶名（根目录下的命名空间子目录）。 */
  readonly bucket: string;

  private readonly rootDir: string;
  private readonly baseDir: string;
  /** 进程内的对象内容类型记录，键为规范化后的对象键。 */
  private readonly contentTypes = new Map<string, string>();

  /**
   * 创建本地文件后端。
   *
   * 仅做参数校验与路径解析，不创建目录；目录由 `ensureBucket` 建好，
   * 首次 `put` 也会按需创建中间目录。
   *
   * @throws rootDir 或 bucket 为空 / 非法。
   */
  constructor(options: LocalStoreOptions) {
    if (!options.rootDir.trim()) {
      throw new Error('LocalStore: rootDir 不能为空');
    }
    assertBucket(options.bucket);

    this.rootDir = path.resolve(options.rootDir);
    this.bucket = options.bucket;
    this.baseDir = path.resolve(this.rootDir, this.bucket);
  }

  /**
   * 确保桶目录存在；已存在返回 false，本次新建返回 true。
   *
   * 探测出错（如权限不足）时交给 mkdir 抛出，避免把真实故障吞掉。
   */
  async ensureBucket(): Promise<boolean> {
    try {
      await access(this.baseDir);
      return false;
    } catch {
      await mkdir(this.baseDir, { recursive: true });
      return true;
    }
  }

  /** 桶目录是否存在且为目录；任何异常都视为不健康，不向外抛错。 */
  async isHealthy(): Promise<boolean> {
    try {
      const info = await stat(this.baseDir);
      return info.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 上传对象（同 key 覆盖）。中间目录按需创建，内容类型记入进程内映射。
   *
   * 本地后端不关心 Cache-Control，`PutOptions` 被忽略。
   */
  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const relative = normalizeKey(key);
    const filePath = this.pathFor(relative);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    this.contentTypes.set(relative, contentType);
  }

  /**
   * 读取对象内容与元信息；对象不存在时返回 null，其它错误继续抛出。
   *
   * `body` 为字节数组；内容类型来自进程内记录，未命中时回退为 `application/octet-stream`。
   */
  async get(key: string): Promise<StoredObject | null> {
    const relative = normalizeKey(key);
    try {
      const buffer = await readFile(this.pathFor(relative));
      return {
        body: new Uint8Array(buffer),
        contentType: this.contentTypes.get(relative) ?? 'application/octet-stream',
        contentLength: buffer.byteLength,
      };
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 读取对象元信息（基于 stat）；对象不存在时返回 null，其它错误继续抛出。
   *
   * `contentType` 来自进程内记录，重启后为 null；
   * `etag` 由文件大小与修改时间推导，仅用于本地场景。
   */
  async head(key: string): Promise<ObjectInfo | null> {
    const relative = normalizeKey(key);
    try {
      const info = await stat(this.pathFor(relative));
      if (!info.isFile()) {
        return null;
      }
      return {
        size: info.size,
        contentType: this.contentTypes.get(relative) ?? null,
        lastModified: info.mtime,
        etag: `"${info.size}-${Math.floor(info.mtimeMs)}"`,
      };
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  /** 删除对象，幂等：对象不存在视为成功，同时清理内容类型记录。 */
  async delete(key: string): Promise<void> {
    const relative = normalizeKey(key);
    this.contentTypes.delete(relative);
    try {
      await rm(this.pathFor(relative), { force: true });
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  /** 把已规范化的对象键解析为桶目录内的绝对路径，并再次校验不越界。 */
  private pathFor(relative: string): string {
    const resolved = path.resolve(this.baseDir, relative);
    if (resolved !== this.baseDir && !resolved.startsWith(this.baseDir + path.sep)) {
      throw new Error(`LocalStore: key 越界：${relative}`);
    }
    return resolved;
  }
}
