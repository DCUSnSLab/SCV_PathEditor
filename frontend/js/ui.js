// UI management and table handling
class UIManager {
    constructor() {
        this.nodeTable = document.getElementById('nodeTable').getElementsByTagName('tbody')[0];
        this.linkTable = document.getElementById('linkTable').getElementsByTagName('tbody')[0];
        this.selectedNodeInfo = document.getElementById('selectedNodeInfo');
        this.currentMode = null;
        
        // 파일 탐색기 초기화
        this.fileExplorer = new FileExplorer('fileTree');
        this.fileExplorer.setOnFileSelect((filepath) => {
            return this.loadPathData(filepath);
        });
        
        this.currentData = { Node: [], Link: [] };
        this.currentFilename = null; // 현재 로드된 파일명 저장

        // ★ 현재 모달이 '수정'으로 열렸는지 구분하기 위한 플래그/ID
        this.editingNodeId = null;

        // 클립보드 상태 관리
        this.clipboardStatus = { has_content: false, paste_enabled: false };

        this.setupEventListeners();
        this.initializeClipboardStatus();
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

        document.getElementById('linkTwoNodesModeBtn').addEventListener('click', () => {
            this.setMode('quickLink');
        });

        document.getElementById('intervalCreateModeBtn').addEventListener('click', () => {
            this.setMode('intervalCreate');
        });

        document.getElementById('deleteModeBtn').addEventListener('click', () => {
            this.setMode('delete');
        });

        // 파일 관련 버튼들
        document.getElementById('loadBtn').addEventListener('click', () => {
            this.loadFile();
        });

        document.getElementById('importBtn').addEventListener('click', () => {
            this.importFile();
        })

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

        document.getElementById('editBtn').addEventListener('click', () => {
            this.openEditNodeModal();
        });

        document.getElementById('batchEditBtn').addEventListener('click', () => {
            this.openBatchEditModal();
        });

        // 잘라내기/붙여넣기 버튼들
        document.getElementById('cutNodesBtn').addEventListener('click', () => {
            this.cutSelectedNodes();
        });

        document.getElementById('pasteNodesBtn').addEventListener('click', () => {
            this.pasteNodes();
        });

        document.getElementById('clearClipboardBtn').addEventListener('click', () => {
            this.clearClipboard();
        });

        // 지도 옵션
        document.getElementById('toggleNodeIds').addEventListener('change', (e) => {
            if (window.pathMap) {
                window.pathMap.toggleNodeLabels(e.target.checked);
            }
        });

        document.getElementById('mapStyleSelect').addEventListener('change', (e) => {
            if (window.pathMap) {
                window.pathMap.setMapStyle(e.target.value);
            }
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
        // setupModalEvents() 내 하단 등 편한 곳에 추가
        const batchModal = document.getElementById('batchEditModal');
        const applyBatchBtn = document.getElementById('applyBatchBtn');
        const cancelBatchBtn = document.getElementById('cancelBatchBtn');

        applyBatchBtn.addEventListener('click', () => this.applyBatchEdits());
        cancelBatchBtn.addEventListener('click', () => this.hideModal('batchEditModal'));
    }

    setMode(mode) {
        // 모드 → 버튼 ID 매핑
        const modeButtons = {
            'select': 'selectModeBtn',
            'drag': 'dragModeBtn',
            'addNode': 'addNodeModeBtn',
            'quickLink': 'linkTwoNodesModeBtn',
            'intervalCreate': 'intervalCreateModeBtn',
            'delete': 'deleteModeBtn'
        };

        // 같은 모드를 다시 클릭하면 해제
        const isSameMode = this.currentMode === mode;

        // 모든 모드 버튼 비활성화
        document.querySelectorAll('.btn-mode').forEach(btn => btn.classList.remove('active'));

        if (isSameMode) {
            this.currentMode = null;
            if (window.pathMap) window.pathMap.setMode(null);
            showNotification('모드가 해제되었습니다', 'info');
            return;
        }

        if (modeButtons[mode]) {
            document.getElementById(modeButtons[mode]).classList.add('active');
            this.currentMode = mode;
        }

        // 지도에 모드 설정
        if (window.pathMap) {
            window.pathMap.setMode(mode);
        }

        // 모드별 메시지
        const messages = {
            'select': '복수 선택 모드 - 지도에서 클릭한 노드들이 선택/해제됩니다',
            'drag': '노드 드래그 모드 - 노드를 드래그하여 위치를 변경할 수 있습니다',
            'addNode': '노드 추가 모드 - 지도를 클릭하여 새 노드를 추가하세요',
            'quickLink': '두 노드 잇기 모드(Quick Link) - 두 노드를 순서대로 클릭하여 링크를 생성하세요',
            'intervalCreate': '구간 노드 생성 모드 - 시작점을 클릭하세요',
            'delete': '삭제 모드 - 삭제할 노드를 클릭하세요'
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
            this.currentData.Node = this.normalizeAllNodes(this.currentData.Node);
            this.currentFilename = filename; // 로드된 파일명 저장
            this.updateTables();
            this.updateMap();

            showNotification(`${filename} 파일이 로드되었습니다`, 'success');
            
        } catch (error) {
            handleAPIError(error, '파일 로드 중 오류가 발생했습니다');
        } finally {
            hideLoading();
        }
    }

    importFile() {
        const selectedFile = this.fileExplorer.getSelectedFile();
        if (!selectedFile || selectedFile.type === 'folder') {
            showNotification('JSON 파일을 선택해주세요', 'warning');
            return;
        }
        this.importPathData(selectedFile.fullPath);
    }

    async importPathData(filename) {
  try {
    showLoading();
    const pathData = await pathAPI.loadPathData(filename);

    // 핵심: 단순 push 대신 매핑 병합
    this.mergePathData(pathData);

    this.updateTables();
    this.updateMap();

    showNotification(`${filename} 파일의 Path를 가져왔습니다`, 'success');
  } catch (error) {
    handleAPIError(error, '파일 가져오기 중 오류가 발생했습니다');
  } finally {
    hideLoading();
  }
}

    showSaveModal() {
        const saveFilename = document.getElementById('saveFilename');

        // 현재 로드된 파일명이 있으면 사용, 없으면 기본 파일명 생성
        if (this.currentFilename) {
            // 경로에서 파일명만 추출
            const filename = this.currentFilename.split('/').pop();
            saveFilename.value = filename;
        } else {
            // 현재 시간을 기반으로 기본 파일명 생성
            const now = new Date();
            const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
            saveFilename.value = `path_${timestamp}.json`;
        }

        this.showModal('saveModal');
    }

    async confirmSave() {
        const filename = document.getElementById('saveFilename').value.trim();

        // 상세한 파일명 검증
        if (!filename) {
            showNotification('파일명을 입력해주세요', 'warning');
            return;
        }

        // 파일명 길이 검증
        if (filename.length > 255) {
            showNotification('파일명이 너무 깁니다 (최대 255자)', 'warning');
            return;
        }

        // 특수문자 검증
        const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
        if (invalidChars.test(filename)) {
            showNotification('파일명에 사용할 수 없는 문자가 포함되어 있습니다', 'warning');
            return;
        }

        if (!filename.toLowerCase().endsWith('.json')) {
            showNotification('파일명은 .json 확장자로 끝나야 합니다', 'warning');
            return;
        }

        // 데이터 유효성 검증
        if (!this.currentData || !this.currentData.Node || !this.currentData.Link) {
            showNotification('저장할 데이터가 없습니다', 'warning');
            return;
        }

        // 바로 저장 진행 (UTM 검증 제거)
        await this.proceedWithSave(filename);
    }

    async proceedWithSave(filename) {
        try {
            // 중복 파일 확인 (선택적)
            const files = await pathAPI.listFiles();
            if (files.includes(filename)) {
                if (!confirm(`${filename} 파일이 이미 존재합니다. 덮어쓰시겠습니까?`)) {
                    return;
                }
            }

        try {
            showLoading('GPS 기준으로 UTM 좌표를 재계산하고 저장중입니다...');
            showNotification('GPS 기준으로 UTM 좌표를 재계산하고 저장중입니다...', 'info');

            // 데이터 크기 확인
            const dataSize = JSON.stringify(this.currentData).length;
            const sizeText = dataSize > 1024 * 1024
                ? `${(dataSize / (1024 * 1024)).toFixed(2)}MB`
                : `${(dataSize / 1024).toFixed(2)}KB`;

            if (dataSize > 10 * 1024 * 1024) { // 10MB 경고
                if (!confirm(`파일 크기가 큽니다 (${sizeText}). 계속하시겠습니까?`)) {
                    return;
                }
            }

            // savePathData 내부에서 UTM 재계산이 이루어짐
            await pathAPI.savePathData(filename, this.currentData);

            // 저장 완료 메시지
            let successMsg = `${filename} (${sizeText}) 저장이 완료되었습니다`;
            successMsg += `\n📊 노드: ${this.currentData.Node.length}개, 링크: ${this.currentData.Link.length}개`;
            successMsg += `\n🔄 모든 UTM 좌표가 GPS 기준으로 재계산되었습니다 (UTM Zone 자동 산출)`;

            showNotification(successMsg, 'success');
            this.hideModal('saveModal');

            // 로컬 데이터도 UTM 재계산 적용 (UI 업데이트)
            this.updateTables();
            this.updateMap();

            // 파일 목록 새로고침
            await this.loadFileList();

        } catch (error) {
            console.error('Save error:', error);

            // 구체적인 오류 메시지
            let errorMsg = '파일 저장 중 오류가 발생했습니다';
            if (error.message) {
                if (error.message.includes('403') || error.message.includes('권한')) {
                    errorMsg = '파일 저장 권한이 없습니다';
                } else if (error.message.includes('용량') || error.message.includes('space')) {
                    errorMsg = '저장 공간이 부족합니다';
                } else if (error.message.includes('JSON')) {
                    errorMsg = '데이터 형식 오류로 저장할 수 없습니다';
                } else {
                    errorMsg = `저장 실패: ${error.message}`;
                }
            }

            showNotification(errorMsg, 'error');
            throw error; // 에러를 다시 던져서 상위에서 처리할 수 있도록
        } finally {
            hideLoading();
        }
        } catch (outerError) {
            console.error('proceedWithSave outer error:', outerError);
            showNotification(`저장 처리 중 오류: ${outerError.message}`, 'error');
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
        const selectedFile = this.fileExplorer.getSelectedFile();
        if (!selectedFile || selectedFile.type === 'folder') {
            showNotification('다운로드할 파일을 선택해주세요', 'warning');
            return;
        }

        // 전체 경로 사용 (하위 폴더 파일 지원)
        const filepath = selectedFile.fullPath;
        const filename = selectedFile.name;

        // 파일 크기 예상 확인 (선택적)
        if (selectedFile.size && selectedFile.size.includes('MB')) {
            const sizeNum = parseFloat(selectedFile.size);
            if (sizeNum > 50) {
                if (!confirm('파일이 큽니다. 다운로드하시겠습니까?')) {
                    return;
                }
            }
        }

        try {
            showLoading();

            // 다운로드 시작 알림
            showNotification('파일 다운로드를 시작합니다...', 'info');

            const blob = await pathAPI.downloadFile(filepath);

            // 파일 다운로드 실행
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';

            document.body.appendChild(a);
            a.click();

            // 정리
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);

            // 파일 크기 표시
            const sizeText = blob.size > 1024 * 1024
                ? `${(blob.size / (1024 * 1024)).toFixed(2)}MB`
                : `${(blob.size / 1024).toFixed(2)}KB`;

            showNotification(`${filename} (${sizeText}) 다운로드가 완료되었습니다`, 'success');

        } catch (error) {
            console.error('Download error:', error);

            // 구체적인 오류 메시지 제공
            let errorMsg = '파일 다운로드 중 오류가 발생했습니다';
            if (error.message) {
                if (error.message.includes('404')) {
                    errorMsg = '파일을 찾을 수 없습니다';
                } else if (error.message.includes('403')) {
                    errorMsg = '파일 접근 권한이 없습니다';
                } else if (error.message.includes('큽니다')) {
                    errorMsg = error.message;
                } else if (error.message.includes('네트워크')) {
                    errorMsg = error.message;
                } else {
                    errorMsg = `다운로드 실패: ${error.message}`;
                }
            }

            showNotification(errorMsg, 'error');
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

        // 밀집 노드 샘플링 적용 (마커/라벨 가시성)
        window.pathMap.applyNodeSampling();

        // 지도 재구성으로 선택이 무효화되었으므로 선택 정보/버튼 상태를 동기화
        this.updateSelectedNodeInfo(null, null);
        this.updateSelectedNodeButtons();
    }

    selectNodeFromTable(nodeId) {
        if (window.pathMap) {
            window.pathMap.selectNode(nodeId);
        }
    }

    updateSelectedNodeInfo(nodeId, nodeData) {
        const multiCount = window.pathMap?.getSelectedNodeIds().length || 0;
        if (multiCount >= 2) {
            this.selectedNodeInfo.innerHTML = '<p>&lt;노드가 여러 개 선택됨&gt;</p>';
            return;
        }
        if (!nodeData) {
            this.selectedNodeInfo.innerHTML = '<p>노드를 선택해주세요</p>';
            return;
        }

        this.selectedNodeInfo.innerHTML = `
            <p><strong>ID:</strong> ${nodeData.ID}</p>
            <p><strong>NodeType:</strong> ${nodeData.NodeType}</p>
            <p><strong>Heading:</strong> ${this.formatHeading(nodeData)}</p>
            <p><strong>위도:</strong> ${nodeData.GpsInfo.Lat.toFixed(6)}</p>
            <p><strong>경도:</strong> ${nodeData.GpsInfo.Long.toFixed(6)}</p>
            <p><strong>고도:</strong> ${nodeData.GpsInfo.Alt.toFixed(2)}m</p>
            <p><strong>UTM E:</strong> ${nodeData.UtmInfo.Easting.toFixed(2)}</p>
            <p><strong>UTM N:</strong> ${nodeData.UtmInfo.Northing.toFixed(2)}</p>
            <p><strong>Zone:</strong> ${nodeData.UtmInfo.Zone}</p>
            <p><strong>Maker:</strong> ${nodeData.Maker}</p>
            <p><strong>Remark:</strong> ${nodeData.Remark}</p>
        `;
    }

    showAddNodeModal(lat, lng) {
        // 모달에 좌표 설정
        document.getElementById('nodeLat').value = lat.toFixed(6);
        document.getElementById('nodeLon').value = lng.toFixed(6);
        document.getElementById('nodeAlt').value = '0';
        document.getElementById('nodeMaker').value = 'SCV Web Editor';
        document.getElementById('nodeRemark').value = '';
        document.getElementById('nodeType').value = '1';
        document.getElementById('nodeHeading').value = '-1.0';
        
        this.showModal('nodeModal');
    }

    async saveNewNode() {
        const lat = parseFloat(document.getElementById('nodeLat').value);
        const lng = parseFloat(document.getElementById('nodeLon').value);
        const alt = parseFloat(document.getElementById('nodeAlt').value) || 0;
        const maker = document.getElementById('nodeMaker').value || 'SCV Web Editor';
        const remark = document.getElementById('nodeRemark').value || '';

        // NodeType
        const nodeTypeInput = document.getElementById('nodeType').value;
        let nodeType = parseInt(nodeTypeInput, 10);
        if (Number.isNaN(nodeType)) nodeType = 1;

        // Heading
        let heading = parseFloat(document.getElementById('nodeHeading').value);
        if (Number.isNaN(heading)) heading = -1.0;
        // 필요하면 0~360 정규화:
        // heading = ((heading % 360) + 360) % 360;

        // --------- ★ 수정 분기 ----------
        if (this.editingNodeId) {
            const nodeId = this.editingNodeId;

            const updatedLocal = {
                NodeType: nodeType,
                Maker: maker,
                Remark: remark,
                Heading: heading,
                GpsInfo: { Lat: lat, Long: lng, Alt: alt } // lat/lng 입력이 readOnly라면 기존 값 그대로 들어옴
            };

            try {
                showLoading();

                // (옵션) 서버에 수정 API가 있으면 호출 — 없으면 로컬만 반영
                let updatedFromServer = null;
                if (typeof pathAPI.updateNode === 'function') {
                    updatedFromServer = await pathAPI.updateNode(nodeId, updatedLocal);
                } else if (typeof pathAPI.updateNodeAttributes === 'function') {
                    updatedFromServer = await pathAPI.updateNodeAttributes(nodeId, updatedLocal);
                }

                // 로컬 데이터 갱신
                const idx = this.currentData.Node.findIndex(n => n.ID === nodeId);
                if (idx !== -1) {
                    const prev = this.currentData.Node[idx];
                    const merged = this.normalizeNode({
                        ...prev,
                        ...updatedLocal,
                        UtmInfo: prev.UtmInfo,
                        ID: nodeId
                    });
                    this.currentData.Node[idx] = merged;

                    // 지도/패널 갱신
                    if (window.pathMap && window.pathMap.nodes.has(nodeId)) {
                        window.pathMap.nodes.get(nodeId).data = merged;
                        window.pathMap.updateHeadingForNode(nodeId); // 헤딩 화살표 즉시 반영
                        window.pathMap.refreshNodeAppearance(nodeId); // NodeType 색/선택 비주얼 갱신
                    }
                    this.updateNodeTable();
                    this.updateSelectedNodeInfo(nodeId, merged);
                }

                this.hideModal('nodeModal');
                this.editingNodeId = null; // 편집 종료
                showNotification(`노드 ${nodeId}가 수정되었습니다`, 'success');
            } catch (error) {
                handleAPIError(error, '노드 수정 중 오류가 발생했습니다');
            } finally {
                hideLoading();
            }
            return; // ★ 생성 분기로 내려가지 않도록 종료
        }
        // --------- 수정 분기 끝 ----------
        // ⬇ 새 노드 생성 분기 - 정확한 UTM 좌표 변환 사용
        try {
            showLoading();

            // 백엔드 API를 통해 정확한 UTM 좌표 변환
            const utmData = await pathAPI.latLngToUtm(lat, lng);

            const nodeData = {
                AdminCode: "",
                NodeType: nodeType,
                ITSNodeID: "",
                Maker: maker,
                UpdateDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                Version: "2021",
                Remark: remark,
                HistType: "02A",
                HistRemark: "Web Editor로 생성",
                Heading: heading,
                GpsInfo: { Lat: lat, Long: lng, Alt: alt },
                UtmInfo: {
                    Easting: utmData.easting,
                    Northing: utmData.northing,
                    Zone: `${utmData.zone_number}${utmData.zone_letter}`
                }
            };

            const newNode = await pathAPI.createNode(nodeData);
            if (newNode.Heading === undefined) newNode.Heading = nodeData.Heading;

            this.currentData.Node.push(this.normalizeNode(newNode));
            this.updateNodeTable();

            if (window.pathMap) {
                window.pathMap.addNode(newNode); // addNode 안에서 heading 화살표 생성됨
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

    // "N0001" -> 1
    parseNodeIdx(nid) {
        const m = String(nid).match(/N(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    // 4 -> "N0004"
    formatNodeId(n) {
        return `N${String(n).padStart(4, '0')}`;
    }

    // "L0007" -> 7 (링크 ID가 중복될 때 새 번호 부여용)
    parseLinkIdx(lid) {
        const m = String(lid).match(/L(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    /**
 * 현재 this.currentData 뒤에 pathData를 합치면서
 * - 새로 들어온 노드 ID를 연속 번호로 재부여
 * - 링크의 FromNodeID/ToNodeID를 새 노드 ID로 치환
 * - 링크 ID가 중복되면 L000X 형태로 새로 부여
 */
    mergePathData(pathData) {
    // 1) file1(=currentData)의 최대 노드 번호
    const maxIdx = this.currentData.Node.reduce(
        (m, n) => Math.max(m, this.parseNodeIdx(n.ID)),
        0
    );

    // 2) 들어온 노드의 oldID -> newID 매핑
    const idMap = {};
    pathData.Node.forEach((n, i) => {
        idMap[n.ID] = this.formatNodeId(maxIdx + 1 + i);
    });

    // 3) 노드 복제(새 ID 적용)
    const mappedNodes = pathData.Node.map(n => ({ ...n, ID: idMap[n.ID] }));

    // 4) 링크 ID 중복 방지 세팅
    const existingLinkIds = new Set(this.currentData.Link.map(l => l.ID));
    let linkMax = Math.max(
        0,
        ...Array.from(existingLinkIds).map(id => this.parseLinkIdx(id))
    );

    // 5) 링크 복제(끝점/ID 치환)
    const mappedLinks = pathData.Link.map(l => {
        let newLinkId = l.ID;
        if (!newLinkId || existingLinkIds.has(newLinkId)) {
        linkMax += 1;
        newLinkId = `L${String(linkMax).padStart(4, '0')}`;
        }
        existingLinkIds.add(newLinkId);

        return {
        ...l,
        ID: newLinkId,
        FromNodeID: idMap[l.FromNodeID] ?? l.FromNodeID,
        ToNodeID: idMap[l.ToNodeID] ?? l.ToNodeID,
        };
    });

    // 6) 현재 데이터에 합치기
    this.currentData.Node.push(...mappedNodes);
    this.currentData.Link.push(...mappedLinks);
    this.currentData.Node = this.normalizeAllNodes(this.currentData.Node);
    }

    normalizeNode(node) {
        // backend가 heading 소문자로 줄 수도 있으니 흡수
        if (node.Heading === undefined) {
            if (typeof node.heading === 'number') node.Heading = node.heading;
            else node.Heading = -1.0; // 기본값
        }
        return node;
    }

    normalizeAllNodes(nodes) {
        return nodes.map(n => this.normalizeNode(n));
    }

    formatHeading(node) {
        const h = (node.Heading ?? node.heading ?? 0);
        return (typeof h === 'number') ? h.toFixed(1) : String(h);
    }

// UIManager 메서드로 추가
    openEditNodeModal() {
        const ids = window.pathMap.getSelectedNodeIds?.() || [];
        if (ids.length !== 1) {
            showNotification('하나의 노드를 선택하세요.', 'warning');
            return;
        }
        const id = ids[0];
        const node = this.currentData.Node.find(n => n.ID === id);
        if (!node) {
            showNotification('선택된 노드를 찾을 수 없습니다.', 'error');
            return;
        }

        this.editingNodeId = id; // 저장 시 '수정' 분기
        // 모달 제목 변경
        document.querySelector('#nodeModal .modal-header h3').textContent = `노드 수정 (${id})`;

        // 값 채우기 (lat/lon은 readonly)
        document.getElementById('nodeLat').value = node.GpsInfo.Lat;
        document.getElementById('nodeLon').value = node.GpsInfo.Long;
        document.getElementById('nodeAlt').value = node.GpsInfo.Alt ?? 0;
        document.getElementById('nodeMaker').value = node.Maker ?? '';
        document.getElementById('nodeRemark').value = node.Remark ?? '';
        document.getElementById('nodeType').value = node.NodeType ?? 1;
        document.getElementById('nodeHeading').value = (node.Heading ?? -1.0);

        this.showModal('nodeModal'); // 이미 있는 모달 열기
    }


    openBatchEditModal() {
        const ids = window.pathMap?.getSelectedNodeIds() || [];
        if (ids.length < 2) {
            showNotification('복수 선택 모드에서 2개 이상 노드를 선택하세요.', 'warning');
            return;
        }
        // 입력칸 초기화
        document.getElementById('batchAlt').value = '';
        document.getElementById('batchMaker').value = '';
        document.getElementById('batchNodeType').value = '';
        document.getElementById('batchHeading').value = '';
        this.showModal('batchEditModal');
    }

    applyBatchEdits() {
        const ids = window.pathMap?.getSelectedNodeIds() || [];
        if (ids.length < 2) {
            showNotification('선택된 노드가 2개 이상이어야 합니다.', 'warning');
            return;
        }

        // 입력값 파싱 (빈 칸은 변경하지 않음)
        const altStr = document.getElementById('batchAlt').value.trim();
        const makerStr = document.getElementById('batchMaker').value.trim();
        const nodeTypeStr = document.getElementById('batchNodeType').value.trim();
        const headingStr = document.getElementById('batchHeading').value.trim();

        const useAlt = altStr !== '' && !Number.isNaN(parseFloat(altStr));
        const useMaker = makerStr !== '';
        const useNodeType = nodeTypeStr !== '' && !Number.isNaN(parseInt(nodeTypeStr, 10));
        const useHeading = headingStr !== '' && !Number.isNaN(parseFloat(headingStr));

        if (!useAlt && !useMaker && !useNodeType && !useHeading) {
            showNotification('변경할 값을 입력하세요.', 'warning');
            return;
        }

        // 로컬 데이터 덮어쓰기
        ids.forEach((id) => {
            const idx = this.currentData.Node.findIndex(n => n.ID === id);
            if (idx === -1) return;
            const prev = this.currentData.Node[idx];
            const next = { ...prev };

            if (useAlt)    next.GpsInfo = { ...next.GpsInfo, Alt: parseFloat(altStr) };
            if (useMaker)  next.Maker = makerStr;
            if (useNodeType) next.NodeType = parseInt(nodeTypeStr, 10);
            if (useHeading)  next.Heading = parseFloat(headingStr);

            this.currentData.Node[idx] = this.normalizeNode(next);
            // 지도 쪽 데이터도 반영
            if (window.pathMap?.nodes.has(id)) {
                window.pathMap.nodes.get(id).data = this.currentData.Node[idx];
                window.pathMap.updateHeadingForNode(id);
                window.pathMap.refreshNodeAppearance(id);
            }
        });

        this.updateNodeTable();
        // 다중 선택 중엔 상세를 “여러 개 선택됨”으로 유지
        this.updateSelectedNodeInfo(null, null);

        this.hideModal('batchEditModal');
        showNotification(`${ids.length}개 노드를 일괄 수정했습니다.`, 'success');

        // (옵션) 서버에도 저장하고 싶다면 저장 버튼으로 파일 저장을 호출하거나,
        // 서버에 속성 업데이트용 API가 추가되면 여기서 호출하세요. 현재 제공 API는 위치 업데이트만 있음. :contentReference[oaicite:13]{index=13}
    }

    // 클립보드 상태 초기화
    async initializeClipboardStatus() {
        try {
            this.updateLocalClipboardStatus();
            this.updateSelectedNodeButtons();
        } catch (error) {
            console.error('클립보드 상태 초기화 실패:', error);
        }
    }

    // 선택된 노드에 따른 버튼 상태 업데이트
    updateSelectedNodeButtons() {
        const selectedNodes = window.pathMap?.getSelectedNodeIds() || [];
        const cutBtn = document.getElementById('cutNodesBtn');

        if (selectedNodes.length > 0) {
            cutBtn.disabled = false;
            cutBtn.textContent = `✂️ 잘라내기 (${selectedNodes.length}개)`;
        } else {
            cutBtn.disabled = true;
            cutBtn.textContent = '✂️ 잘라내기';
        }
    }

    // 클립보드 UI 업데이트
    updateClipboardUI() {
        const pasteBtn = document.getElementById('pasteNodesBtn');
        const clearBtn = document.getElementById('clearClipboardBtn');
        const statusDiv = document.getElementById('clipboardStatus');

        // 붙여넣기 버튼
        pasteBtn.disabled = !this.clipboardStatus.paste_enabled;
        pasteBtn.textContent = this.clipboardStatus.button_text || '📍 붙여넣기';

        // 클립보드 비우기 버튼
        clearBtn.disabled = !this.clipboardStatus.has_content;

        // 상태 표시
        statusDiv.textContent = this.clipboardStatus.message || '📭 클립보드가 비어있습니다';

        // 클립보드 상태에 따른 CSS 클래스 변경
        if (this.clipboardStatus.has_content) {
            statusDiv.classList.add('has-content');
        } else {
            statusDiv.classList.remove('has-content');
        }
    }

    // 선택된 노드들 잘라내기
    async cutSelectedNodes() {
        const selectedNodes = window.pathMap?.getSelectedNodeIds() || [];

        if (selectedNodes.length === 0) {
            showNotification('잘라낼 노드를 선택해주세요', 'warning');
            return;
        }

        // 선택된 노드들이 실제로 존재하는지 확인
        const existingNodes = selectedNodes.filter(nodeId =>
            this.currentData.Node.some(node => node.ID === nodeId)
        );

        if (existingNodes.length === 0) {
            showNotification('선택된 노드가 현재 데이터에 없습니다', 'error');
            return;
        }

        if (existingNodes.length !== selectedNodes.length) {
            showNotification(`일부 노드가 현재 데이터에 없습니다. ${existingNodes.length}개 노드만 잘라냅니다.`, 'warning');
        }

        try {
            showLoading('노드를 잘라내는 중...');

            // 잘라낼 노드들과 관련된 링크들 찾기
            const cutNodes = this.currentData.Node.filter(node =>
                existingNodes.includes(node.ID)
            );
            const cutLinks = this.currentData.Link.filter(link =>
                existingNodes.includes(link.FromNodeID) || existingNodes.includes(link.ToNodeID)
            );

            // 클립보드에 저장 (로컬 스토리지 활용)
            const clipboardData = {
                nodes: cutNodes,
                links: cutLinks,
                timestamp: Date.now()
            };
            localStorage.setItem('pathEditor_clipboard', JSON.stringify(clipboardData));

            // 현재 데이터에서 제거
            this.currentData.Node = this.currentData.Node.filter(node =>
                !existingNodes.includes(node.ID)
            );
            this.currentData.Link = this.currentData.Link.filter(link =>
                !existingNodes.includes(link.FromNodeID) && !existingNodes.includes(link.ToNodeID)
            );

            // UI 업데이트
            this.updateTables();
            this.updateMap();

            // 선택 해제
            if (window.pathMap) {
                window.pathMap.clearSelections();
            }

            // 클립보드 상태 업데이트 (로컬)
            this.clipboardStatus = {
                has_content: true,
                paste_enabled: true,
                button_text: `📍 붙여넣기 (${cutNodes.length}개 노드)`,
                message: `🗂️ 클립보드에 ${cutNodes.length}개 노드, ${cutLinks.length}개 링크가 저장되어 있습니다`,
                node_count: cutNodes.length,
                link_count: cutLinks.length
            };
            this.updateClipboardUI();
            this.updateSelectedNodeButtons();

            showNotification(`✂️ ${cutNodes.length}개 노드와 ${cutLinks.length}개 링크를 잘라냈습니다.\n🗂️ 클립보드에 저장되었습니다. 붙여넣기 버튼을 눌러 원하는 위치에 배치하세요.`, 'success');

        } catch (error) {
            console.error('잘라내기 처리 중 오류:', error);
            showNotification('잘라내기 중 오류가 발생했습니다', 'error');
        } finally {
            hideLoading();
        }
    }

    // 노드들 붙여넣기
    async pasteNodes() {
        // 로컬 스토리지에서 클립보드 데이터 확인
        const clipboardDataStr = localStorage.getItem('pathEditor_clipboard');
        if (!clipboardDataStr) {
            showNotification('클립보드가 비어있습니다', 'warning');
            return;
        }

        let clipboardData;
        try {
            clipboardData = JSON.parse(clipboardDataStr);
        } catch (error) {
            showNotification('클립보드 데이터가 손상되었습니다', 'error');
            localStorage.removeItem('pathEditor_clipboard');
            this.updateLocalClipboardStatus();
            return;
        }

        if (!clipboardData.nodes || clipboardData.nodes.length === 0) {
            showNotification('클립보드에 붙여넣을 노드가 없습니다', 'warning');
            return;
        }

        // 지도 중심 좌표 가져오기
        const mapCenter = window.pathMap?.getMapCenter();
        if (!mapCenter) {
            showNotification('지도 중심 좌표를 가져올 수 없습니다', 'error');
            return;
        }

        try {
            showLoading('노드를 붙여넣는 중...');

            // 원본 노드들의 중심점 계산
            const originalNodes = clipboardData.nodes;
            const originalCenterLat = originalNodes.reduce((sum, node) => sum + node.GpsInfo.Lat, 0) / originalNodes.length;
            const originalCenterLon = originalNodes.reduce((sum, node) => sum + node.GpsInfo.Long, 0) / originalNodes.length;

            // 이동 오프셋 계산
            const latOffset = mapCenter.lat - originalCenterLat;
            const lonOffset = mapCenter.lng - originalCenterLon;

            // 새로운 노드 ID 매핑 생성
            const nodeIdMapping = {};
            const pastedNodes = [];

            // 노드들 복사 및 새 ID 생성
            for (const originalNode of originalNodes) {
                // 같은 배치에서 이미 부여한 ID들도 고려하여 중복 방지
                const newNodeId = this._generateNewNodeId(Object.values(nodeIdMapping));
                nodeIdMapping[originalNode.ID] = newNodeId;

                // 새 위치 계산
                const newLat = originalNode.GpsInfo.Lat + latOffset;
                const newLon = originalNode.GpsInfo.Long + lonOffset;

                // UTM 좌표 변환
                let newUtmInfo;
                try {
                    const utmData = await pathAPI.latLngToUtm(newLat, newLon);
                    newUtmInfo = {
                        Easting: Math.round(utmData.easting * 100) / 100,
                        Northing: Math.round(utmData.northing * 100) / 100,
                        Zone: `${utmData.zone_number}${utmData.zone_letter}`
                    };
                } catch (error) {
                    console.warn('UTM 변환 실패, 기본값 사용:', error);
                    newUtmInfo = { ...originalNode.UtmInfo };
                }

                // 새 노드 생성
                const newNode = {
                    ...originalNode,
                    ID: newNodeId,
                    GpsInfo: {
                        Lat: newLat,
                        Long: newLon,
                        Alt: originalNode.GpsInfo.Alt
                    },
                    UtmInfo: newUtmInfo,
                    UpdateDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                    HistRemark: "붙여넣기로 생성"
                };

                pastedNodes.push(newNode);
            }

            // 링크들 복사 (양쪽 노드가 모두 붙여넣은 노드인 경우만)
            const pastedLinks = [];
            for (const originalLink of clipboardData.links) {
                if (nodeIdMapping[originalLink.FromNodeID] && nodeIdMapping[originalLink.ToNodeID]) {
                    const newFromId = nodeIdMapping[originalLink.FromNodeID];
                    const newToId = nodeIdMapping[originalLink.ToNodeID];
                    const newLinkId = this._generateNewLinkId(newFromId, newToId, pastedLinks.map(l => l.ID));

                    // 새 링크 길이 계산
                    const newLength = this._calculateLinkLength(
                        pastedNodes.find(n => n.ID === newFromId),
                        pastedNodes.find(n => n.ID === newToId)
                    );

                    const newLink = {
                        ...originalLink,
                        ID: newLinkId,
                        FromNodeID: newFromId,
                        ToNodeID: newToId,
                        Length: newLength,
                        UpdateDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                        HistRemark: "붙여넣기로 생성"
                    };

                    pastedLinks.push(newLink);
                }
            }

            // 현재 데이터에 추가
            this.currentData.Node.push(...pastedNodes);
            this.currentData.Link.push(...pastedLinks);

            // UI 업데이트
            this.updateTables();
            this.updateMap();

            showNotification(`📍 ${pastedNodes.length}개 노드와 ${pastedLinks.length}개 링크를 붙여넣었습니다.\n📍 새 위치: ${mapCenter.lat.toFixed(6)}, ${mapCenter.lng.toFixed(6)}`, 'success');

        } catch (error) {
            console.error('붙여넣기 처리 중 오류:', error);
            showNotification('붙여넣기 중 오류가 발생했습니다', 'error');
        } finally {
            hideLoading();
        }
    }

    // 클립보드 비우기
    async clearClipboard() {
        try {
            showLoading('클립보드를 비우는 중...');

            const hadContent = localStorage.getItem('pathEditor_clipboard') !== null;
            localStorage.removeItem('pathEditor_clipboard');

            // 클립보드 상태 업데이트
            this.updateLocalClipboardStatus();

            const message = hadContent ? '🗑️ 클립보드를 비웠습니다' : '📭 클립보드가 이미 비어있습니다';
            showNotification(message, 'success');

        } catch (error) {
            console.error('클립보드 삭제 중 오류:', error);
            showNotification('클립보드 삭제 중 오류가 발생했습니다', 'error');
        } finally {
            hideLoading();
        }
    }

    // 로컬 클립보드 상태 업데이트
    updateLocalClipboardStatus() {
        const clipboardDataStr = localStorage.getItem('pathEditor_clipboard');

        if (clipboardDataStr) {
            try {
                const clipboardData = JSON.parse(clipboardDataStr);
                const nodeCount = clipboardData.nodes?.length || 0;
                const linkCount = clipboardData.links?.length || 0;

                this.clipboardStatus = {
                    has_content: true,
                    paste_enabled: nodeCount > 0,
                    button_text: `📍 붙여넣기 (${nodeCount}개 노드)`,
                    message: `🗂️ 클립보드에 ${nodeCount}개 노드, ${linkCount}개 링크가 저장되어 있습니다`,
                    node_count: nodeCount,
                    link_count: linkCount
                };
            } catch (error) {
                console.error('클립보드 데이터 파싱 오류:', error);
                localStorage.removeItem('pathEditor_clipboard');
                this.clipboardStatus = { has_content: false, paste_enabled: false };
            }
        } else {
            this.clipboardStatus = {
                has_content: false,
                paste_enabled: false,
                button_text: '📍 붙여넣기 (비활성)',
                message: '📭 클립보드가 비어있습니다',
                node_count: 0,
                link_count: 0
            };
        }

        this.updateClipboardUI();
    }

    // 새 노드 ID 생성 (N#### 연속 번호 — 백엔드 _generate_node_id와 동일 포맷)
    // extraUsedIds: 아직 currentData에 반영되지 않은, 같은 붙여넣기 배치에서 이미 부여한 ID들
    _generateNewNodeId(extraUsedIds = []) {
        let maxIdx = 0;
        this.currentData.Node.forEach(n => {
            maxIdx = Math.max(maxIdx, this.parseNodeIdx(n.ID));
        });
        extraUsedIds.forEach(id => {
            maxIdx = Math.max(maxIdx, this.parseNodeIdx(id));
        });
        return this.formatNodeId(maxIdx + 1);
    }

    // 새 링크 ID 생성 (L{from}{to} — 백엔드 _generate_link_id와 동일 포맷)
    // 충돌 시 L#### 연속 번호로 대체
    _generateNewLinkId(fromNodeId, toNodeId, extraUsedIds = []) {
        const fromNum = fromNodeId.startsWith('N') ? fromNodeId.slice(1) : fromNodeId;
        const toNum = toNodeId.startsWith('N') ? toNodeId.slice(1) : toNodeId;
        const baseId = `L${fromNum}${toNum}`;

        const used = new Set([
            ...this.currentData.Link.map(l => l.ID),
            ...extraUsedIds
        ]);

        if (!used.has(baseId)) return baseId;

        // 충돌 시 일련번호 부여
        let maxIdx = 0;
        used.forEach(id => { maxIdx = Math.max(maxIdx, this.parseLinkIdx(id)); });
        return `L${String(maxIdx + 1).padStart(4, '0')}`;
    }

    // 링크 길이 계산
    _calculateLinkLength(fromNode, toNode) {
        if (!fromNode || !toNode) return 0.0;

        const ex1 = fromNode.UtmInfo.Easting;
        const ny1 = fromNode.UtmInfo.Northing;
        const ex2 = toNode.UtmInfo.Easting;
        const ny2 = toNode.UtmInfo.Northing;

        const distM = Math.sqrt((ex1 - ex2) ** 2 + (ny1 - ny2) ** 2);
        return Math.round(distM / 10) / 100; // km 단위, 소수점 2자리
    }


}