# Stage 4 — AWS S3 Setup

One-time configuration for the founder-community-engagement screenshot
pipeline introduced in Stage 4 (Opportunity Evaluation & Research).
The browser uploads directly to S3 via presigned PUT URLs; the
server never sees the file. Claude vision reads via presigned GET
URLs scoped to a 5-minute TTL.

This doc captures: env vars, IAM scope, and the bucket lifecycle
rule that auto-expires uploads after 30 days.

## 1. Environment variables

Set these in `.env.local` (and on Vercel for deployed environments):

```
AWS_REGION=us-east-1               # or your bucket's region
AWS_S3_BUCKET=neuralaunch-uploads  # your bucket name
AWS_ACCESS_KEY_ID=AKIA...          # IAM user access key
AWS_SECRET_ACCESS_KEY=...          # IAM user secret
```

Variable names are chosen to match the AWS SDK's default credential
discovery — `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are read
off `process.env` automatically by the S3 client, so
`lib/storage/s3.ts` only needs to pass `region` explicitly.

All four are **optional at boot**. When any are missing, the
presigned-upload route returns 503 with a clear message and the UI
falls back to "paste your response as text." Text responses don't
need S3.

## 2. IAM user

Create a dedicated IAM user (e.g. `neuralaunch-stage4-uploads`) with
an inline policy scoped to the `stage4-uploads/` prefix only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Stage4UploadsRW",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/stage4-uploads/*"
    }
  ]
}
```

Replace `YOUR_BUCKET` with the bucket name. The wildcard only covers
keys under the `stage4-uploads/` prefix — the IAM user cannot read
or write anything else in the bucket.

`s3:DeleteObject` enables the in-app cleanup path (founder rejects a
screenshot, moderation fails the gate). The S3 lifecycle rule below
catches anything the application misses.

## 3. Lifecycle rule — 30-day expiration

Apply once per bucket via the AWS CLI:

```bash
# Prefix-scoped: only files under stage4-uploads/ expire.
# Other keys in the bucket are untouched.
# Re-run only if you change the bucket or the key prefix in
# lib/storage/s3.ts (STAGE4_KEY_PREFIX). The rule name is
# 'stage4-uploads-30day-expire' so subsequent invocations replace
# this rule cleanly rather than appending a duplicate.

aws s3api put-bucket-lifecycle-configuration \
  --bucket YOUR_BUCKET \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "stage4-uploads-30day-expire",
        "Status": "Enabled",
        "Filter": { "Prefix": "stage4-uploads/" },
        "Expiration": { "Days": 30 }
      }
    ]
  }'
```

Verify the rule landed:

```bash
aws s3api get-bucket-lifecycle-configuration --bucket YOUR_BUCKET
```

## 4. Bucket settings (one-time)

Recommended (manual, in the AWS console under the bucket's
Permissions tab):

- **Block all public access** — `On` (the only access path is via
  presigned URLs from `lib/storage/s3.ts`).
- **Versioning** — `Suspended` (uploads are ephemeral; versioning
  adds cost without resilience value here).
- **Default encryption** — `SSE-S3` (Amazon-managed keys; sufficient
  for the threat model).
- **CORS** — required so the browser PUT from `https://app.neuralaunch.*`
  succeeds. Set the bucket's CORS configuration to:

  ```json
  [
    {
      "AllowedOrigins": ["https://app.neuralaunch.com", "http://localhost:3000"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["Content-Type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 300
    }
  ]
  ```

  Add Vercel preview domains if you want previews to upload too;
  otherwise previews fall back to text-paste responses, which is
  acceptable.

## 5. Sanity check after setup

After the env vars + IAM + bucket are wired, hit a Stage 4 row in
dev:

1. Create a no_idea session, advance through Stage 1+2+3, commit.
2. On Stage 4, hit the "Upload screenshot" affordance.
3. Network tab: a PUT to `https://YOUR_BUCKET.s3.<region>.amazonaws.com/...`
   should return 200.
4. AWS console → S3 → YOUR_BUCKET → `stage4-uploads/<userId>/...` →
   verify the object landed.

If the PUT fails:
- 403 → IAM policy doesn't grant `PutObject`, or the bucket blocks
  public PUTs without the right signature.
- CORS preflight error → the browser is rejecting because the bucket
  CORS doesn't allow the origin or the `Content-Type` header.
- 503 from our route → env vars not set; check `AWS_REGION` and
  `AWS_S3_BUCKET` in `.env.local`.
