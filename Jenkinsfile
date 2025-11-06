// Jenkinsfile
pipeline {
    agent any // 이 작업을 아무 젠킨스 노드(서버)에서나 실행

    // GitHub Actions의 'jobs'와 유사
    stages {
        
        // 1. Frontend CI (빌드)
        stage('Build Frontend') {
            tools {
                nodejs 'NodeJS-22' // (Global Tool Configuration에서 설정한 Name)
            }
            steps {
                // frontend 폴더로 이동
                dir('frontend') {
                    // GitHub Actions의 'run:'과 같음
                    sh 'npm install'
                    sh 'npm run build'
                }
            }
        }
        
        // 2. Backend CI (테스트)
        stage('Test Backend') {
            steps {
                script {
                def pythonHome = tool name: 'Python', type: 'jenkins.plugins.shiningpanda.tools.PythonInstallation'
                
                withEnv(["PATH+PYTHON=${pythonHome}/bin"]) {
                    dir('backend') {
                        sh 'pip3 install -r requirements.txt'
                    }
                }
            }
            }
        }
        
        // 3. Deploy (배포)
        stage('Deploy') {
            steps {
                // 젠킨스 서버가 SSH를 통해 배포 서버에 접속
                // (SSH 플러그인 설치 및 설정이 미리 필요함)
                sh 'ssh ubuntu@<배포서버_IP> "cd /home/ubuntu/my-project && git pull && ..."'
            }
        }
    }
}