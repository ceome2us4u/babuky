# Item photos — Babuki's own private bucket. Vendors' browsers upload
# directly via a presigned URL (apps/web/src/lib/storage.ts); nothing here
# is related to any Me2Us4U bucket.

resource "aws_s3_bucket" "item_images" {
  bucket = "babuki-item-images-${var.account_id}"
}

resource "aws_s3_bucket_versioning" "item_images" {
  bucket = aws_s3_bucket.item_images.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "item_images" {
  bucket                  = aws_s3_bucket.item_images.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false # a bucket policy below allows public GET on objects only
  restrict_public_buckets = false
}

# Object bodies (item photos) are meant to be publicly viewable on the
# storefront pages — only GetObject, never List/Put/Delete.
resource "aws_s3_bucket_policy" "item_images_public_read" {
  bucket = aws_s3_bucket.item_images.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadItemImages"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.item_images.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.item_images]
}
