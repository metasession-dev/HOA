import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../common/prisma.service';

/**
 * Pluggable file storage. Today: local filesystem (Railway Volumes mount).
 * Tomorrow: drop in S3/R2 via the same interface — consumers only see
 * `StoredFile` ids + signed URLs.
 *
 * Layout on disk:
 *   <STORAGE_ROOT>/<storageKey>
 *
 * `storageKey` is computed deterministically as:
 *   {org_<orgId>|platform}/<kind>/<sha256-first-32>.<ext>
 *
 * Same content uploaded twice → identical key → physical dedup (we skip the
 * write if the file exists and the row is reused via `findUnique({storageKey})`).
 */

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  kind:
    | 'org_logo'
    | 'user_avatar'
    | 'document'
    | 'violation_photo'
    | 'vendor_invoice'
    | 'resale_attachment'
    | 'broadcast_attachment'
    | 'board_pack'
    | 'misc';
  organizationId: string | null;
  uploaderUserId: string | null;
  refType?: string;
  refId?: string;
  isPublic?: boolean;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

// Hard per-upload caps (in bytes). Per-kind so we can refuse a 50MB "avatar"
// without inspecting the path.
const SIZE_LIMITS: Record<UploadInput['kind'], number> = {
  org_logo: 2 * 1024 * 1024,
  user_avatar: 2 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  violation_photo: 10 * 1024 * 1024,
  vendor_invoice: 25 * 1024 * 1024,
  resale_attachment: 25 * 1024 * 1024,
  broadcast_attachment: 10 * 1024 * 1024,
  board_pack: 50 * 1024 * 1024,
  misc: 25 * 1024 * 1024,
};

