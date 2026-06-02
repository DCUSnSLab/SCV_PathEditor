// API client for SCV Path Editor Web
function getAppBasePath() {
    const { pathname } = window.location;
    return pathname === '/map' || pathname.startsWith('/map/') ? '/map' : '';
}

function buildAppUrl(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${getAppBasePath()}${normalizedPath}`;
}
class PathAPI {
    constructor(baseUrl = buildAppUrl('/api/path')) {
        this.baseUrl = baseUrl;
        this.coordsBaseUrl = buildAppUrl('/api/coords');
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

    async listFiles() {
        return await this.request(`/files?_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    }

    async listFilesMeta() {
        return await this.request(`/files/meta?_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
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
        // 파일명 검증
        if (!filename || typeof filename !== 'string') {
            throw new Error('유효한 파일명을 입력해주세요');
        }

        if (!filename.toLowerCase().endsWith('.json')) {
            throw new Error('파일명은 .json 확장자여야 합니다');
        }

        // 데이터 검증
        if (!pathData || typeof pathData !== 'object') {
            throw new Error('저장할 데이터가 유효하지 않습니다');
        }

        if (!Array.isArray(pathData.Node) || !Array.isArray(pathData.Link)) {
            throw new Error('Node와 Link 배열이 필요합니다');
        }

        // GPS 좌표 기준으로 모든 UTM 좌표 재계산 (52N 고정)
        await this.recalculateAllUTM(pathData);

        try {
            // JSON 직렬화 가능성 사전 검증
            JSON.stringify(pathData);

            return await this.request(`/save/${encodeURIComponent(filename)}`, {
                method: 'POST',
                body: JSON.stringify(pathData),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('JSON')) {
                throw new Error('데이터를 JSON으로 변환할 수 없습니다');
            }
            throw error;
        }
    }


    // GPS 좌표 기준으로 모든 UTM 좌표 재계산 (zone은 좌표에 맞게 자동 산출)
    async recalculateAllUTM(pathData) {
        console.log('GPS 기준으로 UTM 좌표 재계산 시작...');
        let recalculatedCount = 0;

        for (let i = 0; i < pathData.Node.length; i++) {
            const node = pathData.Node[i];

            if (!node.GpsInfo || typeof node.GpsInfo.Lat !== 'number' || typeof node.GpsInfo.Long !== 'number') {
                console.warn(`${node.ID || `Node[${i}]`}: GPS 좌표가 유효하지 않음, UTM 재계산 건너뜀`);
                continue;
            }

            const { Lat, Long } = node.GpsInfo;

            try {
                // UTM 좌표 재계산 (서버 API 사용)
                const utmData = await this.latLngToUtm(Lat, Long);

                // UTM 정보 업데이트 (GPS 기준 실제 Zone 사용)
                node.UtmInfo = {
                    Easting: Math.round(utmData.easting * 100) / 100,  // 소수점 2자리
                    Northing: Math.round(utmData.northing * 100) / 100,
                    Zone: `${utmData.zone_number}${utmData.zone_letter}`
                };

                recalculatedCount++;
                console.log(`${node.ID}: UTM 재계산 완료 (E: ${node.UtmInfo.Easting}, N: ${node.UtmInfo.Northing})`);

            } catch (error) {
                console.error(`${node.ID || `Node[${i}]`}: UTM 재계산 실패 -`, error);

                // 실패 시 기존 UTM 값 유지 (없으면 0으로 초기화)
                node.UtmInfo = node.UtmInfo || {
                    Easting: 0,
                    Northing: 0,
                    Zone: ""
                };
            }
        }

        console.log(`UTM 재계산 완료: ${recalculatedCount}/${pathData.Node.length}개 노드`);
        return recalculatedCount;
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

    async downloadFile(filepath) {
        // 경로를 올바르게 인코딩하여 전송
        try {
            const encodedPath = encodeURIComponent(filepath);
            const response = await fetch(`${this.baseUrl}/download?path=${encodedPath}`, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch {
                    errorMessage = await response.text() || errorMessage;
                }
                throw new Error(errorMessage);
            }

            // 파일 크기 체크
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) { // 50MB 제한
                throw new Error('파일이 너무 큽니다 (최대 50MB)');
            }

            const blob = await response.blob();

            // 빈 파일 체크
            if (blob.size === 0) {
                throw new Error('파일이 비어있습니다');
            }

            return blob;

        } catch (error) {
            console.error('Download failed:', error);
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('네트워크 연결을 확인해주세요');
            }
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
        const response = await fetch(`${this.coordsBaseUrl}/latlng-to-utm`, {
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
        const response = await fetch(`${this.coordsBaseUrl}/utm-to-latlng`, {
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
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        // 방탄: 배열/객체 모두 허용
        return Array.isArray(res) ? res : (res?.directories ?? []);
    }

    async renameFile(path, newName) {
        return await this.request('/files/rename', {
            method: 'POST',
            body: JSON.stringify({ path, new_name: newName })
        });
    }

    // 참고: 잘라내기/붙여넣기 클립보드는 프런트엔드(localStorage)에서 처리하므로
    // 서버측 클립보드 API 클라이언트는 제거되었다. (ui.js cutSelectedNodes/pasteNodes 참고)

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

// 개선된 알림 메시지 시스템
function showNotification(message, type = 'info', duration = null) {
    // 기존 같은 타입의 알림 제거
    const existingNotifications = document.querySelectorAll(`.notification-${type}`);
    existingNotifications.forEach(notification => {
        notification.remove();
    });

    // 새 알림 생성
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // 아이콘 추가
    const icons = {
        info: '📘',
        success: '✅',
        warning: '⚠️',
        error: '❌'
    };

    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.textContent = icons[type] || icons.info;

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    // 닫기 버튼 추가
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.className = 'notification-close';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        margin-left: 10px;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    closeBtn.onclick = () => notification.remove();

    notification.appendChild(icon);
    notification.appendChild(messageSpan);
    notification.appendChild(closeBtn);

    // 스타일 적용
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 16px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        zIndex: '10000',
        maxWidth: '450px',
        wordWrap: 'break-word',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'slideInRight 0.3s ease-out'
    });

    // 타입별 배경색 및 테두리
    const colors = {
        info: { bg: '#3498db', border: '#2980b9' },
        success: { bg: '#27ae60', border: '#229954' },
        warning: { bg: '#f39c12', border: '#e67e22' },
        error: { bg: '#e74c3c', border: '#c0392b' }
    };

    const colorScheme = colors[type] || colors.info;
    notification.style.backgroundColor = colorScheme.bg;
    notification.style.borderLeft = `4px solid ${colorScheme.border}`;

    // CSS 애니메이션 추가 (한 번만)
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // DOM에 추가
    document.body.appendChild(notification);

    // 자동 제거 시간 설정
    const autoRemoveTime = duration || (type === 'error' ? 5000 : type === 'warning' ? 4000 : 3000);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, autoRemoveTime);

    return notification; // 알림 객체 반환 (필요시 조작 가능)
}

// 개선된 로딩 상태 관리
let loadingCount = 0;

function showLoading(message = '처리 중...') {
    loadingCount++;

    let loading = document.getElementById('loading');
    if (!loading) {
        // 로딩 오버레이가 없으면 생성
        loading = document.createElement('div');
        loading.id = 'loading';
        loading.innerHTML = `
            <div class="loading-backdrop">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <div class="loading-message">처리 중...</div>
                </div>
            </div>
        `;

        // 로딩 스타일 추가
        const style = document.createElement('style');
        style.textContent = `
            #loading {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                display: none;
            }
            .loading-backdrop {
                background: rgba(0, 0, 0, 0.5);
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .loading-content {
                background: white;
                padding: 20px 30px;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            }
            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            .loading-message {
                color: #333;
                font-weight: 500;
                font-size: 14px;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(loading);
    }

    // 메시지 업데이트
    const messageElement = loading.querySelector('.loading-message');
    if (messageElement) {
        messageElement.textContent = message;
    }

    loading.style.display = 'flex';
}

function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);

    if (loadingCount === 0) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }
}

