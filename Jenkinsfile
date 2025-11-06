// Jenkinsfile (프로젝트 루트 폴더)
// 젠킨스 파이프라인 스크립트 (Groovy 문법)

pipeline {
    agent any // 젠킨스 서버 어디에서나 실행

    // 1. 툴(Tools) 정의: NodeJS 플러그인 사용
    tools {
        // 💡 젠킨스 [Global Tool Configuration]에 'NodeJS-18' 이름으로 등록 필요
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
                    
                    // 💡 젠킨스 [Credentials]에 등록된 시크릿(환경 변수) 사용
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
                sh 'ansible-playbook -i "localhost," --syntax-check ansible/deploy.yml'
                sh 'ansible-playbook -i "localhost," --syntax-check ansible/setup.yml'
            }
        }

        // --- 5. CD (배포) 단계 ---
        stage('Deploy to Server') {
            // 💡 [핵심 수정] "stageName" 대신 "changeset" (파일 변경) 조건 사용
            // 💡 (백엔드, 프론트엔드, 앤서블 파일 중 하나라도 바뀌면 배포 실행)
            when {
                anyOf {
                    changeset "backend/**"
                    changeset "frontend/**"
                    changeset "ansible/deploy.yml"
                    changeset "Jenkinsfile" // (Jenkinsfile이 바뀐 경우도 배포 테스트)
                }
            }
            steps {
                echo 'Deploying to VirtualBox VM...'
                
                withCredentials([
                    sshUserPrivateKey(credentialsId: 'vm-ssh-key', keyFileVariable: 'SSH_KEY_FILE', usernameVariable: 'SSH_USER'),
                    string(credentialsId: 'SERVER_HOST', variable: 'SERVER_HOST'),
                    string(credentialsId: 'SERVER_PORT', variable: 'SERVER_PORT')
                ]) {
                    
                    ansiblePlaybook(
                        playbook: 'ansible/deploy.yml',
                        inventory: "${env.SSH_USER}@${env.SERVER_HOST},",
                        credentialsId: 'vm-ssh-key',
                        extras: "-e 'ansible_ssh_private_key_file=${env.SSH_KEY_FILE} ansible_port=${env.SERVER_PORT}'"
                    )
                }
            }
        }
    }
}