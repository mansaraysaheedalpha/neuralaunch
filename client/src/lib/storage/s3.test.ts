// src/lib/storage/s3.test.ts
//
// Boundary tests for the S3 transport. No actual S3 calls — both
// @aws-sdk/client-s3 (the command classes) and
// @aws-sdk/s3-request-presigner (getSignedUrl) are mocked at the
// module boundary so the tests verify call shapes, not network IO.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the logger so warning lines from deleteObject's catch path
// don't pollute test output.
vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: vi.fn(), debug: vi.fn(), info: vi.fn() }), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Env mock — flip configured/unconfigured by mutating the values
// the module reads. Two separate mock states are exercised below.
const envMock = vi.hoisted(() => ({
  env: {
    AWS_REGION:    'us-east-1',
    AWS_S3_BUCKET: 'neuralaunch-test',
  },
}));
vi.mock('@/lib/env', () => envMock);

// AWS SDK boundary mocks. Capture each command's input shape so we
// can assert on it from the test body.
const sdkMock = vi.hoisted(() => ({
  putCalls:    [] as unknown[],
  getCalls:    [] as unknown[],
  deleteCalls: [] as unknown[],
  signCalls:   [] as unknown[],
  sendCalls:   [] as unknown[],
  signResolves: 'https://signed.example/url',
  sendResolves: true as boolean | 'throw',
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(cmd: unknown): Promise<{ ok: boolean }> {
      sdkMock.sendCalls.push(cmd);
      if (sdkMock.sendResolves === 'throw') return Promise.reject(new Error('boom'));
      return Promise.resolve({ ok: true });
    }
  },
  PutObjectCommand:    class { constructor(input: unknown) { sdkMock.putCalls.push(input);    Object.assign(this, { input }); } },
  GetObjectCommand:    class { constructor(input: unknown) { sdkMock.getCalls.push(input);    Object.assign(this, { input }); } },
  DeleteObjectCommand: class { constructor(input: unknown) { sdkMock.deleteCalls.push(input); Object.assign(this, { input }); } },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (_client: unknown, _command: unknown, opts: { expiresIn: number }): Promise<string> => {
    sdkMock.signCalls.push({ opts });
    return Promise.resolve(sdkMock.signResolves);
  },
}));

import {
  getPresignedUploadUrl,
  getPresignedReadUrl,
  deleteObject,
  isS3KeyOwnedBy,
  S3NotConfiguredError,
  __testInternals,
} from './s3';

beforeEach(() => {
  sdkMock.putCalls    = [];
  sdkMock.getCalls    = [];
  sdkMock.deleteCalls = [];
  sdkMock.signCalls   = [];
  sdkMock.sendCalls   = [];
  sdkMock.signResolves = 'https://signed.example/url';
  sdkMock.sendResolves = true;
  envMock.env.AWS_REGION    = 'us-east-1';
  envMock.env.AWS_S3_BUCKET = 'neuralaunch-test';
});

// ---------------------------------------------------------------------------
// getPresignedUploadUrl
// ---------------------------------------------------------------------------

describe('getPresignedUploadUrl', () => {
  it('returns uploadUrl + s3Key + s3Url with the expected key shape', async () => {
    const result = await getPresignedUploadUrl({
      userId:        'u1',
      sessionId:     's1',
      opportunityId: 'o1',
      contentType:   'image/png',
    });

    expect(result.uploadUrl).toBe('https://signed.example/url');
    expect(result.s3Key).toMatch(/^stage4-uploads\/u1\/s1\/o1\/.+\.png$/);
    expect(result.s3Url).toContain('neuralaunch-test.s3.us-east-1.amazonaws.com');
    expect(result.s3Url).toContain(result.s3Key);
  });

  it('uses the configured TTL when signing the upload URL', async () => {
    await getPresignedUploadUrl({ userId: 'u', sessionId: 's', opportunityId: 'o', contentType: 'image/jpeg' });
    expect(sdkMock.signCalls[0]).toEqual({ opts: { expiresIn: __testInternals.UPLOAD_URL_TTL_SECONDS } });
  });

  it('issues a PutObjectCommand with the right bucket + key + Content-Type', async () => {
    await getPresignedUploadUrl({ userId: 'u', sessionId: 's', opportunityId: 'o', contentType: 'image/webp' });
    const cmd = sdkMock.putCalls[0] as { Bucket: string; Key: string; ContentType: string };
    expect(cmd.Bucket).toBe('neuralaunch-test');
    expect(cmd.Key).toMatch(/\.webp$/);
    expect(cmd.ContentType).toBe('image/webp');
  });

  it('throws when AWS_REGION is unset (S3NotConfiguredError)', async () => {
    envMock.env.AWS_REGION = '';
    await expect(getPresignedUploadUrl({
      userId: 'u', sessionId: 's', opportunityId: 'o', contentType: 'image/png',
    })).rejects.toThrow(S3NotConfiguredError);
  });

  it('throws when AWS_S3_BUCKET is unset (S3NotConfiguredError)', async () => {
    envMock.env.AWS_S3_BUCKET = '';
    await expect(getPresignedUploadUrl({
      userId: 'u', sessionId: 's', opportunityId: 'o', contentType: 'image/png',
    })).rejects.toThrow(S3NotConfiguredError);
  });

  it('refuses disallowed content types', async () => {
    await expect(getPresignedUploadUrl({
      userId: 'u', sessionId: 's', opportunityId: 'o',
      contentType: 'image/gif' as 'image/png',  // smuggle through types
    })).rejects.toThrow(/Disallowed contentType/);
  });
});

