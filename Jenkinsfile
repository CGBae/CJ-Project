// Jenkinsfile (프로젝트 루트 폴더)
// 젠킨스 파이프라인 스크립트 (Groovy 문법)

pipeline {
    agent any // 젠킨스 서버 어디에서나 실행

    // 1. 툴(Tools) 정의: NodeJS 플러그인 사용
    tools {
        // 💡 [중요] 젠킨스 [Manage Jenkins] > [Global Tool Configuration]에서
        // 'NodeJS' 설정을 추가하고, 이름을 'NodeJS-18'로 지정해야 합니다.
        nodejs 'NodeJS-18' 
    }

    // 2. 단계(Stages) 정의
    stages {
        
        // --- 3. CI (빌드) 단계 ---
        stage('Build Frontend') {
            // 💡 frontend 폴더가 변경되었을 때만 실행
            when {
                changeset "frontend/**" 
            }
            steps {
                echo 'Starting Frontend Build...'
                dir('frontend') { // 'frontend' 폴더로 이동
                    sh 'npm install'
                    
                    // 💡 [중요] 젠킨스 [Credentials]에 등록된 시크릿(환경 변수) 사용
                    // (젠킨스 [Manage Jenkins] > [Credentials]에서 'Secret text'로 등록)
                    withCredentials([
                        string(credentialsId: 'NEXT_PUBLIC_API_BASE_URL', variable: 'NEXT_PUBLIC_API_BASE_URL'),
                        string(credentialsId: 'NEXT_PUBLIC_KAKAO_REST_KEY', variable: 'NEXT_PUBLIC_KAKAO_REST_KEY'),
                        string(credentialsId: 'NEXT_PUBLIC_KAKAO_REDIRECT_URI', variable: 'NEXT_PUBLIC_KAKAO_REDIRECT_URI')
                    ]) {
                        // 💡 환경 변수가 주입된 상태로 빌드 실행
                        sh 'npm run build'
                    }
                }
            }
        }
        
        // --- 4. CI (테스트) 단계 ---
        stage('Test Ansible Syntax') {
            // 💡 ansible 폴더나 Jenkinsfile이 변경되었을 때만 실행
            when {
                changeset "ansible/**,Jenkinsfile"
            }
            steps {
                echo 'Checking Ansible playbook syntax...'
                // 💡 젠킨스 서버(로컬 PC의 WSL)에 Ansible이 설치되어 있어야 함
                // (또는 Docker 컨테이너 안에서 실행)
                sh 'ansible-playbook -i "localhost," --syntax-check ansible/deploy.yml'
                sh 'ansible-playbook -i "localhost," --syntax-check ansible/setup.yml'
            }
        }

        // --- 5. CD (배포) 단계 ---
        // (VM이 준비되었고, 7-1, 7-2 단계를 완료했다는 가정 하에 실행됨)
        stage('Deploy to Server') {
            // 💡 build 또는 test 단계가 성공했을 때 실행
            when {
                anyOf {
                    stageName 'Build Frontend'
                    stageName 'Test Ansible Syntax'
                }
            }
            steps {
                echo 'Deploying to VirtualBox VM...'
                
                // 💡 [중요] 젠킨스 [Credentials]에 등록된 SSH 키/서버 정보 사용
                withCredentials([
                    sshUserPrivateKey(credentialsId: 'vm-ssh-key', keyFileVariable: 'SSH_KEY_FILE', usernameVariable: 'SSH_USER'),
                    string(credentialsId: 'SERVER_HOST', variable: 'SERVER_HOST'),
                    string(credentialsId: 'SERVER_PORT', variable: 'SERVER_PORT')
                ]) {
                    
                    // 💡 Ansible 플러그인 실행
                    ansiblePlaybook(
                        playbook: 'ansible/deploy.yml',
                        inventory: "${env.SSH_USER}@${env.SERVER_HOST},", // 👈 호스트 주소 전달
                        credentialsId: 'vm-ssh-key', // 👈 SSH 키 전달
                        extras: "-e 'ansible_ssh_private_key_file=${env.SSH_KEY_FILE} ansible_port=${env.SERVER_PORT}'" // 👈 포트 전달
                    )
                }
            }
        }
    }
}