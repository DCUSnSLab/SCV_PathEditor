// Main application initialization and coordination
class SCVPathEditor {
    constructor() {
        this.map = null;
        this.ui = null;
        this.initialized = false;
    }

    async init() {
        try {
            // UI 매니저 초기화
            this.ui = new UIManager();
            
            // 지도 초기화
            this.map = new PathMap('map');
            
            // 전역 변수로 설정 (다른 모듈에서 접근 가능)
            window.pathMap = this.map;
            window.uiManager = this.ui;
            
            // 지도 이벤트 연결
            this.setupMapEvents();
            
            // 초기 파일 목록 로드
            await this.ui.loadFileList();
            
            // 예시 데이터 로드 시도
            await this.loadExampleData();
            
            this.initialized = true;
            console.log('SCV Path Editor Web 초기화 완료');
            showNotification('SCV Path Editor Web이 시작되었습니다', 'success');
            
        } catch (error) {
            console.error('애플리케이션 초기화 실패:', error);
            showNotification('애플리케이션 초기화 중 오류가 발생했습니다', 'error');
        }
    }

    setupMapEvents() {
        // 노드 선택 이벤트
        this.map.onNodeSelect = (nodeId, nodeData) => {
            this.ui.updateSelectedNodeInfo(nodeId, nodeData);
        };

        // 노드 드래그 이벤트
        this.map.onNodeDrag = async (nodeId, lat, lng) => {
            try {
                // 현재 데이터 업데이트
                const nodeIndex = this.ui.currentData.Node.findIndex(node => node.ID === nodeId);
                if (nodeIndex !== -1) {
                    this.ui.currentData.Node[nodeIndex].GpsInfo.Lat = lat;
                    this.ui.currentData.Node[nodeIndex].GpsInfo.Long = lng;
                    
                    // UTM 좌표 업데이트 (서버에서 계산됨)
                    const updatedData = await pathAPI.getCurrentData();
                    const updatedNode = updatedData.Node.find(node => node.ID === nodeId);
                    if (updatedNode) {
                        this.ui.currentData.Node[nodeIndex] = updatedNode;
                    }
                    
                    // 링크 데이터도 업데이트 (길이 재계산됨)
                    this.ui.currentData.Link = updatedData.Link;
                }
                
                // 테이블 업데이트
                this.ui.updateTables();
                
                // 선택된 노드 정보 업데이트
                if (this.map.selectedNode === nodeId) {
                    const nodeData = this.ui.currentData.Node.find(node => node.ID === nodeId);
                    this.ui.updateSelectedNodeInfo(nodeId, nodeData);
                }
                
            } catch (error) {
                console.error('노드 드래그 처리 중 오류:', error);
            }
        };

        // 지도 클릭 이벤트
        this.map.onMapClick = (lat, lng, mode) => {
            if (mode === 'addNode') {
                this.ui.showAddNodeModal(lat, lng);
            }
        };

        // 링크 생성 이벤트
        this.map.onLinkCreate = (linkData) => {
            this.ui.onLinkCreated(linkData);
        };
    }

    async loadExampleData() {
        try {
            // examplePath.json 파일이 있는지 확인하고 로드
            const files = await pathAPI.listFiles();
            if (files.includes('examplePath.json')) {
                await this.ui.loadPathData('examplePath.json');
                this.ui.fileSelect.value = 'examplePath.json';
            }
        } catch (error) {
            console.log('예시 데이터 로드 실패 (정상적인 상황일 수 있음):', error.message);
        }
    }

    // 애플리케이션 상태 확인
    isReady() {
        return this.initialized && this.map && this.ui;
    }

    // 현재 데이터 내보내기
    exportCurrentData() {
        if (!this.ui) return null;
        return JSON.parse(JSON.stringify(this.ui.currentData));
    }

    // 데이터 가져오기
    async importData(pathData) {
        if (!this.ui) return;
        
        this.ui.currentData = pathData;
        this.ui.updateTables();
        this.ui.updateMap();
    }

    // 지도 중심을 특정 좌표로 이동
    centerMapTo(lat, lng, zoom = 15) {
        if (this.map && this.map.map) {
            this.map.map.setView([lat, lng], zoom);
        }
    }

