output "cloudfront_url" {
  value       = "https://${aws_cloudfront_distribution.s3_distribution.domain_name}"
  description = "웹 서비스 접속용 CloudFront 배포 도메인 주소"
}

output "api_gateway_url" {
  value       = aws_apigatewayv2_api.http_api.api_endpoint
  description = "API Gateway 엔드포인트 도메인 주소"
}

output "s3_upload_bucket_name" {
  value       = aws_s3_bucket.uploads.id
  description = "사용자 이미지 업로드용 S3 버킷 이름"
}

output "s3_frontend_bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "프론트엔드 정적 호스팅용 S3 버킷 이름"
}

output "dynamodb_table_name" {
  value       = aws_dynamodb_table.waitlist.name
  description = "사전예약 리스트 저장용 DynamoDB 테이블 이름"
}
