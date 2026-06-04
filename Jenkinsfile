// SCV Path Editor CI/CD
// Jenkins 잡 'SCV_PathEditor' 가 "Pipeline script from SCM" 으로 이 파일을 읽어 실행한다.
// 동작 환경(검증됨):
//   - 에이전트: Kubernetes 플러그인 기본 템플릿(Pod). /var/run/docker.sock(docker), /usr/bin/kubectl 마운트.
//   - 에이전트의 인클러스터 kubectl 은 path-editor 네임스페이스 배포 권한 보유 → 별도 kubeconfig 자격증명 불필요.
//   - harbor push 는 Jenkins 자격증명 'junhp_harbor'(Username/Password) 사용.
pipeline {
    agent any

    triggers {
        // web_editor 변경을 5분 주기로 폴링하여 자동 빌드/배포 (인바운드 webhook 불필요)
        pollSCM('H/5 * * * *')
    }

    environment {
        REGISTRY = 'harbor.cu.ac.kr'
        IMAGE    = 'harbor.cu.ac.kr/patheditor/patheditor'
        NS       = 'path-editor'
        DEPLOY   = 'scv-path-editor'
        HARBOR_CREDENTIALS_ID = 'junhp_harbor'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'docker build -t $IMAGE:$BUILD_NUMBER -t $IMAGE:latest .'
            }
        }

        stage('Push') {
            steps {
                withCredentials([usernamePassword(credentialsId: HARBOR_CREDENTIALS_ID, usernameVariable: 'HU', passwordVariable: 'HP')]) {
                    sh 'echo "$HP" | docker login $REGISTRY -u "$HU" --password-stdin'
                    sh 'docker push $IMAGE:$BUILD_NUMBER'
                    sh 'docker push $IMAGE:latest'
                }
            }
        }

        stage('Deploy') {
            steps {
                // 불변 태그(:BUILD_NUMBER)로 이미지를 갱신하여 롤아웃 유도
                sh 'kubectl -n $NS set image deployment/$DEPLOY $DEPLOY=$IMAGE:$BUILD_NUMBER'
                sh 'kubectl -n $NS rollout status deployment/$DEPLOY --timeout=120s'
            }
        }
    }

    post {
        always {
            sh 'docker logout $REGISTRY || true'
        }
    }
}
