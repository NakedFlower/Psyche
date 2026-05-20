resource "aws_s3_bucket" "uploads" {
  bucket        = "${var.project_name}-user-uploads-${var.environment}-${random_string.suffix.result}"
  force_destroy = true

  tags = {
    Name        = "${var.project_name}-uploads"
    Environment = var.environment
  }
}

# CORS Rule configuration
resource "aws_s3_bucket_cors_configuration" "uploads_cors" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}
