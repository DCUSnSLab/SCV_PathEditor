/**
 * Point Cloud Editor - Main Application
 */
class PointCloudEditor {
    constructor() {
        this.scene = null;
        this.labeler = null;
        this.currentPcId = null;
        this.currentBagId = null;
        this.hasUnsavedChanges = false;

        // Auto-save interval
        this.autoSaveInterval = null;
    }

    async init() {
        // Initialize 3D scene
        this.scene = new PointCloudScene('threeContainer');

        // Initialize labeler
        this.labeler = new PointCloudLabeler(this.scene, 'selectionCanvas');

        // Setup callbacks
        this.setupCallbacks();

        // Setup UI handlers
        this.setupUIHandlers();

        // Load initial data
        await this.refreshBagList();
        await this.refreshPointCloudList();

        console.log('Point Cloud Editor initialized');
    }

    setupCallbacks() {
        // Point hover callback
        this.scene.onPointHover = (coords) => {
            document.getElementById('coordDisplay').textContent =
                `X: ${coords.x} Y: ${coords.y} Z: ${coords.z}`;
        };

        // Selection change callback
        this.labeler.onSelectionChange = (count) => {
            document.getElementById('info-selected').textContent = count;
            document.getElementById('assignLabelBtn').disabled = count === 0;
        };

        // Label change callback
        this.labeler.onLabelChange = () => {
            this.updateLabelStats();
            this.updateHistoryButtons();
            this.hasUnsavedChanges = true;
        };
    }

