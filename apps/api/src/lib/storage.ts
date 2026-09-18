import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Item photos live in Babuki's own private S3 bucket (not related to any
// Me2Us4U bucket). Vendors' browsers upload directly to S3 via a
// short-lived presigned URL — no image bytes pass through this server.
// Uses the EC2 instance's own IAM role in production; no static AWS keys.

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UPLOAD_URL_TTL_SECONDS = 300;

let client: S3Client | null = null;

function getClient() {
  if (!client) {
    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error("AWS_REGION is not set");
    }
    client = new S3Client({ region });
  }
  return client;
}

export async function createItemImageUploadUrl(shopId: string, contentType: string) {
  const bucket = process.env.BABUKI_S3_BUCKET;
  if (!bucket) {
    throw new Error("BABUKI_S3_BUCKET is not set");
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Unsupported image type — use JPEG, PNG, or WebP");
  }

  const extension = contentType.split("/")[1];
  const key = `shops/${shopId}/items/${randomUUID()}.${extension}`;

  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  const publicUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl, key };
}
