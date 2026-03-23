// Semantic Map Editor - Main Application
class SemanticMapEditor {
    constructor() {
        this.map = null;
        this.currentFile = null;
        this.selectedFile = null;  // 파일 탐색기에서 선택된 파일
        this.mapName = 'Untitled';
        this.hasUnsavedChanges = false;
    }

    async init() {
        try {
            // Initialize map
            this.map = new SemanticMap('map');

            // Setup map callbacks
            this.setupMapCallbacks();

            // Setup UI event handlers
            this.setupUIHandlers();

            // Load file list
            await this.loadFileList();

            console.log('Semantic Map Editor initialized');
            showNotification('Semantic Map Editor ready', 'success');

        } catch (error) {
            console.error('Failed to initialize:', error);
            showNotification('Failed to initialize editor', 'error');
        }
    }

    setupMapCallbacks() {
        this.map.onAreaSelect = (areaId, areaData) => {
            this.updatePropertyPanel(areaId, areaData);
            this.highlightTableRow(areaId);
        };

        this.map.onAreaCreate = (areaId, areaData) => {
            this.addAreaToTable(areaId, areaData);
            this.updateAreaCount();
            this.hasUnsavedChanges = true;
        };

        this.map.onAreaDelete = (areaId) => {
            this.removeAreaFromTable(areaId);
            this.updateAreaCount();
            this.updatePropertyPanel(null, null);
            this.hasUnsavedChanges = true;
        };

        this.map.onAreaUpdate = (areaId, areaData) => {
            this.updateAreaInTable(areaId, areaData);
            this.hasUnsavedChanges = true;
        };
    }

