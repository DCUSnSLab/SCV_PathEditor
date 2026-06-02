pipeline {
    agent any

    environment {
        // 운영 레지스트리/이미지 (클러스터 path-editor 네임스페이스가 pull 하는 이미지)
        DOCKER_REGISTRY = 'harbor.cu.ac.kr'
        IMAGE_NAME      = 'harbor.cu.ac.kr/patheditor/patheditor'

        // Jenkins 자격증명 ID (실제 환경에 맞게 설정)
        //  - harbor push 용 Username/Password 자격증명 ID
        DOCKER_CREDENTIALS_ID = 'harbor-credentials'
        //  - 클러스터 접근용 kubeconfig 자격증명 ID
        KUBECONFIG_CREDENTIALS_ID = 'kubernetes-kubeconfig'

        // 배포 대상 (라이브와 일치)
        K8S_NAMESPACE       = 'path-editor'
        K8S_DEPLOYMENT_NAME = 'scv-path-editor'
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out source code from Git...'
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                echo "Building Docker image: ${IMAGE_NAME}:${env.BUILD_NUMBER}"
                script {
                    docker.build("${IMAGE_NAME}:${env.BUILD_NUMBER}", ".")
                }
            }
        }

        stage('Login to Docker Registry') {
            steps {
                echo "Logging in to ${DOCKER_REGISTRY}..."
                withCredentials([usernamePassword(credentialsId: DOCKER_CREDENTIALS_ID, usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                    sh "echo ${PASSWORD} | docker login -u ${USERNAME} --password-stdin ${DOCKER_REGISTRY}"
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                echo "Pushing image ${IMAGE_NAME}:${env.BUILD_NUMBER} and :latest to ${DOCKER_REGISTRY}"
                sh "docker push ${IMAGE_NAME}:${env.BUILD_NUMBER}"
                sh "docker tag ${IMAGE_NAME}:${env.BUILD_NUMBER} ${IMAGE_NAME}:latest"
                sh "docker push ${IMAGE_NAME}:latest"
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                echo "Deploying to Kubernetes namespace ${K8S_NAMESPACE}..."
                withKubeConfig([credentialsId: KUBECONFIG_CREDENTIALS_ID]) {
                    sh '''
                        # 매니페스트 적용(스펙 변화 반영) — 이미지는 :latest + imagePullPolicy:Always
                        kubectl apply -n ${K8S_NAMESPACE} -f k8s-deployment.yaml

                        # :latest 가 갱신되었으므로 재시작하여 새 이미지를 pull
                        kubectl -n ${K8S_NAMESPACE} rollout restart deployment/${K8S_DEPLOYMENT_NAME}

                        echo "Waiting for deployment rollout to complete..."
                        kubectl -n ${K8S_NAMESPACE} rollout status deployment/${K8S_DEPLOYMENT_NAME} --timeout=120s

                        echo "Deployment successful!"
                    '''
                }
            }
        }
    }

    post {
        always {
            echo "Logging out from Docker registry..."
            sh 'docker logout ${DOCKER_REGISTRY} || true'
            cleanWs()
        }
    }
}
