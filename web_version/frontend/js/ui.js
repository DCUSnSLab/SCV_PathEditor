// UI management and table handling
class UIManager {
    constructor() {
        this.nodeTable = document.getElementById('nodeTable').getElementsByTagName('tbody')[0];
        this.linkTable = document.getElementById('linkTable').getElementsByTagName('tbody')[0];
        this.selectedNodeInfo = document.getElementById('selectedNodeInfo');
        
        // 파일 탐색기 초기화
        this.fileExplorer = new FileExplorer('fileTree');
        this.fileExplorer.setOnFileSelect((filepath) => {
            return this.loadPathData(filepath);
        });
        
        this.currentData = { Node: [], Link: [] };
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 모드 버튼들
        document.getElementById('selectModeBtn').addEventListener('click', () => {
            this.setMode('select');
        });

        document.getElementById('dragModeBtn').addEventListener('click', () => {
            this.setMode('drag');
        });

        document.getElementById('addNodeModeBtn').addEventListener('click', () => {
            this.setMode('addNode');
        });

        document.getElementById('quickLinkModeBtn').addEventListener('click', () => {
            this.setMode('quickLink');
        });

        // 파일 관련 버튼들
        document.getElementById('loadBtn').addEventListener('click', () => {
            this.loadFile();
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            this.showSaveModal();
        });

        document.getElementById('uploadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadFile();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.uploadFile(e.target.files[0]);
        });

        // 파일 선택은 이제 파일 탐색기에서 처리

