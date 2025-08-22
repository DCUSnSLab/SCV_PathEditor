pipeline {
    agent any

    environment {
        // IMPORTANT: Replace these placeholder values with your actual configuration
        DOCKER_REGISTRY = 'https://index.docker.io/v1/' // Or your private registry URL
        DOCKER_USERNAME = 'your-docker-username'      // Docker Hub username or repository owner
        IMAGE_NAME = "${DOCKER_USERNAME}/scv-path-editor"
        
        // The ID of the Username/Password credential for Docker stored in Jenkins
        DOCKER_CREDENTIALS_ID = 'dockerhub-credentials' 
        
        // The ID of the kubeconfig file credential stored in Jenkins
        KUBECONFIG_CREDENTIALS_ID = 'kubernetes-kubeconfig'
        
        // The deployment name from your k8s-deployment.yaml file
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
                echo "Pushing image ${IMAGE_NAME}:${env.BUILD_NUMBER} to ${DOCKER_REGISTRY}"
                sh "docker push ${IMAGE_NAME}:${env.BUILD_NUMBER}"
                
                echo "Tagging and pushing the 'latest' version"
                sh "docker tag ${IMAGE_NAME}:${env.BUILD_NUMBER} ${IMAGE_NAME}:latest"
                sh "docker push ${IMAGE_NAME}:latest"
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                echo "Deploying application to Kubernetes cluster..."
                // Use the Jenkins Kubernetes CLI plugin to provide kubectl with credentials
                withKubeConfig([credentialsId: KUBECONFIG_CREDENTIALS_ID]) {
                    sh '''
                        echo "Updating Kubernetes deployment with new image: ${IMAGE_NAME}:${env.BUILD_NUMBER}"
                        
                        # Use sed to replace the image tag in the YAML file. 
                        # This makes the change idempotent and trackable.
                        sed -i "s|image: .*|image: ${IMAGE_NAME}:${env.BUILD_NUMBER}|g" k8s-deployment.yaml
                        
                        echo "Applying updated k8s configuration..."
                        kubectl apply -f k8s-deployment.yaml
                        
                        echo "Waiting for deployment rollout to complete..."
                        kubectl rollout status deployment/${K8S_DEPLOYMENT_NAME} --timeout=120s
                        
                        echo "Deployment successful!"
                    '''
                }
            }
        }
    }

    post {
        always {
            stage('Logout from Docker Registry') {
                steps {
                    echo "Logging out from Docker registry..."
                    sh 'docker logout'
                }
            }
            
            stage('Clean up workspace') {
                steps {
                    cleanWs()
                }
            }
        }
    }
}