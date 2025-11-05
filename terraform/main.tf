# (KT Cloud, AWS, GCP 등) 클라우드 프로바이더 설정
provider "ktcloud" { # (이 부분은 클라우드 제공사에 따라 다름)
  access_key = var.cloud_access_key
  secret_key = var.cloud_secret_key
}

# 1. VM(서버) 생성
resource "ktcloud_server" "vm" {
  name      = "cj-project-server"
  image_id  = "vm-image-uuid" # (클라우드에서 제공하는 OS 이미지 ID)
  spec_id   = "vm-spec-uuid"  # (CPU, RAM 사양 ID)
  key_name  = "my-ssh-key"    # (미리 클라우드에 업로드한 SSH 키 이름)
}

# 2. (핵심) 생성된 VM의 IP 주소를 출력
output "server_ip" {
  value = ktcloud_server.vm.public_ip
}