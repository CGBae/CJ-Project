variable "cloud_access_key" {
  description = "클라우드 API 액세스 키"
  type        = string
  sensitive   = true
}
variable "cloud_secret_key" {
  description = "클라우드 API 시크릿 키"
  type        = string
  sensitive   = true
}