    setupUIHandlers() {
        // Upload button
        document.getElementById('uploadBagBtn').addEventListener('click', () => {
            this.showUploadModal();
        });

        // Upload modal
        document.getElementById('closeUploadModal').addEventListener('click', () => {
            this.hideUploadModal();
        });

        document.getElementById('selectFileBtn').addEventListener('click', () => {
            document.getElementById('bagFileInput').click();
        });

        document.getElementById('bagFileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadBag(e.target.files[0]);
            }
        });

        // Drag and drop
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.uploadBag(e.dataTransfer.files[0]);
            }
        });

        // Bag selection
        document.getElementById('refreshBagsBtn').addEventListener('click', () => {
            this.refreshBagList();
        });

        document.getElementById('bagSelect').addEventListener('change', (e) => {
            this.currentBagId = e.target.value;
            document.getElementById('processBtn').disabled = !this.currentBagId;
            if (this.currentBagId) {
                this.loadBagInfo(this.currentBagId);
            }
        });

        // Process button
        document.getElementById('processBtn').addEventListener('click', () => {
            this.processBag();
        });

        // Point cloud selection
        document.getElementById('refreshPcBtn').addEventListener('click', () => {
            this.refreshPointCloudList();
        });

        document.getElementById('pcSelect').addEventListener('change', (e) => {
            document.getElementById('loadPcBtn').disabled = !e.target.value;
        });

        document.getElementById('loadPcBtn').addEventListener('click', () => {
            const pcId = document.getElementById('pcSelect').value;
            if (pcId) {
                this.loadPointCloud(pcId);
            }
        });

        // View controls
        document.getElementById('view3DBtn').addEventListener('click', () => {
            this.setViewMode('3d');
        });

        document.getElementById('viewBEVBtn').addEventListener('click', () => {
            this.setViewMode('bev');
        });

        document.getElementById('pointSize').addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            document.getElementById('pointSizeValue').textContent = size;
            this.scene.setPointSize(size);
        });

        document.getElementById('colorMode').addEventListener('change', (e) => {
            this.scene.setColorMode(e.target.value);
        });

        document.getElementById('showGrid').addEventListener('change', (e) => {
            this.scene.setShowGrid(e.target.checked);
        });

        // Selection tools
        document.getElementById('boxSelectBtn').addEventListener('click', () => {
            this.setSelectionMode('box');
        });

        document.getElementById('lassoSelectBtn').addEventListener('click', () => {
            this.setSelectionMode('lasso');
        });

        document.getElementById('additiveSelect').addEventListener('change', (e) => {
            this.labeler.setAdditiveMode(e.target.checked);
        });

        document.getElementById('clearSelectionBtn').addEventListener('click', () => {
            this.labeler.clearSelection();
        });

        // Area type buttons
        document.querySelectorAll('.btn-area-type').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-area-type').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.labeler.setAreaType(btn.dataset.type);
            });
        });

        // Assign label
        document.getElementById('assignLabelBtn').addEventListener('click', () => {
            this.labeler.assignLabel();
        });

        // History
        document.getElementById('undoBtn').addEventListener('click', () => {
            this.labeler.undo();
            this.updateHistoryButtons();
        });

        document.getElementById('redoBtn').addEventListener('click', () => {
            this.labeler.redo();
            this.updateHistoryButtons();
        });

        // Polygon generation
        document.getElementById('generatePolygonsBtn').addEventListener('click', () => {
            this.generatePolygons();
        });

        // Export
        document.getElementById('exportSemanticBtn').addEventListener('click', () => {
            this.exportToSemantic();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportToSemantic();
        });
    }

    // === Modal ===

    showUploadModal() {
        document.getElementById('uploadModal').classList.add('show');
    }

    hideUploadModal() {
        document.getElementById('uploadModal').classList.remove('show');
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadArea').style.display = 'block';
    }

    // === Bag Management ===

    async refreshBagList() {
        try {
            const bags = await pointCloudAPI.listBags();
            const select = document.getElementById('bagSelect');
            select.innerHTML = '<option value="">-- Select Bag --</option>';

            bags.forEach(bagId => {
                const option = document.createElement('option');
                option.value = bagId;
                option.textContent = bagId;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load bags:', error);
            alert('Failed to load bag list: ' + error.message);
        }
    }

    async loadBagInfo(bagId) {
        try {
            const info = await pointCloudAPI.getBagInfo(bagId);
            const status = document.getElementById('bagStatus');
            status.innerHTML = `
                <strong>${info.filename}</strong><br>
                Duration: ${info.duration_sec.toFixed(1)}s<br>
                Topics: ${info.topics.length}
            `;
        } catch (error) {
            console.error('Failed to load bag info:', error);
        }
    }

    async uploadBag(file) {
        const uploadArea = document.getElementById('uploadArea');
        const progress = document.getElementById('uploadProgress');
        const progressFill = progress.querySelector('.progress-fill');
        const progressText = progress.querySelector('.progress-text');

        uploadArea.style.display = 'none';
        progress.style.display = 'block';

        try {
            const result = await pointCloudAPI.uploadBag(file, (percent) => {
                progressFill.style.width = `${percent * 100}%`;
                progressText.textContent = `Uploading... ${Math.round(percent * 100)}%`;
            });

            progressText.textContent = 'Upload complete!';
            await this.refreshBagList();

            // Select the uploaded bag
            document.getElementById('bagSelect').value = result.bag_id;
            this.currentBagId = result.bag_id;
            document.getElementById('processBtn').disabled = false;

            setTimeout(() => {
                this.hideUploadModal();
            }, 1000);

        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed: ' + error.message);
            uploadArea.style.display = 'block';
            progress.style.display = 'none';
        }
    }

    // === Processing ===

    async processBag() {
        if (!this.currentBagId) return;

        const options = {
            bag_id: this.currentBagId,
            lidar_topic: document.getElementById('lidarTopic').value,
            gps_topic: document.getElementById('gpsTopic').value,
            offset_x: parseFloat(document.getElementById('offsetX').value) || 0,
            offset_y: parseFloat(document.getElementById('offsetY').value) || 0
        };

        const progressContainer = document.getElementById('processProgress');
        const progressFill = progressContainer.querySelector('.progress-fill');
        const progressText = progressContainer.querySelector('.progress-text');

        progressContainer.style.display = 'block';
        document.getElementById('processBtn').disabled = true;

        try {
            const { job_id } = await pointCloudAPI.processBag(options);

            const result = await pointCloudAPI.waitForJob(job_id, (status) => {
                progressFill.style.width = `${status.progress * 100}%`;
                progressText.textContent = status.message;
            });

            if (result.status === 'completed') {
                progressText.textContent = 'Processing complete!';
                await this.refreshPointCloudList();

                // Automatically load the result
                if (result.pc_id) {
                    document.getElementById('pcSelect').value = result.pc_id;
                    await this.loadPointCloud(result.pc_id);
                }
            } else {
                throw new Error(result.error || 'Processing failed');
            }

        } catch (error) {
            console.error('Processing failed:', error);
            alert('Processing failed: ' + error.message);
        } finally {
            document.getElementById('processBtn').disabled = false;
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);
        }
    }

    // === Point Cloud Management ===

    async refreshPointCloudList() {
        try {
            const pcs = await pointCloudAPI.listPointClouds();
            const select = document.getElementById('pcSelect');
            select.innerHTML = '<option value="">-- Select Point Cloud --</option>';

            pcs.forEach(pcId => {
                const option = document.createElement('option');
                option.value = pcId;
                option.textContent = pcId;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load point clouds:', error);
        }
    }

    async loadPointCloud(pcId) {
        try {
            // Check for unsaved changes
            if (this.hasUnsavedChanges) {
                if (!confirm('You have unsaved changes. Load new point cloud anyway?')) {
                    return;
                }
            }

            // Load metadata
            const info = await pointCloudAPI.getPointCloudInfo(pcId);

            // Load point data
            const data = await pointCloudAPI.downloadPointCloud(pcId);

            // Load into scene
            this.scene.loadPointCloud(data, info);

            // Load labels
            const labels = await pointCloudAPI.getLabels(pcId);
            this.labeler.setLabels(labels.labels);

            // Update state
            this.currentPcId = pcId;
            this.hasUnsavedChanges = false;

            // Update UI
            this.updatePointCloudInfo(info);
            this.updateLabelStats();
            this.enableEditing();

            // Start auto-save
            this.startAutoSave();

            console.log(`Loaded point cloud: ${pcId}`);

        } catch (error) {
            console.error('Failed to load point cloud:', error);
            alert('Failed to load point cloud: ' + error.message);
        }
    }

    updatePointCloudInfo(info) {
        document.getElementById('info-total').textContent = info.total_points.toLocaleString();
        document.getElementById('info-displayed').textContent = info.downsampled_points.toLocaleString();
        document.getElementById('info-lat').textContent = info.gps_origin.lat.toFixed(6);
        document.getElementById('info-lng').textContent = info.gps_origin.lng.toFixed(6);
        document.getElementById('info-zone').textContent = info.gps_origin.utm_zone;
    }

    updateLabelStats() {
        const stats = this.scene.getLabelStats();

        document.getElementById('stat-drivable').textContent = stats.drivable.toLocaleString();
        document.getElementById('stat-crosswalk').textContent = stats.crosswalk.toLocaleString();
        document.getElementById('stat-sidewalk').textContent = stats.sidewalk.toLocaleString();
        document.getElementById('stat-no_entry').textContent = stats.no_entry.toLocaleString();
        document.getElementById('stat-plaza').textContent = stats.plaza.toLocaleString();
        document.getElementById('stat-total').textContent = stats.total.toLocaleString();
    }

    updateHistoryButtons() {
        document.getElementById('undoBtn').disabled = !this.labeler.canUndo();
        document.getElementById('redoBtn').disabled = !this.labeler.canRedo();
    }

    enableEditing() {
        document.getElementById('generatePolygonsBtn').disabled = false;
        document.getElementById('exportSemanticBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
    }

    // === View Controls ===

    setViewMode(mode) {
        this.scene.setViewMode(mode);

        document.getElementById('view3DBtn').classList.toggle('active', mode === '3d');
        document.getElementById('viewBEVBtn').classList.toggle('active', mode === 'bev');
    }

    setSelectionMode(mode) {
        const currentMode = this.labeler.selectionMode;
        const newMode = currentMode === mode ? null : mode;

        this.labeler.setSelectionMode(newMode);

        document.getElementById('boxSelectBtn').classList.toggle('active', newMode === 'box');
        document.getElementById('lassoSelectBtn').classList.toggle('active', newMode === 'lasso');
    }

    // === Auto-save ===

    startAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(() => {
            if (this.hasUnsavedChanges && this.currentPcId) {
                this.saveLabels();
            }
        }, 30000); // Auto-save every 30 seconds
    }

    async saveLabels() {
        if (!this.currentPcId) return;

        try {
            const labels = this.labeler.getLabels();
            await pointCloudAPI.saveLabels(this.currentPcId, labels);
            this.hasUnsavedChanges = false;
            console.log('Labels saved');
        } catch (error) {
            console.error('Failed to save labels:', error);
        }
    }

    // === Polygon Generation ===

    async generatePolygons() {
        if (!this.currentPcId) return;

        // Save labels first
        await this.saveLabels();

        const options = {
            alpha: parseFloat(document.getElementById('alphaParam').value) || 2.0,
            simplify_tolerance: parseFloat(document.getElementById('simplifyParam').value) || 0.5
        };

        try {
            const result = await pointCloudAPI.generatePolygons(this.currentPcId, options);

            // Show preview
            const preview = document.getElementById('polygonPreview');
            const list = document.getElementById('polygonList');

            if (result.polygons.length === 0) {
                list.innerHTML = '<p>No polygons generated. Label more points.</p>';
            } else {
                list.innerHTML = result.polygons.map(p => `
                    <div class="polygon-item">
                        <span class="stat-color" style="background:${this.getAreaColor(p.area_type)};"></span>
                        <span>${p.id}</span>
                        <span>${p.point_count} pts</span>
                        <span>${p.area_sqm.toFixed(1)} m²</span>
                    </div>
                `).join('');
            }

            preview.style.display = 'block';

        } catch (error) {
            console.error('Failed to generate polygons:', error);
            alert('Failed to generate polygons: ' + error.message);
        }
    }

    getAreaColor(type) {
        const colors = {
            drivable: '#4CAF50',
            crosswalk: '#FF9800',
            sidewalk: '#9E9E9E',
            no_entry: '#F44336',
            plaza: '#2196F3'
        };
        return colors[type] || '#888888';
    }

    // === Export ===

    async exportToSemantic() {
        if (!this.currentPcId) return;

        const mapName = document.getElementById('exportMapName').value || 'Untitled Map';
        const filename = document.getElementById('exportFilename').value || `map_${Date.now()}.json`;

        // Save labels first
        await this.saveLabels();

        try {
            const result = await pointCloudAPI.exportToSemantic(this.currentPcId, {
                map_name: mapName,
                filename: filename
            });

            alert(`Exported successfully!\n\nFile: ${result.filename}\nAreas: ${result.area_count}\n\nYou can now open it in Semantic Editor.`);

        } catch (error) {
            console.error('Failed to export:', error);
            alert('Failed to export: ' + error.message);
        }
    }
}

// Initialize on DOM ready
let pointCloudApp;

document.addEventListener('DOMContentLoaded', async () => {
    pointCloudApp = new PointCloudEditor();
    await pointCloudApp.init();
});
