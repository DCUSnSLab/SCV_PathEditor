// API client for SCV Path Editor Web
class PathAPI {
    constructor(baseUrl = '/api/path') {
        this.baseUrl = baseUrl;
    }

    async request(url, options = {}) {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(`${this.baseUrl}${url}`, config);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // JSON 응답이 아닌 경우 (파일 다운로드 등)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // 파일 관련 API
    async listFiles() {
        return await this.request('/files');
    }

    async loadPathData(filename) {
        return await this.request(`/load/${filename}`, { method: 'POST' });
    }

    async savePathData(filename, pathData) {
        return await this.request(`/save/${filename}`, {
            method: 'POST',
            body: JSON.stringify(pathData)
        });
    }

    async getCurrentData() {
        return await this.request('/current');
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        return await this.request('/upload', {
            method: 'POST',
            headers: {}, // Content-Type을 자동으로 설정하도록 비움
            body: formData
        });
    }

    async downloadFile(filename) {
        const response = await this.request(`/download/${filename}`);
        return response.blob();
    }

    // 노드 관련 API
    async getAllNodes() {
        return await this.request('/nodes');
    }

    async getNode(nodeId) {
        return await this.request(`/nodes/${nodeId}`);
    }

    async createNode(nodeData) {
        return await this.request('/nodes', {
            method: 'POST',
            body: JSON.stringify(nodeData)
        });
    }

    async updateNodePosition(nodeId, lat, lon) {
        return await this.request(`/nodes/${nodeId}/position?lat=${lat}&lon=${lon}`, {
            method: 'PUT'
        });
    }

    async deleteNode(nodeId) {
        return await this.request(`/nodes/${nodeId}`, {
            method: 'DELETE'
        });
    }

    // 링크 관련 API
    async getAllLinks() {
        return await this.request('/links');
    }

    async getLink(linkId) {
        return await this.request(`/links/${linkId}`);
    }

    async createLink(linkData) {
        return await this.request('/links', {
            method: 'POST',
            body: JSON.stringify(linkData)
        });
    }

    async deleteLink(linkId) {
        return await this.request(`/links/${linkId}`, {
            method: 'DELETE'
        });
    }
}

// 전역 API 인스턴스
const pathAPI = new PathAPI();

// 에러 처리 헬퍼
function handleAPIError(error, defaultMessage = 'API 요청 중 오류가 발생했습니다') {
    console.error('API Error:', error);
    
    let message = defaultMessage;
    if (error.message) {
        message = error.message;
    }
    
    // 사용자에게 에러 메시지 표시
    showNotification(message, 'error');
    return null;
}

// 알림 메시지 표시 함수
function showNotification(message, type = 'info') {
    // 기존 알림 제거
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // 새 알림 생성
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 스타일 적용
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '4px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        maxWidth: '400px',
        wordWrap: 'break-word'
    });

    // 타입별 배경색
    const colors = {
        info: '#3498db',
        success: '#27ae60',
        warning: '#f39c12',
        error: '#e74c3c'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    // DOM에 추가
    document.body.appendChild(notification);

    // 3초 후 자동 제거
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// 로딩 상태 관리
function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'flex';
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}