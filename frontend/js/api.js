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

// 캐시 방지용 쿼리와 fetch 옵션을 추가
    async listFiles() {
        return await this.request(`/files?_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {'Cache-Control': 'no-cache'}
        });
    }

    async loadPathData(filename) {
        const rel = String(filename).replace(/^\/+/, '');
        const q = encodeURIComponent(rel);
        // 권장: 쿼리파라미터 GET (/load?path=...)
        try {
            return await this.request(`/load?path=${q}`, {
                method: 'GET',
                cache: 'no-store',
                headers: {'Cache-Control': 'no-store'}
            });
        } catch (err) {
            // 폴백1: 경로 파라미터 GET (/load/{rel_path})
            try {
                return await this.request(`/load/${rel}`, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {'Cache-Control': 'no-store'}
                });
            } catch (err2) {
                // 폴백2: 아주 오래된 서버(POST만 열어둔 경우)
                return await this.request(`/load/${rel}`, {method: 'POST'});
            }
        }
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
        // 범용 request 헬퍼가 JSON을 자동 파싱하는 문제를 피하기 위해 fetch를 직접 사용합니다.
        try {
            const response = await fetch(`${this.baseUrl}/download/${filename}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            // ui.js가 처리할 수 있도록 blob 객체를 직접 반환합니다.
            return await response.blob();

        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
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

    // 좌표 변환 API
    async latLngToUtm(lat, lng) {
        // 이 함수는 /api/coords 접두사를 사용하므로 this.request를 직접 사용하지 않음
        const response = await fetch('/api/coords/latlng-to-utm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        return response.json();
    }

    async utmToLatLng(easting, northing, zone_number, zone_letter) {
        const response = await fetch('/api/coords/utm-to-latlng', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ easting, northing, zone_number, zone_letter })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        return response.json();
    }

    // 파일/폴더 조작
    async createFolder(path) {
        return await this.request('/files/mkdir', {
            method: 'POST',
            body: JSON.stringify({ path })
        });
    }

    async deleteFile(path) {
        return await this.request('/files/delete', {
            method: 'POST',
            body: JSON.stringify({ path })
        });
    }

    async moveFile(src, dest) {
        // dest는 '대상 폴더 경로' (예: 'subdir')
        // 서버에서 최종 목적지는 `${dest}/${basename(src)}`로 처리
        return await this.request('/files/move', {
            method: 'POST',
            body: JSON.stringify({ src, dest })
        });
    }

    async listDirs() {
        const res = await this.request(`/files/dirs?_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        // 방탄: 배열/객체 모두 허용
        return Array.isArray(res) ? res : (res?.directories ?? []);
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