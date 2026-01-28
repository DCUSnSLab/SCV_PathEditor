// File Explorer for SCV Path Editor
class FileExplorer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedFile = null;
        this.onFileSelect = null;
        this.contextMenu = null;
        this.currentFolder = localStorage.getItem('fe:currentFolder') || ''; // '' = 루트
        this.expandedPaths = new Set(
            JSON.parse(localStorage.getItem('fe:expanded') || '[]')
        );
        this.init();
    }

    init() {
        this.createContextMenu();
        this.setupEventListeners();
        this.loadFileTree();
    }

    createContextMenu() {
        // 컨텍스트 메뉴 생성
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="load">📂 파일 열기</div>
            <div class="context-menu-item" data-action="download">💾 다운로드</div>
            <div class="context-menu-item" data-action="rename">✏️ 이름 변경</div>
            <div class="context-menu-item" data-action="delete">🗑️ 삭제</div>
        `;
        document.body.appendChild(this.contextMenu);

        // 컨텍스트 메뉴 이벤트
        this.contextMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action && this.selectedFile) {
                this.handleContextAction(action, this.selectedFile);
            }
            this.hideContextMenu();
        });

        // 클릭 시 컨텍스트 메뉴 숨기기
        document.addEventListener('click', () => {
            this.hideContextMenu();
        });
    }

    setupEventListeners() {
        // 새로고침 버튼
        const refreshBtn = document.getElementById('refreshFiles');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadFileTree();
            });
        }

        // 새 폴더 버튼
        const newFolderBtn = document.getElementById('newFolder');
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                this.createNewFolder();
            });
        }
        // ★ 삭제 버튼
        const deleteBtn = document.getElementById('deleteFile');
        if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelectedFile());
    }

// file-explorer.js
    async loadFileTree(keepState = true) {
        try {
            this.showLoading();
            const [files, dirs] = await Promise.all([
                pathAPI.listFiles(),  // 배열
                pathAPI.listDirs(),   // 배열(또는 방탄 처리로 배열화)
            ]);
            this.treeData = this.buildFileTree(files, dirs);
            if (keepState) {
                this.applyStateToTree(this.treeData);
                // 현재 폴더를 다시 열어둠
                    this.openFolderByPath(this.currentFolder);
                }

            this.renderFileTree(this.treeData);   // ✅ 여기! this.render() → this.renderFileTree(...)
            this.updatePathLabel();
        } catch (err) {
            handleAPIError(err, '파일 목록을 불러올 수 없습니다');
            this.showError('파일 목록을 불러오는 중 오류가 발생했습니다.');
        } finally {
            // 전역 오버레이가 아니라면 따로 닫을 필요 없음
        }
    }


    buildFileTree(files, dirs = []) {
        const tree = {
            name: 'data',
            type: 'folder',
            children: [],
            expanded: true,
            fullPath: ''
        };

        // 1) 폴더 경로를 먼저 반영 (빈 폴더도 보이게)
            dirs.forEach(d => {
                const parts = d.split('/').filter(Boolean);
                let current = tree;
                parts.forEach((part, idx) => {
                    let folder = current.children.find(
                    c => c.type === 'folder' && c.name === part
                    );
                    if (!folder) {
                        folder = {
                            name: part,
                            type: 'folder',
                            children: [],
                            expanded: false,
                            fullPath: current.fullPath ? `${current.fullPath}/${part}` : part
                            };
                        current.children.push(folder);
                        }
                    current = folder;
                    });
                });

        files.forEach(filename => {
            const parts = filename.split('/').filter(Boolean);
            let current = tree;

            parts.forEach((part, index) => {
                if (index === parts.length - 1) {
                    // 파일
                    current.children.push({
                        name: part,
                        fullPath: filename,
                        type: this.getFileType(part),
                        size: this.getFileSize(filename),
                        modified: this.getFileDate(filename)
                    });
                } else {
                    // 폴더
                    let folder = current.children.find(
                        child => child.name === part && child.type === 'folder'
                    );
                    if (!folder) {
                        folder = {
                            name: part,
                            type: 'folder',
                            children: [],
                            expanded: false,
                            // 부모 fullPath를 기준으로 경로 생성
                            fullPath: current.fullPath ? `${current.fullPath}/${part}` : part
                        };
                        current.children.push(folder);
                    }
                    current = folder;
                }
            });
        });

        this.sortTree(tree);
        return tree;
    }

    sortTree(node) {
        if (node.children) {
            node.children.sort((a, b) => {
                // 폴더를 먼저 정렬
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                
                // 이름으로 정렬
                return a.name.localeCompare(b.name);
            });

            // 재귀적으로 하위 폴더도 정렬
            node.children.forEach(child => {
                if (child.type === 'folder') {
                    this.sortTree(child);
                }
            });
        }
    }

    renderFileTree(tree) {
        this.updatePathLabel();
        this.container.innerHTML = '';

        // 현재 폴더 노드 찾기
            let root = this.findFolderNode(this.currentFolder);
        if (!root) {
            // 깨진 상태 복구: 루트로 이동
                this.currentFolder = '';
            this.saveExplorerState();
            root = this.treeData;
            }
         // 상위 폴더 항목("..") 제공
        if (this.currentFolder) {
            const up = document.createElement('div');
            up.className = 'file-item folder up';
            up.innerHTML = `<span class="folder-toggle empty"></span><span class="file-icon"></span><span class="file-name">..</span>`;
            up.addEventListener('click', () => {
                const parent = this.currentFolder.split('/').filter(Boolean).slice(0,-1).join('/');
                this.enterFolder(parent);
            });
            this.container.appendChild(up);
        }
         // 현재 폴더의 자식들만 렌더
        (root.children || []).forEach(child => this.renderNode(child, 0));
    }

    renderNode(node, level) {
        if (node.name === 'data' && level === 0) {
            // 루트 노드는 표시하지 않고 자식들만 표시
            node.children?.forEach(child => {
                this.renderNode(child, level);
            });
            return;
        }

        const item = document.createElement('div');
        item.className = `file-item ${node.type}`;
        item.dataset.level = level;
        item.dataset.type = node.type;
        
        if (node.type === 'folder') {
            item.dataset.expanded = node.expanded || false;
        }

        let html = '';

        // 폴더 토글 버튼 (폴더인 경우)
        if (node.type === 'folder' && node.children && node.children.length > 0) {
            html += `<span class="folder-toggle ${node.expanded ? 'expanded' : ''}">▶</span>`;
        } else if (node.type === 'folder') {
            html += `<span class="folder-toggle empty"> </span>`;
        }

        // 파일 아이콘
        html += `<span class="file-icon"></span>`;

        // 파일명
        html += `<span class="file-name" title="${node.fullPath || node.name}">${node.name}</span>`;

        // 파일 크기 및 수정일 (파일인 경우)
        if (node.type !== 'folder') {
            if (node.size) {
                html += `<span class="file-size">${node.size}</span>`;
            }
            if (node.modified) {
                html += `<span class="file-date">${node.modified}</span>`;
            }
        }

        item.innerHTML = html;

        // 이벤트 리스너
        this.setupFileItemEvents(item, node);

        this.container.appendChild(item);

        // 하위 항목 렌더링 (폴더가 열려있는 경우)
        if (node.type === 'folder' && node.expanded && node.children) {
            node.children.forEach(child => {
                this.renderNode(child, level + 1);
            });
        }
    }

    setupFileItemEvents(item, node) {
        // 클릭 이벤트
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'folder') {
            // 폴더 이름/행 클릭 = 해당 폴더로 들어가기
                this.enterFolder(node.fullPath || '');
            } else {
                this.selectFile(item, node);
            }
        });

        // 더블클릭 이벤트 (파일 열기)
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();

            if (node.type === 'folder') {
                this.enterFolder(node.fullPath || '');
                } else {
                    this.loadFile(node.fullPath);
                }
        });

        // 우클릭 컨텍스트 메뉴
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            if (node.type !== 'folder') {
                this.selectFile(item, node);
                this.showContextMenu(e.clientX, e.clientY, node);
            }
        });

        // 폴더 토글 버튼 클릭
        const toggleBtn = item.querySelector('.folder-toggle');
        if (toggleBtn && !toggleBtn.classList.contains('empty')) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFolder(item, node);
            });
        }

        // (1) 파일: 드래그 시작
        if (node.type !== 'folder') {
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', node.fullPath);  // src
                e.dataTransfer.effectAllowed = 'move';
            });
        }

// (2) 폴더: 드래그 오버/리브/드롭(파일만 허용)
        if (node.type === 'folder') {

            item.addEventListener('dragover', (e) => {
                // 드롭 허용
                e.preventDefault();
                item.classList.add('dropping');   // 시각 효과(스타일은 아래 CSS 추가)
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('dropping');
            });
            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                item.classList.remove('dropping');

                const src = e.dataTransfer.getData('text/plain');   // 드래그한 파일 경로
                if (!src) return;

                const destFolder = node.fullPath || '';             // 대상 폴더 경로
                try {
                    await pathAPI.moveFile(src, destFolder);
                    showNotification(`이동 완료 → ${destFolder}`, 'success');

                    // 이동한 폴더를 현재 폴더로 표시하고 펼친 목록에 추가
                    this.currentFolder = destFolder || '';
                    if (this.currentFolder) this.expandedPaths.add(this.currentFolder);
                    this.saveExplorerState();
                    await this.loadFileTree(true);

                } catch (err) {
                    console.error(err);
                    showNotification('이동에 실패했습니다', 'error');
                }
            });
        }
    }

    toggleFolder(item, node) {
        // 열림/닫힘 토글
        node.expanded = !node.expanded;
        // 펼친 경로/현재 폴더 상태 갱신
        const path = node.fullPath || '';
        if (node.expanded) this.expandedPaths.add(path);
        else               this.expandedPaths.delete(path);
        this.currentFolder = path;
        this.saveExplorerState();

        // 다시 렌더
        this.renderFileTree(this.treeData);
    }

    selectFile(item, node) {
        // 이전 선택 해제
        this.container.querySelectorAll('.file-item.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // 새 선택 적용
        item.classList.add('selected');
        this.selectedFile = node;

        console.log('파일 선택됨:', node.fullPath);
    }

    async loadFile(filepath) {
        try {
            if (this.onFileSelect) {
                await this.onFileSelect(filepath);
            }
            showNotification(`${filepath} 파일을 로드했습니다.`, 'success');
        } catch (error) {
            handleAPIError(error, '파일 로드 중 오류가 발생했습니다');
        }
    }

    showContextMenu(x, y, node) {
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;

        // 화면 경계 체크
        const rect = this.contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.contextMenu.style.top = `${y - rect.height}px`;
        }
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    async handleContextAction(action, node) {
        switch (action) {
            case 'load':
                await this.loadFile(node.fullPath);
                break;
            case 'download':
                await this.downloadFile(node.fullPath);
                break;
            case 'rename':
                this.renameFile(node);
                break;
            case 'delete':
                this.deleteFile(node);
                break;
        }
    }

    async downloadFile(filepath) {
        try {
            const blob = await pathAPI.downloadFile(filepath);
            
            // 파일 다운로드
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filepath.split('/').pop();
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showNotification(`${filepath}을 다운로드했습니다.`, 'success');
        } catch (error) {
            handleAPIError(error, '파일 다운로드 중 오류가 발생했습니다');
        }
    }

    renameFile(node) {
        if (node.type === 'folder') {
            showNotification('폴더 이름 변경은 현재 지원하지 않습니다.', 'warning');
            return;
        }
        const newName = prompt('새 파일명을 입력하세요 (.json 포함):', node.name);
        if (!newName || newName === node.name) return;

        pathAPI.renameFile(node.fullPath, newName)
            .then(async (res) => {
                showNotification(`이름 변경: ${node.name} → ${newName}`, 'success');
                // 상태 유지: 현재 폴더/펼침 상태는 유지하고 목록만 갱신
                await this.loadFileTree(true);
                // 가능하면 동일 폴더를 currentFolder로 고정
                this.currentFolder = (node.fullPath.includes('/'))
                    ? node.fullPath.split('/').slice(0, -1).join('/')
                    : '';
                this.saveExplorerState();
            })
            .catch(err => {
                handleAPIError(err, '이름 변경 중 오류가 발생했습니다');
            });
    }

    deleteFile(node) {
        if (node.type === 'folder') {
            showNotification('폴더 삭제는 현재 지원하지 않습니다.', 'warning');
            return;
        }
        if (!confirm(`${node.name} 파일을 삭제하시겠습니까?`)) return;

        pathAPI.deleteFile(node.fullPath)
            .then(async () => {
                showNotification('파일을 삭제했습니다', 'success');
                this.selectedFile = null;
                await this.loadFileTree(true); // 펼침/현재 폴더 유지
            })
            .catch(err => {
                handleAPIError(err, '파일 삭제 중 오류가 발생했습니다');
            });
    }

    async createNewFolder() {
        const base = (this.selectedFile && this.selectedFile.type === 'folder')
            ? this.selectedFile.fullPath   // 선택 폴더 내부
            : '';                          // 루트

        const name = prompt('생성할 폴더 이름을 입력하세요:');
        if (!name) return;

        const target = base ? `${base}/${name}` : name;
        try {
            await pathAPI.createFolder(target);
            showNotification(`폴더 생성: ${target}`, 'success');

            // 방금 만든 폴더를 현재 폴더로 열기
            this.currentFolder = target;
            this.expandedPaths.add(target);
            this.saveExplorerState();

            await this.loadFileTree(true);
        } catch (e) {
            console.error(e);
            showNotification('폴더 생성 실패', 'error');
        }
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="file-item loading">
                <span class="file-icon">⏳</span>
                <span class="file-name">파일 목록 로딩 중...</span>
            </div>
        `;
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="file-item loading">
                <span class="file-icon">❌</span>
                <span class="file-name">${message}</span>
            </div>
        `;
    }

    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        switch (ext) {
            case 'json':
                return 'json';
            default:
                return 'file';
        }
    }

    getFileSize(filename) {
        // TODO: 실제 파일 크기 정보 API에서 가져오기
        return Math.floor(Math.random() * 100) + 1 + 'KB';
    }

    getFileDate(filename) {
        // TODO: 실제 파일 수정 날짜 API에서 가져오기
        return new Date().toLocaleDateString('ko-KR');
    }

    // 외부에서 파일 선택 콜백 설정
    setOnFileSelect(callback) {
        this.onFileSelect = callback;
    }

    // 선택된 파일 가져오기
    getSelectedFile() {
        return this.selectedFile;
    }

    // 특정 파일 선택
    selectFileByPath(filepath) {
        // TODO: 경로로 파일 선택 구현
        console.log('파일 선택:', filepath);
    }

    async deleteSelectedFile() {
        if (!this.selectedFile || this.selectedFile.type === 'folder') {
            showNotification('삭제할 파일을 선택하세요', 'warning');
            return;
        }
        if (!confirm(`정말 삭제할까요?\n${this.selectedFile.fullPath}`)) return;

        try {
            await pathAPI.deleteFile(this.selectedFile.fullPath);
            showNotification('파일을 삭제했습니다', 'success');
            this.selectedFile = null;
            await this.loadFileTree();
        } catch (e) {
            console.error(e);
            showNotification('파일 삭제 실패', 'error');
        }
    }

    saveExplorerState() {
        localStorage.setItem('fe:currentFolder', this.currentFolder);
        localStorage.setItem('fe:expanded', JSON.stringify([...this.expandedPaths]));
    }

    // 트리에 'expanded' 반영
    applyStateToTree(root) {
        const dfs = (node) => {
            if (node.type === 'folder') {
                if (node.fullPath) node.expanded = this.expandedPaths.has(node.fullPath);
                node.children?.forEach(dfs);
            }
        };
        dfs(root);
    }

    // 경로로 폴더 노드를 찾아서 펼치기
    openFolderByPath(path) {
        if (!path) return;
        const parts = path.split('/').filter(Boolean);
        let cur = this.treeData;
        for (const part of parts) {
            const next = cur.children?.find(c => c.type === 'folder' && c.name === part);
            if (!next) return; // 없는 경로면 중단
            next.expanded = true;
            cur = next;
        }
    }

    updatePathLabel() {
        const label = document.getElementById('fileExplorerPath');
        const upBtn = document.getElementById('goUpFolder');
        const rootBtn = document.getElementById('goRootFolder');
        const p = this.currentFolder || '';
        if (label) label.textContent = '/' + p;
        if (upBtn) {
            upBtn.disabled = !p;
            upBtn.onclick = () => {
                const parent = p.split('/').filter(Boolean).slice(0, -1).join('/');
                this.enterFolder(parent);
            };
        }
        if (rootBtn) {
            rootBtn.onclick = () => this.enterFolder('');
        }
    }

    findFolderNode(path) {
        // ''면 트리 루트 반환
        if (!path) return this.treeData;
        const parts = path.split('/').filter(Boolean);
        let cur = this.treeData;
        for (const part of parts) {
            cur = (cur.children || []).find(c => c.type === 'folder' && c.name === part);
            if (!cur) return null;
        }
        return cur;
    }

    enterFolder(path) {
        // path: 상대 경로('' = 루트)
        this.currentFolder = path || '';
        if (this.currentFolder) this.expandedPaths.add(this.currentFolder);
        this.saveExplorerState();
        this.renderFileTree(this.treeData);   // 현재 폴더 뷰로 다시 그리기
        this.updatePathLabel();
    }

}