const ALLOWED_MIME_BY_KIND: Record<UploadInput['kind'], RegExp> = {
  org_logo: /^image\/(png|jpeg|svg\+xml|webp)$/,
  user_avatar: /^image\/(png|jpeg|webp)$/,
  document: /^application\/(pdf|msword|vnd\.openxmlformats|vnd\.ms-excel)|^image\//,
  violation_photo: /^image\/(png|jpeg|webp|heic)$/,
  vendor_invoice: /^application\/pdf$|^image\/(png|jpeg|webp)$/,
  resale_attachment: /^application\/pdf$|^image\/|^text\//,
  broadcast_attachment: /^image\/|^application\/pdf$/,
  board_pack: /^application\/pdf$/,
  misc: /.*/,
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;
  private readonly signingSecret: string;

  constructor(private prisma: PrismaService) {
    this.root = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage');
    this.signingSecret =
      process.env.STORAGE_URL_SECRET || process.env.JWT_SECRET || 'dev-storage-secret-change-me';
  }

  async onModuleInit() {
    await fs.mkdir(this.root, { recursive: true });
    this.logger.log(`Storage root: ${this.root}`);
  }

  /** Persist a buffer + create the StoredFile row. Dedupes on sha256+kind. */
  async upload(input: UploadInput): Promise<{ id: string; storageKey: string; sha256: string; size: number }> {
    if (input.buffer.length === 0) throw new BadRequestException('Empty upload');
    const cap = SIZE_LIMITS[input.kind] ?? SIZE_LIMITS.misc;
    if (input.buffer.length > cap) {
      throw new PayloadTooLargeException(`Upload exceeds ${Math.round(cap / 1024 / 1024)}MB cap for ${input.kind}`);
    }
    const mimeRegex = ALLOWED_MIME_BY_KIND[input.kind];
    if (mimeRegex && !mimeRegex.test(input.mimeType)) {
      throw new BadRequestException(`Mime type "${input.mimeType}" not allowed for ${input.kind}`);
    }

    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
    const ext = this.extFromMime(input.mimeType) || this.extFromFilename(input.filename) || 'bin';
    const orgScope = input.organizationId ? `org_${input.organizationId}` : 'platform';
    const storageKey = `${orgScope}/${input.kind}/${sha256.slice(0, 32)}.${ext}`;
    const absPath = path.join(this.root, storageKey);

    // Physical dedup — write only when absent.
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    try {
      await fs.access(absPath);
    } catch {
      await fs.writeFile(absPath, input.buffer);
    }

    // Logical dedup — a single StoredFile row per (storageKey).
    const existing = await this.prisma.storedFile.findUnique({ where: { storageKey } });
    if (existing) {
      return { id: existing.id, storageKey, sha256, size: input.buffer.length };
    }
    const row = await this.prisma.storedFile.create({
      data: {
        organizationId: input.organizationId,
        uploaderUserId: input.uploaderUserId,
        storageKey,
        kind: input.kind,
        filename: this.sanitiseFilename(input.filename),
        mimeType: input.mimeType,
        size: input.buffer.length,
        sha256,
        isPublic: input.isPublic ?? false,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
    return { id: row.id, storageKey, sha256, size: input.buffer.length };
  }

  /** Get metadata + verify access. */
  async get(fileId: string, accessor: { userId: string | null; organizationId: string | null }) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file || file.status === 'deleted') throw new NotFoundException('File not found');
    if (!file.isPublic) {
      // Org-scoped reads — caller must belong to the file's org.
      if (file.organizationId && accessor.organizationId !== file.organizationId) {
        throw new ForbiddenException();
      }
    }
    return file;
  }

  /**
   * Look up a file by id without org-scope checks. The signed URL handler
   * uses this — the signature already proved authorisation, re-checking the
   * caller's org would defeat the purpose (the download endpoint is @Public).
   */
  async getForSignedDownload(fileId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file || file.status === 'deleted') throw new NotFoundException('File not found');
    return file;
  }

  /** Read bytes off disk. Caller must have already passed `get()`. */
  async read(storageKey: string): Promise<Buffer> {
    const safe = this.assertSafeKey(storageKey);
    return fs.readFile(path.join(this.root, safe));
  }

  /** Sign a short-lived URL for direct client download. */
  signUrl(fileId: string, ttlSeconds = 300): SignedUrl {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const payload = `${fileId}.${exp}`;
    const sig = crypto.createHmac('sha256', this.signingSecret).update(payload).digest('base64url');
    return { url: `/api/files/${fileId}/download?exp=${exp}&sig=${sig}`, expiresAt };
  }

  /** Verify a signed-URL hit. Throws on tamper or expiry. */
  verifySignedUrl(fileId: string, exp: string, sig: string): void {
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Signed URL expired');
    }
    const expected = crypto.createHmac('sha256', this.signingSecret).update(`${fileId}.${expNum}`).digest('base64url');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(sig), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new ForbiddenException('Signed URL tampered');
    }
  }

  /** Mark a file deleted (soft) and unlink the blob. Org-scoped guard. */
  async softDelete(fileId: string, actor: { organizationId: string | null }) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException();
    if (file.organizationId && file.organizationId !== actor.organizationId) {
      throw new ForbiddenException();
    }
    await this.prisma.storedFile.update({ where: { id: fileId }, data: { status: 'deleted' } });
    const safe = this.assertSafeKey(file.storageKey);
    await fs.unlink(path.join(this.root, safe)).catch(() => undefined);
  }

  // ---------- helpers ----------
  private sanitiseFilename(name: string): string {
    return name.replace(/[ -\\/:*?"<>|]/g, '_').slice(0, 200);
  }

  private extFromMime(m: string): string | null {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/heic': 'heic',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/plain': 'txt',
      'text/csv': 'csv',
    };
    return map[m] ?? null;
  }

  private extFromFilename(name: string): string | null {
    const i = name.lastIndexOf('.');
    if (i < 0) return null;
    const ext = name.slice(i + 1).toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) return null;
    return ext;
  }

  // Disallow `..`, leading `/`, and Windows drive prefixes — any of those would
  // let a caller read arbitrary files via the download endpoint.
  private assertSafeKey(key: string): string {
    if (!key || key.startsWith('/') || key.includes('..') || /^[A-Za-z]:/.test(key)) {
      throw new BadRequestException('Invalid storage key');
    }
    return key;
  }
}