// ---------------------------------------------------------------------------
// getPresignedReadUrl
// ---------------------------------------------------------------------------

describe('getPresignedReadUrl', () => {
  it('returns a signed URL with the read-TTL', async () => {
    const url = await getPresignedReadUrl('stage4-uploads/u/s/o/abc.png');
    expect(url).toBe('https://signed.example/url');
    expect(sdkMock.signCalls[0]).toEqual({ opts: { expiresIn: __testInternals.READ_URL_TTL_SECONDS } });
    const cmd = sdkMock.getCalls[0] as { Bucket: string; Key: string };
    expect(cmd.Key).toBe('stage4-uploads/u/s/o/abc.png');
  });

  it('throws S3NotConfiguredError when env is missing', async () => {
    envMock.env.AWS_REGION = '';
    await expect(getPresignedReadUrl('k')).rejects.toThrow(S3NotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// deleteObject
// ---------------------------------------------------------------------------

describe('deleteObject', () => {
  it('sends a DeleteObjectCommand with the right key', async () => {
    await deleteObject('stage4-uploads/u/s/o/x.png');
    const cmd = sdkMock.deleteCalls[0] as { Key: string };
    expect(cmd.Key).toBe('stage4-uploads/u/s/o/x.png');
  });

  it("no-ops silently when env isn't configured (caller's artifact write already happened)", async () => {
    envMock.env.AWS_S3_BUCKET = '';
    await expect(deleteObject('k')).resolves.toBeUndefined();
    expect(sdkMock.deleteCalls).toHaveLength(0);
  });

  it('swallows send failures (logged warn, not thrown)', async () => {
    sdkMock.sendResolves = 'throw';
    await expect(deleteObject('k')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Key prefix + content-type extension mapping
// ---------------------------------------------------------------------------

describe('key shape internals', () => {
  it('maps each allowed content type to its expected extension', () => {
    expect(__testInternals.CONTENT_TYPE_TO_EXT['image/png']).toBe('png');
    expect(__testInternals.CONTENT_TYPE_TO_EXT['image/jpeg']).toBe('jpg');
    expect(__testInternals.CONTENT_TYPE_TO_EXT['image/webp']).toBe('webp');
  });

  it('prefixes every key with stage4-uploads/ (lifecycle rule target)', () => {
    expect(__testInternals.STAGE4_KEY_PREFIX).toBe('stage4-uploads');
  });
});

// ---------------------------------------------------------------------------
// isS3KeyOwnedBy — cross-tenant guard for screenshot s3Key submissions
// ---------------------------------------------------------------------------

describe('isS3KeyOwnedBy', () => {
  it('accepts a key under the user\'s own prefix', () => {
    expect(isS3KeyOwnedBy('stage4-uploads/user_abc/sess_1/opp_1/file.png', 'user_abc')).toBe(true);
  });

  it("rejects a key under another user's prefix", () => {
    expect(isS3KeyOwnedBy('stage4-uploads/user_xyz/sess_1/opp_1/file.png', 'user_abc')).toBe(false);
  });

  it("rejects a key that doesn't start with stage4-uploads/", () => {
    expect(isS3KeyOwnedBy('other-prefix/user_abc/file.png', 'user_abc')).toBe(false);
  });

  it('rejects an empty key', () => {
    expect(isS3KeyOwnedBy('', 'user_abc')).toBe(false);
  });

  it('rejects an empty userId (defensive — never pass empty)', () => {
    expect(isS3KeyOwnedBy('stage4-uploads/x/file.png', '')).toBe(false);
  });

  it('rejects a prefix-match attempt that smuggles foreign user IDs', () => {
    // The slash is load-bearing — without requiring it, an attacker
    // with userId 'user_a' could pass a key for user 'user_abc'
    // (prefix-match without the trailing slash would succeed).
    expect(isS3KeyOwnedBy('stage4-uploads/user_abc/x/file.png', 'user_a')).toBe(false);
  });
});
