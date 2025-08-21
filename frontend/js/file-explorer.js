// File Explorer for SCV Path Editor
class FileExplorer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedFile = null;
        this.onFileSelect = null;
        this.contextMenu = null;
        
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
    }

    async loadFileTree() {
        try {
            this.showLoading();
            
            // API를 통해 파일 목록 가져오기
            const files = await pathAPI.listFiles();
            
            // 파일들을 폴더별로 분류
            this.fileTree = this.buildFileTree(files);
            
            // 트리 렌더링
            this.renderFileTree(this.fileTree);
            
        } catch (error) {
            console.error('파일 목록 로드 실패:', error);
            this.showError('파일 목록을 불러올 수 없습니다.');
        }
    }

    buildFileTree(files) {
        const tree = {
            name: 'data',
            type: 'folder',
            children: [],
            expanded: true
        };

        files.forEach(filename => {
            const parts = filename.split('/');
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
                    let folder = current.children.find(child => 
                        child.name === part && child.type === 'folder'
                    );
                    
                    if (!folder) {
                        folder = {
                            name: part,
                            type: 'folder',
                            children: [],
                            expanded: false
                        };
                        current.children.push(folder);
                    }
                    current = folder;
                }
            });
        });

        // 알파벳 순 정렬 (폴더 먼저, 그 다음 파일)
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
        this.container.innerHTML = '';
        this.renderNode(tree, 0);
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
                this.toggleFolder(item, node);
            } else {
                this.selectFile(item, node);
            }
        });

        // 더블클릭 이벤트 (파일 열기)
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            
            if (node.type !== 'folder') {
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
    }

    toggleFolder(item, node) {
        node.expanded = !node.expanded;
        item.dataset.expanded = node.expanded;
        
        const toggle = item.querySelector('.folder-toggle');
        toggle.classList.toggle('expanded', node.expanded);
        
        // 트리 다시 렌더링
        this.renderFileTree(this.fileTree);
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
        const newName = prompt('새 파일명을 입력하세요:', node.name);
        if (newName && newName !== node.name) {
            // TODO: 파일명 변경 API 구현
            showNotification('파일명 변경 기능은 추후 구현될 예정입니다.', 'info');
        }
    }

    deleteFile(node) {
        if (confirm(`${node.name} 파일을 삭제하시겠습니까?`)) {
            // TODO: 파일 삭제 API 구현
            showNotification('파일 삭제 기능은 추후 구현될 예정입니다.', 'info');
        }
    }

    createNewFolder() {
        const folderName = prompt('새 폴더명을 입력하세요:');
        if (folderName) {
            // TODO: 폴더 생성 API 구현
            showNotification('폴더 생성 기능은 추후 구현될 예정입니다.', 'info');
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
}