    // 특정 노드로 지도 중심 이동
    centerToNode(nodeId) {
        if (!this.ui || !this.map) return;
        
        const node = this.ui.currentData.Node.find(n => n.ID === nodeId);
        if (node) {
            this.centerMapTo(node.GpsInfo.Lat, node.GpsInfo.Long, 18);
            this.map.selectNode(nodeId);
        }
    }

    // 애플리케이션 재시작
    async restart() {
        if (this.map) {
            this.map.clearAll();
        }
        
        this.initialized = false;
        await this.init();
    }
}

// DOM 로드 완료 시 애플리케이션 시작
document.addEventListener('DOMContentLoaded', async () => {
    // 전역 앱 인스턴스 생성
    window.scvApp = new SCVPathEditor();
    
    try {
        await window.scvApp.init();
    } catch (error) {
        console.error('애플리케이션 시작 실패:', error);
        showNotification('애플리케이션을 시작할 수 없습니다. 페이지를 새로고침해주세요.', 'error');
    }
});

// 페이지 언로드 시 정리 작업
window.addEventListener('beforeunload', () => {
    if (window.scvApp && window.scvApp.map) {
        window.scvApp.map.clearAll();
    }
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
    if (!window.scvApp || !window.scvApp.isReady()) return;

    // Ctrl/Cmd + S: 저장
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        window.uiManager.showSaveModal();
    }

    // Ctrl/Cmd + O: 열기
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        window.uiManager.loadFile();
    }

    // ESC: 모달 닫기 또는 선택 해제
    if (e.key === 'Escape') {
        // 모달이 열려있으면 닫기
        const openModal = document.querySelector('.modal[style*="block"]');
        if (openModal) {
            window.uiManager.hideModal(openModal.id);
            return;
        }

        // QuickLink 선택 상태 초기화
        if (window.pathMap && window.pathMap.mode === 'quickLink') {
            window.pathMap.resetQuickLinkSelection();
        }
    }

    // 숫자 키로 모드 변경
    const modes = ['select', 'drag', 'addNode', 'quickLink'];
    const keyNum = parseInt(e.key);
    if (keyNum >= 1 && keyNum <= 4) {
        e.preventDefault();
        window.uiManager.setMode(modes[keyNum - 1]);
    }

    // Q: QuickLink 모드
    if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        window.uiManager.setMode('quickLink');
    }

    // D: 드래그 모드
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        window.uiManager.setMode('drag');
    }

    // A: 노드 추가 모드
    if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        window.uiManager.setMode('addNode');
    }

    // Delete 또는 Backspace: 선택된 노드 삭제
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
        const selectedNode = window.pathMap?.getSelectedNode();
        if (selectedNode && selectedNode.data) {
            e.preventDefault();
            window.uiManager.deleteSelectedNode(selectedNode.data.ID);
        }
    }
});

// 디버그 및 개발 도우미 함수들 (콘솔에서 사용 가능)
window.debug = {
    // 현재 데이터 출력
    getCurrentData: () => {
        return window.scvApp ? window.scvApp.exportCurrentData() : null;
    },

    // 지도 정보 출력
    getMapInfo: () => {
        if (!window.pathMap) return null;
        return {
            center: window.pathMap.map.getCenter(),
            zoom: window.pathMap.map.getZoom(),
            nodeCount: window.pathMap.nodes.size,
            linkCount: window.pathMap.links.size,
            selectedNode: window.pathMap.selectedNode,
            mode: window.pathMap.mode
        };
    },

    // 특정 노드로 이동
    goToNode: (nodeId) => {
        if (window.scvApp) {
            window.scvApp.centerToNode(nodeId);
        }
    },

    // 앱 재시작
    restart: async () => {
        if (window.scvApp) {
            await window.scvApp.restart();
        }
    },

    // API 헬스 체크
    healthCheck: async () => {
        try {
            const response = await fetch('/health');
            return await response.json();
        } catch (error) {
            return { error: error.message };
        }
    }
};

console.log('SCV Path Editor Web 로드됨');
console.log('디버그 명령어: window.debug');
console.log('키보드 단축키:');
console.log('  1-4: 모드 변경 (1=Select, 2=Drag, 3=Add, 4=QuickLink)');
console.log('  Q: QuickLink 모드');
console.log('  D: Drag 모드');
console.log('  A: Add Node 모드');
console.log('  Delete/Backspace: 선택된 노드 삭제');
console.log('  Ctrl+S: 저장');
console.log('  Ctrl+O: 열기');
console.log('  ESC: 취소/닫기');