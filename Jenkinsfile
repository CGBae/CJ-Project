pipeline {
    agent any
    
    // GitHub Actions에서 전달받은 파라미터
    parameters {
        string(name: 'FE_IMAGE_TAG', defaultValue: '')
        string(name: 'BE_IMAGE_TAG', defaultValue: '')
    }
    
    stages {
        stage('Deploy to Localhost') {
            steps {
                // 저장소에서 Ansible 스크립트 가져오기
                git branch: 'Jenkins_CICD', url: 'https://github.com/CGBae/CJ-Project.git'
                
                // Jenkins Credential을 Ansible 변수로 로드
                withCredentials([
                    string(credentialsId: 'ghcr-pat', variable: 'GHCR_PASSWORD')
                ]) {
                    
                    dir('ansible') {
                        // Ansible 실행! (SSH 관련 옵션이 모두 빠짐)
                        sh """
                        ansible-playbook playbook.yml \
                        -i inventory \
                        --extra-vars "fe_image_tag=${params.FE_IMAGE_TAG}" \
                        --extra-vars "be_image_tag=${params.BE_IMAGE_TAG}" \
                        --extra-vars "ghcr_username=CGBae" \
                        --extra-vars "ghcr_password=${GHCR_PASSWORD}"
                        """
                    }
                }
            }
        }
    }
}