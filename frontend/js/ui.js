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

        // ★ 현재 모달이 '수정'으로 열렸는지 구분하기 위한 플래그/ID
        this.editingNodeId = null;

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
            'quickLink': 'linkTwoNodesModeBtn',
            'intervalCreate': 'intervalCreateModeBtn'
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
            'select': '노드 선택 모드',
            'drag': '노드 드래그 모드 - 노드를 드래그하여 위치를 변경할 수 있습니다',
            'addNode': '노드 추가 모드 - 지도를 클릭하여 새 노드를 추가하세요',
            'quickLink': '두 노드 잇기 모드(Quick Link) - 두 노드를 순서대로 클릭하여 링크를 생성하세요',
            'intervalCreate': '구간 노드 생성 모드 - 시작점을 클릭하세요'
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
        const selectedFile = this.fileExplorer.getSelectedFile();
        if (!selectedFile || selectedFile.type === 'folder') {
            showNotification('다운로드할 파일을 선택해주세요', 'warning');
            return;
        }

        const filename = selectedFile.name;

        try {
            showLoading();
            // API는 전체 경로가 아닌 파일명만 필요로 할 수 있습니다.
            // 백엔드 API의 downloadFile 구현에 따라 selectedFile.fullPath 또는 filename을 사용합니다.
            // 현재 백엔드 API는 filename만 받으므로 filename을 사용합니다.
            const blob = await pathAPI.downloadFile(filename);
            
            // 파일 다운로드 로직
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showNotification(`${filename}이 다운로드되었습니다`, 'success');
            
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
        document.getElementById('nodeHeading').value = '0.0';
        
        this.showModal('nodeModal');
    }

    async saveNewNode() {
        const lat = parseFloat(document.getElementById('nodeLat').value);
        const lng = parseFloat(document.getElementById('nodeLon').value);
        const alt = parseFloat(document.getElementById('nodeAlt').value) || 0;
        const maker = document.getElementById('nodeMaker').value || 'SCV Web Editor';
        const remark = document.getElementById('nodeRemark').value || '';

        // NodeType 읽기 및 검증
        const nodeTypeInput = document.getElementById('nodeType').value;
        let nodeType = parseInt(nodeTypeInput, 10);
            if (Number.isNaN(nodeType)) {
                nodeType = 1; // 기본값
        }

        // ★ Heading (float)
        let heading = parseFloat(document.getElementById('nodeHeading').value);
        if (Number.isNaN(heading)) heading = 0.0;
        // 필요하면 0~360 범위로 정규화:
        // heading = ((heading % 360) + 360) % 360;


         // --------- ★ 수정 분기: editingNodeId가 있으면 '덮어쓰기' ----------
        if (this.editingNodeId) {
            const nodeId = this.editingNodeId;

            // 로컬 덮어쓸 데이터 (위/경도는 readOnly이므로 그대로)
            const updatedLocal = {
            NodeType: nodeType,
            Maker: maker,
            Remark: remark,
            Heading: heading,
            GpsInfo: { Lat: lat, Long: lng, Alt: alt }
            // UtmInfo/기타 필드는 기존 값 유지
            };

            try {
            showLoading();

            // 서버에도 적용 가능한 API가 있으면 호출 (없으면 로컬만)
            let updatedFromServer = null;
            if (typeof pathAPI.updateNode === 'function') {
                // 서버 스키마에 맞춰 필요 시 ID 포함
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
                // UTM은 위치 바꾸지 않았으니 유지
                UtmInfo: prev.UtmInfo,
                ID: nodeId
                });
                this.currentData.Node[idx] = merged;

                // 지도/선택 패널에 반영
                if (window.pathMap && window.pathMap.nodes.has(nodeId)) {
                window.pathMap.nodes.get(nodeId).data = merged;
                }
                this.updateNodeTable();
                this.updateSelectedNodeInfo(nodeId, merged);
            }

            // UI 마무리
            this.hideModal('nodeModal');
            this.editingNodeId = null; // 편집 종료
            showNotification(`노드 ${nodeId}가 수정되었습니다`, 'success');
            } catch (error) {
            handleAPIError(error, '노드 수정 중 오류가 발생했습니다');
            } finally {
            hideLoading();
            }
            return; // ★ 생성 분기는 타지 않게 종료
        }
        // -------------------- 여기까지가 수정 분기 --------------------



        // UTM 좌표 계산 (간단한 근사치)
        const utmX = 302485.85 + (lng - 126.7732925755467) * 88740;
        const utmY = 4123756.89 + (lat - 37.239429897406026) * 111320;

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
            if (newNode.Heading === undefined) newNode.Heading = nodeData.Heading; // 보정
            
            // 현재 데이터에 추가
            this.currentData.Node.push(this.normalizeNode(newNode));
            
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
            else node.Heading = 0.0; // 기본값
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

    openEditNodeModal() {
        if (!window.pathMap) return showNotification('지도가 초기화되지 않았습니다', 'warning');

        const sel = window.pathMap.getSelectedNode();
        if (!sel || !sel.data) {
            showNotification('먼저 노드를 선택하세요.', 'warning');
            return;
        }
        const n = sel.data;

        // ★ 편집 대상 ID 저장
        this.editingNodeId = n.ID;

        // 모달 제목/버튼 문구
        const modal = document.getElementById('nodeModal');
        modal.querySelector('.modal-header h3').textContent = `노드 수정 (${n.ID})`;
        modal.querySelector('#saveNodeBtn').textContent = '수정 저장';

        // 기존 값 채우기 (위/경도는 readonly 유지)
        document.getElementById('nodeLat').value     = (n.GpsInfo?.Lat ?? 0).toFixed(6);
        document.getElementById('nodeLon').value     = (n.GpsInfo?.Long ?? 0).toFixed(6);
        document.getElementById('nodeAlt').value     = (n.GpsInfo?.Alt ?? 0).toString();
        document.getElementById('nodeMaker').value   = n.Maker ?? '';
        document.getElementById('nodeRemark').value  = n.Remark ?? '';
        document.getElementById('nodeType').value    = (n.NodeType ?? 1).toString();
        document.getElementById('nodeHeading').value = (n.Heading ?? n.heading ?? 0).toString();

        this.showModal('nodeModal');
    }

}