variable "aws_region" {
  type        = string
  default     = "ap-northeast-2"
  description = "AWS 리전을 지정합니다. 서울 리전은 ap-northeast-2 입니다."
}

variable "project_name" {
  type        = string
  default     = "future-self"
  description = "모든 리소스 이름의 접두사로 사용될 프로젝트 명칭입니다."
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "배포 환경 (dev, stage, prod) 입니다."
}
