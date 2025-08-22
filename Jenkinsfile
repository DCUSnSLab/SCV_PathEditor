pipeline {
    agent any

    environment {
        // IMPORTANT: Replace these placeholder values with your actual configuration
        DOCKER_REGISTRY = 'https://index.docker.io/v1/' // Or your private registry URL
        DOCKER_USERNAME = 'your-docker-username'      // Docker Hub username or repository owner
        IMAGE_NAME = "${DOCKER_USERNAME}/scv-path-editor"
        // The ID of the Username/Password credential stored in Jenkins
        DOCKER_CREDENTIALS_ID = 'dockerhub-credentials' 
        // The ID of the SSH credential stored in Jenkins for deployment
        SSH_CREDENTIALS_ID = 'your-server-ssh-key'
        SERVER_USER_IP = 'your-user@your-server-ip'
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
                    // Use the Dockerfile in the current directory to build the image
                    docker.build("${IMAGE_NAME}:${env.BUILD_NUMBER}", ".")
                }
            }
        }

        stage('Login to Docker Registry') {
            steps {
                echo "Logging in to ${DOCKER_REGISTRY}..."
                // Use the Jenkins Credentials plugin to securely handle credentials
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

        stage('Deploy to Server') {
            // This is a simplified deployment example. 
            // For a real production environment, consider using tools like Ansible, Kubernetes, or a dedicated deployment script.
            // This stage requires the Jenkins agent to have passwordless SSH access to the deployment server.
            steps {
                echo "Deploying application to ${SERVER_USER_IP}..."
                // Use the Jenkins SSH Agent plugin to securely connect to the remote server
                sshagent(credentials: [SSH_CREDENTIALS_ID]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${SERVER_USER_IP} << 'ENDSSH'
                            # Stop and remove the old container to avoid conflicts
                            echo 'Stopping and removing old container...'
                            docker stop scv-path-editor || true
                            docker rm scv-path-editor || true
                            
                            # Pull the latest image from the registry
                            echo 'Pulling latest image...'
                            docker pull ${IMAGE_NAME}:latest
                            
                            # Run the new container in detached mode
                            echo 'Starting new container...'
                            docker run -d --name scv-path-editor -p 80:8000 ${IMAGE_NAME}:latest
                            
                            echo 'Deployment complete.'
                        ENDSSH
                    """
                }
            }
        }
    }

    post {
        always {
            // This block runs regardless of the pipeline's success or failure
            stage('Logout from Docker Registry') {
                steps {
                    echo "Logging out from Docker registry..."
                    sh 'docker logout'
                }
            }
            
            stage('Clean up workspace') {
                steps {
                    // Deletes all files from the current workspace
                    cleanWs()
                }
            }
        }
    }
}
