resource "aws_dynamodb_table" "waitlist" {
  name         = "FutureSelfWaitlist"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  tags = {
    Name        = "${var.project_name}-waitlist-${var.environment}"
    Environment = var.environment
  }
}