// 프로그레스 바 표시 (대용량 파일 처리용)
function showProgress(message = '진행 중...', progress = 0) {
    let progressOverlay = document.getElementById('progress-overlay');
    if (!progressOverlay) {
        progressOverlay = document.createElement('div');
        progressOverlay.id = 'progress-overlay';
        progressOverlay.innerHTML = `
            <div class="loading-backdrop">
                <div class="progress-content">
                    <div class="progress-message">진행 중...</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar"></div>
                    </div>
                    <div class="progress-percent">0%</div>
                </div>
            </div>
        `;

        // 프로그레스 스타일 추가
        const style = document.createElement('style');
        style.textContent = `
            #progress-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                display: none;
            }
            .progress-content {
                background: white;
                padding: 25px;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                gap: 15px;
                min-width: 300px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            }
            .progress-message {
                color: #333;
                font-weight: 500;
                text-align: center;
            }
            .progress-bar-container {
                background: #f0f0f0;
                border-radius: 10px;
                height: 8px;
                overflow: hidden;
            }
            .progress-bar {
                background: #3498db;
                height: 100%;
                width: 0%;
                transition: width 0.3s ease;
            }
            .progress-percent {
                text-align: center;
                color: #666;
                font-size: 14px;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(progressOverlay);
    }

    const messageElement = progressOverlay.querySelector('.progress-message');
    const progressBar = progressOverlay.querySelector('.progress-bar');
    const progressPercent = progressOverlay.querySelector('.progress-percent');

    messageElement.textContent = message;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    progressPercent.textContent = `${Math.round(progress)}%`;

    progressOverlay.style.display = 'flex';
}

function hideProgress() {
    const progressOverlay = document.getElementById('progress-overlay');
    if (progressOverlay) {
        progressOverlay.style.display = 'none';
    }
}