        // 모달 관련
        this.setupModalEvents();
    }

    setupModalEvents() {
        // 노드 모달
        const nodeModal = document.getElementById('nodeModal');
        const saveNodeBtn = document.getElementById('saveNodeBtn');
        const cancelNodeBtn = document.getElementById('cancelNodeBtn');

        saveNodeBtn.addEventListener('click', () => {
            this.saveNewNode();
        });

        cancelNodeBtn.addEventListener('click', () => {
            this.hideModal('nodeModal');
        });

        // 저장 모달
        const saveModal = document.getElementById('saveModal');
        const confirmSaveBtn = document.getElementById('confirmSaveBtn');
        const cancelSaveBtn = document.getElementById('cancelSaveBtn');

        confirmSaveBtn.addEventListener('click', () => {
            this.confirmSave();
        });

        cancelSaveBtn.addEventListener('click', () => {
            this.hideModal('saveModal');
        });

        // 모달 배경 클릭 시 닫기
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // X 버튼 클릭 시 닫기
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    setMode(mode) {
        // 모든 모드 버튼 비활성화
        document.querySelectorAll('.btn-mode').forEach(btn => {
            btn.classList.remove('active');
        });

        // 선택된 모드 버튼 활성화
        const modeButtons = {
            'select': 'selectModeBtn',
            'drag': 'dragModeBtn',
            'addNode': 'addNodeModeBtn',
            'quickLink': 'quickLinkModeBtn'
        };

        if (modeButtons[mode]) {
            document.getElementById(modeButtons[mode]).classList.add('active');
        }

        // 지도에 모드 설정
        if (window.pathMap) {
            window.pathMap.setMode(mode);
        }

        // 모드별 메시지
        const messages = {
            'select': '노드 선택 모드',
            'drag': '노드 드래그 모드 - 노드를 드래그하여 위치를 변경할 수 있습니다',
            'addNode': '노드 추가 모드 - 지도를 클릭하여 새 노드를 추가하세요',
            'quickLink': 'QuickLink 모드 - 두 노드를 순서대로 클릭하여 링크를 생성하세요'
        };

        showNotification(messages[mode] || '모드 변경됨', 'info');
    }

    async loadFileList() {
        // 파일 탐색기에서 자동으로 처리
        if (this.fileExplorer) {
            await this.fileExplorer.loadFileTree();
        }
    }

    loadFile() {
        const selectedFile = this.fileExplorer.getSelectedFile();
        if (!selectedFile || selectedFile.type === 'folder') {
            showNotification('JSON 파일을 선택해주세요', 'warning');
            return;
        }
        this.loadPathData(selectedFile.fullPath);
    }

    async loadPathData(filename) {
        try {
            showLoading();
            const pathData = await pathAPI.loadPathData(filename);
            
            this.currentData = pathData;
            this.updateTables();
            this.updateMap();
            
            showNotification(`${filename} 파일이 로드되었습니다`, 'success');
            
        } catch (error) {
            handleAPIError(error, '파일 로드 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    showSaveModal() {
        const saveFilename = document.getElementById('saveFilename');
        saveFilename.value = 'new_path.json';
        this.showModal('saveModal');
    }

    async confirmSave() {
        const filename = document.getElementById('saveFilename').value.trim();
        if (!filename) {
            showNotification('파일명을 입력해주세요', 'warning');
            return;
        }

        if (!filename.endsWith('.json')) {
            showNotification('파일명은 .json 확장자로 끝나야 합니다', 'warning');
            return;
        }

        try {
            showLoading();
            await pathAPI.savePathData(filename, this.currentData);
            showNotification(`${filename}으로 저장되었습니다`, 'success');
            this.hideModal('saveModal');
            this.loadFileList(); // 파일 목록 새로고침
            
        } catch (error) {
            handleAPIError(error, '파일 저장 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    async uploadFile(file) {
        if (!file) return;

        try {
            showLoading();
            await pathAPI.uploadFile(file);
            showNotification(`${file.name}이 업로드되었습니다`, 'success');
            this.loadFileList(); // 파일 목록 새로고침
            
        } catch (error) {
            handleAPIError(error, '파일 업로드 중 오류가 발생했습니다');
        } finally {
            hideLoading();
            // 파일 입력 초기화
            document.getElementById('fileInput').value = '';
        }
    }

    async downloadFile() {
        const selectedFile = this.fileSelect.value;
        if (!selectedFile) {
            showNotification('다운로드할 파일을 선택해주세요', 'warning');
            return;
        }

        try {
            showLoading();
            const blob = await pathAPI.downloadFile(selectedFile);
            
            // 파일 다운로드
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedFile;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showNotification(`${selectedFile}이 다운로드되었습니다`, 'success');
            
        } catch (error) {
            handleAPIError(error, '파일 다운로드 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    updateTables() {
        this.updateNodeTable();
        this.updateLinkTable();
    }

    updateNodeTable() {
        // 테이블 초기화
        this.nodeTable.innerHTML = '';
        
        // 노드 데이터 추가
        this.currentData.Node.forEach(node => {
            const row = this.nodeTable.insertRow();
            
            row.innerHTML = `
                <td>${node.ID}</td>
                <td>${node.GpsInfo.Lat.toFixed(6)}</td>
                <td>${node.GpsInfo.Long.toFixed(6)}</td>
                <td>${node.GpsInfo.Alt.toFixed(2)}</td>
                <td>${node.UtmInfo.Easting.toFixed(2)}</td>
                <td>${node.UtmInfo.Northing.toFixed(2)}</td>
                <td>${node.UtmInfo.Zone}</td>
                <td>
                    <button class="btn btn-danger" onclick="uiManager.deleteNode('${node.ID}')">
                        삭제
                    </button>
                </td>
            `;
            
            // 행 클릭 시 노드 선택
            row.addEventListener('click', (e) => {
                if (!e.target.classList.contains('btn')) {
                    this.selectNodeFromTable(node.ID);
                }
            });
        });
    }

    updateLinkTable() {
        // 테이블 초기화
        this.linkTable.innerHTML = '';
        
        // 링크 데이터 추가
        this.currentData.Link.forEach(link => {
            const row = this.linkTable.insertRow();
            
            row.innerHTML = `
                <td>${link.ID}</td>
                <td>${link.FromNodeID}</td>
                <td>${link.ToNodeID}</td>
                <td>${link.Length.toFixed(3)}</td>
                <td>
                    <button class="btn btn-danger" onclick="uiManager.deleteLink('${link.ID}')">
                        삭제
                    </button>
                </td>
            `;
        });
    }

    updateMap() {
        if (!window.pathMap) return;

        // 지도 초기화
        window.pathMap.clearAll();

        // 노드 추가
        this.currentData.Node.forEach(node => {
            window.pathMap.addNode(node);
        });

        // 링크 추가
        this.currentData.Link.forEach(link => {
            window.pathMap.addLink(link);
        });

        // 데이터에 맞게 지도 조정
        if (this.currentData.Node.length > 0) {
            window.pathMap.fitToData();
        }
    }

    selectNodeFromTable(nodeId) {
        if (window.pathMap) {
            window.pathMap.selectNode(nodeId);
        }
    }

    updateSelectedNodeInfo(nodeId, nodeData) {
        if (!nodeData) {
            this.selectedNodeInfo.innerHTML = '<p>노드를 선택해주세요</p>';
            return;
        }

        this.selectedNodeInfo.innerHTML = `
            <div class="node-info-header">
                <h4>선택된 노드: ${nodeData.ID}</h4>
                <button id="deleteSelectedNode" class="btn btn-danger btn-small" title="선택된 노드 삭제">
                    🗑️ 삭제
                </button>
            </div>
            <div class="node-info-details">
                <p><strong>위도:</strong> ${nodeData.GpsInfo.Lat.toFixed(6)}</p>
                <p><strong>경도:</strong> ${nodeData.GpsInfo.Long.toFixed(6)}</p>
                <p><strong>고도:</strong> ${nodeData.GpsInfo.Alt.toFixed(2)}m</p>
                <p><strong>UTM E:</strong> ${nodeData.UtmInfo.Easting.toFixed(2)}</p>
                <p><strong>UTM N:</strong> ${nodeData.UtmInfo.Northing.toFixed(2)}</p>
                <p><strong>Zone:</strong> ${nodeData.UtmInfo.Zone}</p>
                <p><strong>Maker:</strong> ${nodeData.Maker}</p>
                <p><strong>Remark:</strong> ${nodeData.Remark}</p>
            </div>
        `;

        // 삭제 버튼 이벤트 리스너 추가
        const deleteBtn = document.getElementById('deleteSelectedNode');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteSelectedNode(nodeId);
            });
        }
    }

    showAddNodeModal(lat, lng) {
        // 모달에 좌표 설정
        document.getElementById('nodeLat').value = lat.toFixed(6);
        document.getElementById('nodeLon').value = lng.toFixed(6);
        document.getElementById('nodeAlt').value = '0';
        document.getElementById('nodeMaker').value = 'SCV Web Editor';
        document.getElementById('nodeRemark').value = '';
        
        this.showModal('nodeModal');
    }

    async saveNewNode() {
        const lat = parseFloat(document.getElementById('nodeLat').value);
        const lng = parseFloat(document.getElementById('nodeLon').value);
        const alt = parseFloat(document.getElementById('nodeAlt').value) || 0;
        const maker = document.getElementById('nodeMaker').value || 'SCV Web Editor';
        const remark = document.getElementById('nodeRemark').value || '';

        // UTM 좌표 계산 (간단한 근사치)
        const utmX = 302485.85 + (lng - 126.7732925755467) * 88740;
        const utmY = 4123756.89 + (lat - 37.239429897406026) * 111320;

        const nodeData = {
            AdminCode: "",
            NodeType: 1,
            ITSNodeID: "",
            Maker: maker,
            UpdateDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
            Version: "2021",
            Remark: remark,
            HistType: "02A",
            HistRemark: "Web Editor로 생성",
            GpsInfo: {
                Lat: lat,
                Long: lng,
                Alt: alt
            },
            UtmInfo: {
                Easting: utmX,
                Northing: utmY,
                Zone: "52N"
            }
        };

        try {
            showLoading();
            const newNode = await pathAPI.createNode(nodeData);
            
            // 현재 데이터에 추가
            this.currentData.Node.push(newNode);
            
            // UI 업데이트
            this.updateNodeTable();
            
            // 지도에 노드 추가
            if (window.pathMap) {
                window.pathMap.addNode(newNode);
            }
            
            this.hideModal('nodeModal');
            showNotification(`노드 ${newNode.ID}가 생성되었습니다`, 'success');
            
        } catch (error) {
            handleAPIError(error, '노드 생성 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    async deleteNode(nodeId) {
        if (!confirm(`노드 ${nodeId}를 삭제하시겠습니까?`)) {
            return;
        }

        try {
            showLoading();
            await pathAPI.deleteNode(nodeId);
            
            // 현재 데이터에서 제거
            this.currentData.Node = this.currentData.Node.filter(node => node.ID !== nodeId);
            this.currentData.Link = this.currentData.Link.filter(link => 
                link.FromNodeID !== nodeId && link.ToNodeID !== nodeId
            );
            
            // UI 업데이트
            this.updateTables();
            
            // 지도에서 제거
            if (window.pathMap) {
                window.pathMap.removeNode(nodeId);
                // 연결된 링크들도 제거
                this.currentData.Link.forEach(link => {
                    window.pathMap.removeLink(link.ID);
                });
                // 남은 링크들 다시 그리기
                this.currentData.Link.forEach(link => {
                    window.pathMap.addLink(link);
                });
            }
            
            showNotification(`노드 ${nodeId}가 삭제되었습니다`, 'success');
            
        } catch (error) {
            handleAPIError(error, '노드 삭제 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    async deleteLink(linkId) {
        if (!confirm(`링크 ${linkId}를 삭제하시겠습니까?`)) {
            return;
        }

        try {
            showLoading();
            await pathAPI.deleteLink(linkId);
            
            // 현재 데이터에서 제거
            this.currentData.Link = this.currentData.Link.filter(link => link.ID !== linkId);
            
            // UI 업데이트
            this.updateLinkTable();
            
            // 지도에서 제거
            if (window.pathMap) {
                window.pathMap.removeLink(linkId);
            }
            
            showNotification(`링크 ${linkId}가 삭제되었습니다`, 'success');
            
        } catch (error) {
            handleAPIError(error, '링크 삭제 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    async deleteSelectedNode(nodeId) {
        if (!confirm(`노드 ${nodeId}와 연결된 모든 링크를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            showLoading();
            
            // 1. 서버에서 노드 삭제 (연결된 링크도 자동 삭제됨)
            await pathAPI.deleteNode(nodeId);
            
            // 2. 현재 데이터에서 노드 제거
            this.currentData.Node = this.currentData.Node.filter(node => node.ID !== nodeId);
            
            // 3. 현재 데이터에서 연결된 링크들 제거
            const removedLinks = this.currentData.Link.filter(link => 
                link.FromNodeID === nodeId || link.ToNodeID === nodeId
            );
            this.currentData.Link = this.currentData.Link.filter(link => 
                link.FromNodeID !== nodeId && link.ToNodeID !== nodeId
            );
            
            // 4. UI 업데이트
            this.updateTables();
            
            // 5. 지도에서 노드 및 연결된 링크 제거
            if (window.pathMap) {
                // 노드 제거
                window.pathMap.removeNode(nodeId);
                
                // 연결된 링크들 제거
                removedLinks.forEach(link => {
                    window.pathMap.removeLink(link.ID);
                });
            }
            
            // 6. 선택된 노드 정보 초기화
            this.updateSelectedNodeInfo(null, null);
            
            const linkCount = removedLinks.length;
            showNotification(
                `노드 ${nodeId}와 연결된 링크 ${linkCount}개가 삭제되었습니다.`, 
                'success'
            );
            
        } catch (error) {
            handleAPIError(error, '노드 삭제 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    onLinkCreated(linkData) {
        // 새로 생성된 링크를 현재 데이터에 추가
        this.currentData.Link.push(linkData);
        this.updateLinkTable();
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }
}