    setupUIHandlers() {
        // Map style selector
        document.getElementById('mapStyleSelect').addEventListener('change', (e) => {
            this.map.setMapStyle(e.target.value);
        });

        // Area type buttons
        document.querySelectorAll('.btn-area-type').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-area-type').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.map.setAreaType(btn.dataset.type);
            });
        });

        // Draw polygon button
        document.getElementById('drawPolygonBtn').addEventListener('click', () => {
            this.setActiveMode('drawPolygonBtn');
            this.map.startDrawing();
        });

        // Edit mode button
        document.getElementById('editModeBtn').addEventListener('click', () => {
            const isEditing = this.map.startEditing();
            this.setActiveMode(isEditing ? 'editModeBtn' : null);
        });

        // Delete mode button
        document.getElementById('deleteModeBtn').addEventListener('click', () => {
            const isDeleting = this.map.startDeleting();
            this.setActiveMode(isDeleting ? 'deleteModeBtn' : null);
        });

        // File operations
        document.getElementById('loadBtn').addEventListener('click', () => this.showLoadDialog());
        document.getElementById('saveBtn').addEventListener('click', () => this.showSaveModal());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportToFile());
        document.getElementById('refreshFiles').addEventListener('click', () => this.loadFileList());
        document.getElementById('downloadFileBtn').addEventListener('click', () => this.downloadSelectedFile());

        // Save modal
        document.getElementById('confirmSaveBtn').addEventListener('click', () => this.saveMap());
        document.getElementById('cancelSaveBtn').addEventListener('click', () => this.closeSaveModal());
        document.querySelector('#saveModal .close').addEventListener('click', () => this.closeSaveModal());

        // Area edit modal
        document.getElementById('applyAreaEditBtn').addEventListener('click', () => this.applyAreaEdit());
        document.getElementById('cancelAreaEditBtn').addEventListener('click', () => this.closeAreaEditModal());
        document.querySelector('#areaEditModal .close').addEventListener('click', () => this.closeAreaEditModal());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.map.deselectArea();
                this.setActiveMode(null);
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.showSaveModal();
            }
        });

        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    setActiveMode(activeButtonId) {
        const buttons = ['drawPolygonBtn', 'editModeBtn', 'deleteModeBtn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (id === activeButtonId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Property Panel
    updatePropertyPanel(areaId, areaData) {
        const panel = document.getElementById('areaProperties');

        if (!areaId || !areaData) {
            panel.innerHTML = '<p class="text-muted">Select an area to edit properties</p>';
            return;
        }

        const props = areaData.properties || {};
        panel.innerHTML = `
            <div class="property-row">
                <label>ID:</label>
                <span>${areaId}</span>
            </div>
            <div class="property-row">
                <label>Type:</label>
                <span class="area-type-badge ${areaData.type}">${areaData.type}</span>
            </div>
            <div class="property-row">
                <label>Speed Limit:</label>
                <span>${props.speed_limit || 0} m/s</span>
            </div>
            <div class="property-row">
                <label>Priority:</label>
                <span>${props.priority || 1}</span>
            </div>
            <div class="property-row">
                <label>Traversable:</label>
                <span>${props.traversable ? 'Yes' : 'No'}</span>
            </div>
            <div class="property-actions">
                <button class="btn btn-primary" onclick="semanticApp.openAreaEditModal('${areaId}')">Edit</button>
                <button class="btn btn-danger" onclick="semanticApp.confirmDeleteArea('${areaId}')">Delete</button>
            </div>
        `;
    }

    // Area Table
    addAreaToTable(areaId, areaData) {
        const tbody = document.querySelector('#areaTable tbody');
        const tr = document.createElement('tr');
        tr.dataset.areaId = areaId;
        tr.innerHTML = `
            <td>${areaId}</td>
            <td><span class="area-type-badge ${areaData.type}">${areaData.type}</span></td>
            <td>${areaData.properties?.speed_limit || 0}</td>
            <td>
                <button class="btn btn-danger" onclick="semanticApp.confirmDeleteArea('${areaId}')">Del</button>
            </td>
        `;
        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                this.map.focusOnArea(areaId);
            }
        });
        tbody.appendChild(tr);
    }

    removeAreaFromTable(areaId) {
        const tr = document.querySelector(`#areaTable tr[data-area-id="${areaId}"]`);
        if (tr) tr.remove();
    }

    updateAreaInTable(areaId, areaData) {
        const tr = document.querySelector(`#areaTable tr[data-area-id="${areaId}"]`);
        if (tr) {
            tr.children[1].innerHTML = `<span class="area-type-badge ${areaData.type}">${areaData.type}</span>`;
            tr.children[2].textContent = areaData.properties?.speed_limit || 0;
        }
    }

    highlightTableRow(areaId) {
        document.querySelectorAll('#areaTable tbody tr').forEach(tr => {
            tr.classList.remove('selected');
        });
        if (areaId) {
            const tr = document.querySelector(`#areaTable tr[data-area-id="${areaId}"]`);
            if (tr) tr.classList.add('selected');
        }
    }

    updateAreaCount() {
        const count = this.map.getAreaCount();
        document.getElementById('areaCount').textContent = count;
        document.getElementById('totalAreas').textContent = count;
    }

    // Area Edit Modal
    openAreaEditModal(areaId) {
        const areaInfo = this.map.areas.get(areaId);
        if (!areaInfo) return;

        document.getElementById('editAreaId').value = areaId;
        document.getElementById('editAreaType').value = areaInfo.data.type;
        document.getElementById('editSpeedLimit').value = areaInfo.data.properties?.speed_limit || 0;
        document.getElementById('editPriority').value = areaInfo.data.properties?.priority || 1;
        document.getElementById('editRemark').value = areaInfo.data.properties?.remark || '';

        document.getElementById('areaEditModal').style.display = 'block';
    }

    closeAreaEditModal() {
        document.getElementById('areaEditModal').style.display = 'none';
    }

    applyAreaEdit() {
        const areaId = document.getElementById('editAreaId').value;
        const newType = document.getElementById('editAreaType').value;
        const speedLimit = parseFloat(document.getElementById('editSpeedLimit').value);
        const priority = parseInt(document.getElementById('editPriority').value);
        const remark = document.getElementById('editRemark').value;

        this.map.updateAreaProperties(areaId, {
            type: newType,
            speed_limit: speedLimit,
            priority: priority,
            remark: remark
        });

        this.closeAreaEditModal();
        this.updatePropertyPanel(areaId, this.map.areas.get(areaId)?.data);
        showNotification(`Area ${areaId} updated`, 'success');
    }

    confirmDeleteArea(areaId) {
        if (confirm(`Delete area ${areaId}?`)) {
            this.map.deleteArea(areaId);
        }
    }

    // File Operations
    async loadFileList() {
        const fileTree = document.getElementById('fileTree');
        fileTree.innerHTML = '<div class="file-item loading"><span class="file-icon">&#9203;</span><span class="file-name">Loading...</span></div>';

        try {
            const files = await semanticAPI.listFiles();
            fileTree.innerHTML = '';

            if (files.length === 0) {
                fileTree.innerHTML = '<div class="file-item"><span class="file-name text-muted">No files found</span></div>';
                return;
            }

            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.file = file;
                item.innerHTML = `
                    <span class="file-icon">&#128196;</span>
                    <span class="file-name">${file}</span>
                `;
                item.addEventListener('click', (e) => {
                    // 단일 클릭: 선택
                    document.querySelectorAll('#fileTree .file-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.selectedFile = file;
                });
                item.addEventListener('dblclick', () => this.loadMap(file));
                fileTree.appendChild(item);
            });

        } catch (error) {
            fileTree.innerHTML = '<div class="file-item"><span class="file-name text-muted">Failed to load files</span></div>';
            handleAPIError(error, 'Failed to load file list');
        }
    }

    showLoadDialog() {
        // For now, use file explorer in left panel
        showNotification('Select a file from the file explorer', 'info');
    }

    async loadMap(filename) {
        if (this.hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Load anyway?')) {
                return;
            }
        }

        showLoading();

        try {
            const mapData = await semanticAPI.loadMap(filename);
            this.map.loadMapData(mapData);
            this.currentFile = filename;
            this.mapName = mapData.name || filename.replace('.json', '');

            // Update UI
            document.getElementById('mapName').textContent = this.mapName;
            this.refreshAreaTable();
            this.updateAreaCount();
            this.hasUnsavedChanges = false;

            showNotification(`Loaded: ${filename}`, 'success');

        } catch (error) {
            handleAPIError(error, 'Failed to load map');
        } finally {
            hideLoading();
        }
    }

    showSaveModal() {
        document.getElementById('saveMapName').value = this.mapName;
        document.getElementById('saveFilename').value = this.currentFile || `${this.mapName}.json`;
        document.getElementById('saveModal').style.display = 'block';
    }

    closeSaveModal() {
        document.getElementById('saveModal').style.display = 'none';
    }

    async saveMap() {
        const mapName = document.getElementById('saveMapName').value.trim();
        let filename = document.getElementById('saveFilename').value.trim();

        if (!filename) {
            showNotification('Please enter a filename', 'warning');
            return;
        }

        if (!filename.endsWith('.json')) {
            filename += '.json';
        }

        showLoading();

        try {
            const mapData = this.map.exportMapData(mapName);
            await semanticAPI.saveMap(filename, mapData);

            this.currentFile = filename;
            this.mapName = mapName;
            this.hasUnsavedChanges = false;

            document.getElementById('mapName').textContent = mapName;

            this.closeSaveModal();
            await this.loadFileList();

            showNotification(`Saved: ${filename}`, 'success');

        } catch (error) {
            handleAPIError(error, 'Failed to save map');
        } finally {
            hideLoading();
        }
    }

    exportToFile() {
        const mapData = this.map.exportMapData(this.mapName);
        const json = JSON.stringify(mapData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.mapName}_semantic_map.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Map exported', 'success');
    }

    async downloadSelectedFile() {
        if (!this.selectedFile) {
            showNotification('Select a file first', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/semantic/load?path=${encodeURIComponent(this.selectedFile)}`);
            if (!response.ok) throw new Error('Failed to download');

            const data = await response.json();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = this.selectedFile.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showNotification(`Downloaded: ${this.selectedFile}`, 'success');
        } catch (error) {
            handleAPIError(error, 'Failed to download file');
        }
    }

    refreshAreaTable() {
        const tbody = document.querySelector('#areaTable tbody');
        tbody.innerHTML = '';

        const areas = this.map.getAllAreas();
        areas.forEach(area => {
            this.addAreaToTable(area.id, area);
        });
    }
}

// Initialize application
let semanticApp;

document.addEventListener('DOMContentLoaded', async () => {
    semanticApp = new SemanticMapEditor();
    await semanticApp.init();
});
