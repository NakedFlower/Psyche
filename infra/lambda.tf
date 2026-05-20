# Common Policy Attachment for CloudWatch Logs
resource "aws_iam_policy" "lambda_logging" {
  name        = "${var.project_name}-lambda-logging-${var.environment}"
  path        = "/"
  description = "IAM policy for logging from a lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Role for Generate Lambda
resource "aws_iam_role" "generate" {
  name = "${var.project_name}-generate-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "generate_logs" {
  role       = aws_iam_role.generate.name
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_iam_policy" "generate_s3" {
  name = "${var.project_name}-generate-s3-${var.environment}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:PutObjectAcl"
        ]
        Effect   = "Allow"
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "generate_s3_attach" {
  role       = aws_iam_role.generate.name
  policy_arn = aws_iam_policy.generate_s3.arn
}

# Role for Waitlist Lambda
resource "aws_iam_role" "waitlist" {
  name = "${var.project_name}-waitlist-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "waitlist_logs" {
  role       = aws_iam_role.waitlist.name
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_iam_policy" "waitlist_db" {
  name = "${var.project_name}-waitlist-db-${var.environment}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem"
        ]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.waitlist.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "waitlist_db_attach" {
  role       = aws_iam_role.waitlist.name
  policy_arn = aws_iam_policy.waitlist_db.arn
}

# Dynamic zipping of local python lambda codes
data "archive_file" "generate_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../back/lambda/generate"
  output_path = "${path.module}/generate_lambda.zip"
}

data "archive_file" "waitlist_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../back/lambda/waitlist"
  output_path = "${path.module}/waitlist_lambda.zip"
}

resource "aws_lambda_function" "generate" {
  filename         = data.archive_file.generate_zip.output_path
  source_code_hash = data.archive_file.generate_zip.output_base64sha256
  function_name    = "${var.project_name}-generate-${var.environment}"
  role             = aws_iam_role.generate.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  timeout          = 30

  environment {
    variables = {
      UPLOAD_BUCKET_NAME = aws_s3_bucket.uploads.id
    }
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_lambda_function" "waitlist" {
  filename         = data.archive_file.waitlist_zip.output_path
  source_code_hash = data.archive_file.waitlist_zip.output_base64sha256
  function_name    = "${var.project_name}-waitlist-${var.environment}"
  role             = aws_iam_role.waitlist.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  timeout          = 10

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.waitlist.name
    }
  }

  tags = {
    Environment = var.environment
  }
}
