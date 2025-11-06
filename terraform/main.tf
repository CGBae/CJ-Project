# terraform/main.tf

# 1. [핵심 수정] OpenStack 제공자(Provider) 설정
terraform {
  required_providers {
    # 'ktcloud' 대신 'openstack'을 사용합니다.
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 2.0" # (OpenStack은 버전 2.x대가 안정적입니다)
    }
  }
}

# 2. [핵심 수정] Provider 설정
provider "openstack" {
  # 💡 (KT Cloud API Key/Secret Key - 나중에 .tfvars 파일로 분리)
  # 💡 (주의: 필드 이름이 access_key/secret_key가 아닐 수 있습니다.
  # 
  # KT Cloud 제어판에서 발급받은 'OpenStack RC' 파일의 내용을
  # OS_USERNAME, OS_TENANT_NAME, OS_PASSWORD, OS_AUTH_URL 등에 맞춰야 합니다.
  user_name   = "YOUR_KTCLOUD_OPENSTACK_USERNAME"
  tenant_name = "YOUR_KTCLOUD_OPENSTACK_TENANT_NAME"
  password    = "YOUR_KTCLOUD_OPENSTACK_PASSWORD"
  auth_url    = "https://api.ucloudbiz.olleh.com:8443/v2.0" # (KT Cloud 인증 URL 예시)
  region      = "KOR-Seoul-M2" # (예시: KT Cloud 존 ID)
}

# 3. [핵심 수정] SSH 키 페어 등록 (ktcloud_ssh_key -> openstack_compute_keypair_v2)
resource "openstack_compute_keypair_v2" "my_key" {
  name       = "gitlab-ansible-key"
  public_key = file("~/.ssh/id_rsa.pub") # (로컬의 SSH 공개 키 경로)
}

# 4. [핵심 수정] 방화벽(Security Group) 설정 (ktcloud_security_group -> openstack_networking_secgroup_v2)
resource "openstack_networking_secgroup_v2" "default" {
  name        = "app-sg"
  description = "Security group for the web application"
}

# 4-1. 방화벽 규칙 (SSH: 22)
resource "openstack_networking_secgroup_rule_v2" "ssh_rule" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.default.id
}

# 4-2. 방화벽 규칙 (HTTP: 80 - 나중에 Nginx용)
resource "openstack_networking_secgroup_rule_v2" "http_rule" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 80
  port_range_max    = 80
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.default.id
}

# 4-3. 방화벽 규칙 (HTTPS: 443 - 나중에 Nginx용)
resource "openstack_networking_secgroup_rule_v2" "httpss_rule" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 443
  port_range_max    = 443
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.default.id
}

# (참고: 백엔드/프론트엔드 포트(8000, 3000)는 VM 내부에서만 사용하고, 
# Nginx를 통해 80/443 포트로 연결하는 것이 일반적입니다.)


# 5. [핵심 수정] VM(서버) 생성 (ktcloud_server -> openstack_compute_instance_v2)
resource "openstack_compute_instance_v2" "app_server" {
  name            = "cjproject-vm-01"
  image_name      = "Ubuntu 22.04"    # (KT Cloud가 제공하는 OS 이미지 이름)
  flavor_name     = "m.c2m4"          # (KT Cloud가 제공하는 VM 사양 이름)
  key_pair        = openstack_compute_keypair_v2.my_key.name
  security_groups = [openstack_networking_secgroup_v2.default.name]
  
  network {
    # 💡 (KT Cloud의 기본 네트워크 이름을 찾아야 함, 예: 'public-net')
    name = "YOUR_NETWORK_NAME" 
  }
}

# 6. [핵심 수정] 공인 IP 발급 및 연결 (ktcloud_public_ip -> openstack_networking_floatingip_v2)
resource "openstack_networking_floatingip_v2" "my_ip" {
  # 💡 (KT Cloud의 공인 IP 용 네트워크 풀 이름, 예: 'public')
  pool = "YOUR_PUBLIC_IP_POOL_NAME" 
}

resource "openstack_networking_floatingip_associate_v2" "my_ip_assoc" {
  floating_ip = openstack_networking_floatingip_v2.my_ip.address
  instance_id = openstack_compute_instance_v2.app_server.id
}

# 7. 생성된 VM의 공인 IP 주소를 출력
output "server_public_ip" {
  value = openstack_networking_floatingip_v2.my_ip.address
}