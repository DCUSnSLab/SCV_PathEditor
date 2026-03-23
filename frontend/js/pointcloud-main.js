/**
 * Point Cloud Editor - Main Entry (ES6 Module)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CoordConverter } from './coord-converter.js';

// Make THREE available globally for other scripts
window.THREE = THREE;
window.OrbitControls = OrbitControls;

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// ============================================
// Point Cloud API Client
// ============================================
class PointCloudAPI {
    constructor() {
        this.baseUrl = '/api/lidar';
    }

    async uploadBag(file, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(e.loaded / e.total);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed: Network error'));
            });

            xhr.open('POST', `${this.baseUrl}/upload`);
            xhr.send(formData);
        });
    }

    async listBags() {
        const response = await fetch(`${this.baseUrl}/bags`);
        if (!response.ok) throw new Error(`Failed to list bags: ${response.status}`);
        return response.json();
    }

    async getBagInfo(bagId) {
        const response = await fetch(`${this.baseUrl}/bags/${bagId}/info`);
        if (!response.ok) throw new Error(`Failed to get bag info: ${response.status}`);
        return response.json();
    }

    async deleteBag(bagId) {
        const response = await fetch(`${this.baseUrl}/bags/${bagId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`Failed to delete bag: ${response.status}`);
        return response.json();
    }

    async processBag(options) {
        const response = await fetch(`${this.baseUrl}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to start processing: ${error}`);
        }
        return response.json();
    }

    async getJobStatus(jobId) {
        const response = await fetch(`${this.baseUrl}/jobs/${jobId}`);
        if (!response.ok) throw new Error(`Failed to get job status: ${response.status}`);
        return response.json();
    }

    async waitForJob(jobId, onProgress = null, interval = 1000) {
        while (true) {
            const status = await this.getJobStatus(jobId);
            if (onProgress) onProgress(status);
            if (status.status === 'completed' || status.status === 'failed') return status;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }

    async listPointClouds() {
        const response = await fetch(`${this.baseUrl}/pointclouds`);
        if (!response.ok) throw new Error(`Failed to list point clouds: ${response.status}`);
        return response.json();
    }

    async getPointCloudInfo(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}`);
        if (!response.ok) throw new Error(`Failed to get point cloud info: ${response.status}`);
        return response.json();
    }

    async downloadPointCloud(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/download`);
        if (!response.ok) throw new Error(`Failed to download point cloud: ${response.status}`);
        return response.arrayBuffer();
    }

    async deletePointCloud(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`Failed to delete point cloud: ${response.status}`);
        return response.json();
    }

    async getLabels(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/labels`);
        if (!response.ok) throw new Error(`Failed to get labels: ${response.status}`);
        return response.json();
    }

    async saveLabels(pcId, labels) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels })
        });
        if (!response.ok) throw new Error(`Failed to save labels: ${response.status}`);
        return response.json();
    }

    async generatePolygons(pcId, options = {}) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/generate-polygons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to generate polygons: ${error}`);
        }
        return response.json();
    }

    async exportToSemantic(pcId, options) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to export: ${error}`);
        }
        return response.json();
    }

    // Frame-based API methods
    async getFrameList(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/frames`);
        if (!response.ok) throw new Error(`Failed to get frames: ${response.status}`);
        return response.json();
    }

    async downloadFrame(pcId, frameId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/frames/${frameId}`);
        if (!response.ok) throw new Error(`Failed to download frame: ${response.status}`);
        return response.arrayBuffer();
    }

    async getFrameLabels(pcId, frameId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/frames/${frameId}/labels`);
        if (!response.ok) throw new Error(`Failed to get frame labels: ${response.status}`);
        return response.json();
    }

    async saveFrameLabels(pcId, frameId, labels) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/frames/${frameId}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels })
        });
        if (!response.ok) throw new Error(`Failed to save frame labels: ${response.status}`);
        return response.json();
    }

    async mergeFrames(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/merge`, {
            method: 'POST'
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to merge frames: ${error}`);
        }
        return response.json();
    }
}

// ============================================
// Point Cloud Scene (Three.js)
// ============================================
class PointCloudScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.pointCloud = null;
        this.gridHelper = null;

        this.points = null;
        this.pointCount = 0;
        this.bounds = null;
        this.metadata = null;
        this.coordConverter = null; // New property

        this.viewMode = '3d';
        this.pointSize = 2;
        this.colorMode = 'height';
        this.showGrid = true;

        this.selectedIndices = new Set();
        this.highlightColor = new THREE.Color(1, 1, 0);

        this.labelColors = {
            unlabeled: new THREE.Color(0.5, 0.5, 0.5),
            drivable: new THREE.Color(0.298, 0.686, 0.314),
            crosswalk: new THREE.Color(1.0, 0.596, 0.0),
            sidewalk: new THREE.Color(0.620, 0.620, 0.620),
            no_entry: new THREE.Color(0.957, 0.263, 0.212),
            plaza: new THREE.Color(0.129, 0.588, 0.953)
        };

        // Map tiles
        this.mapTiles = [];
        this.showMapTiles = false;

        this.labels = {
            drivable: new Set(),
            crosswalk: new Set(),
            sidewalk: new Set(),
            no_entry: new Set(),
            plaza: new Set()
        };

        this.onPointHover = null;
        this.initScene();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(
            60, this.container.clientWidth / this.container.clientHeight, 0.1, 10000
        );
        this.camera.position.set(0, 100, 100);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 5000;

        this.gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x333333);
        this.gridHelper.rotation.x = Math.PI / 2;
        this.scene.add(this.gridHelper);

        this.axesHelper = new THREE.AxesHelper(20);
        this.scene.add(this.axesHelper);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        this.animate();
        window.addEventListener('resize', () => this.resize());
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    loadPointCloud(binaryData, metadata, coordConverter) {
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
        }

        // Clear existing map tiles when loading new point cloud
        this.clearMapTiles();

        this.points = new Float32Array(binaryData);
        this.pointCount = this.points.length / 3;
        this.metadata = metadata;
        this.bounds = metadata.bounds;
        this.coordConverter = coordConverter; // Store the converter

        console.log(`Loading ${this.pointCount} points`);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));

        const colors = new Float32Array(this.pointCount * 3);
        this.updateColors(colors);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: this.pointSize,
            vertexColors: true,
            sizeAttenuation: true
        });

        this.pointCloud = new THREE.Points(geometry, material);
        this.scene.add(this.pointCloud);

        Object.keys(this.labels).forEach(key => this.labels[key].clear());
        this.selectedIndices.clear();

        this.fitCameraToBounds();
        this.updateGridPosition();
    }

    updateColors(colors = null) {
        if (!this.pointCloud && !colors) return;
        if (!colors) colors = this.pointCloud.geometry.attributes.color.array;

        for (let i = 0; i < this.pointCount; i++) {
            let color;
            if (this.selectedIndices.has(i)) {
                color = this.highlightColor;
            } else if (this.colorMode === 'label') {
                color = this.getPointLabelColor(i);
            } else {
                const z = this.points[i * 3 + 2];
                const normalized = (z - this.bounds.z_min) / (this.bounds.z_max - this.bounds.z_min + 0.001);
                color = new THREE.Color();
                color.setHSL(0.7 - normalized * 0.7, 1, 0.5);
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        if (this.pointCloud) {
            this.pointCloud.geometry.attributes.color.needsUpdate = true;
        }
    }

    getPointLabelColor(index) {
        for (const [type, indices] of Object.entries(this.labels)) {
            if (indices.has(index)) return this.labelColors[type];
        }
        return this.labelColors.unlabeled;
    }

    setPointSize(size) {
        this.pointSize = size;
        if (this.pointCloud) this.pointCloud.material.size = size;
    }

    setColorMode(mode) {
        this.colorMode = mode;
        this.updateColors();
    }

    setViewMode(mode) {
        this.viewMode = mode;
        if (mode === 'bev') {
            const centerX = (this.bounds.x_min + this.bounds.x_max) / 2;
            const centerY = (this.bounds.y_min + this.bounds.y_max) / 2;
            const centerZ = (this.bounds.z_min + this.bounds.z_max) / 2;
            const maxRange = Math.max(
                this.bounds.x_max - this.bounds.x_min,
                this.bounds.y_max - this.bounds.y_min
            );
            // BEV: 위에서 아래로 봄 (Z+ 에서 Z- 방향)
            // X = 오른쪽, Y = 위쪽 (화면상)
            this.camera.position.set(centerX, centerY, centerZ + maxRange * 1.5);
            this.camera.up.set(0, 1, 0);  // Y가 화면 위쪽
            this.controls.target.set(centerX, centerY, centerZ);
            this.controls.minPolarAngle = 0;
            this.controls.maxPolarAngle = 0;
            this.controls.enableRotate = false;

            // AxesHelper를 데이터 중심으로 이동
            this.axesHelper.position.set(centerX, centerY, this.bounds.z_min);
        } else {
            this.controls.minPolarAngle = 0;
            this.controls.maxPolarAngle = Math.PI;
            this.controls.enableRotate = true;
            this.axesHelper.position.set(0, 0, 0);  // 원점으로 복귀
            this.fitCameraToBounds();
        }
        this.controls.update();
    }

    setShowGrid(show) {
        this.showGrid = show;
        this.gridHelper.visible = show;
    }

    fitCameraToBounds() {
        if (!this.bounds) return;
        const centerX = (this.bounds.x_min + this.bounds.x_max) / 2;
        const centerY = (this.bounds.y_min + this.bounds.y_max) / 2;
        const centerZ = (this.bounds.z_min + this.bounds.z_max) / 2;
        const rangeX = this.bounds.x_max - this.bounds.x_min;
        const rangeY = this.bounds.y_max - this.bounds.y_min;
        const rangeZ = this.bounds.z_max - this.bounds.z_min;
        const maxRange = Math.max(rangeX, rangeY, rangeZ);
        const distance = maxRange * 1.5;
        this.camera.position.set(centerX + distance * 0.5, centerY - distance * 0.5, centerZ + distance * 0.5);
        this.controls.target.set(centerX, centerY, centerZ);
        this.controls.update();
    }

    updateGridPosition() {
        if (!this.bounds) return;
        const centerX = (this.bounds.x_min + this.bounds.x_max) / 2;
        const centerY = (this.bounds.y_min + this.bounds.y_max) / 2;
        this.gridHelper.position.set(centerX, centerY, this.bounds.z_min);
    }

    highlightSelection(indices) {
        this.selectedIndices = Array.isArray(indices) ? new Set(indices) : indices;
        this.updateColors();
    }

    clearSelection() {
        this.selectedIndices.clear();
        this.updateColors();
    }

    setLabels(labelsData) {
        Object.keys(this.labels).forEach(type => {
            this.labels[type] = new Set(labelsData[type] || []);
        });
        this.updateColors();
    }

    assignLabel(areaType, indices = null) {
        const targetIndices = indices || this.selectedIndices;
        Object.keys(this.labels).forEach(type => {
            targetIndices.forEach(idx => this.labels[type].delete(idx));
        });
        targetIndices.forEach(idx => this.labels[areaType].add(idx));
        this.updateColors();
    }

    getLabels() {
        const result = {};
        Object.keys(this.labels).forEach(type => {
            result[type] = Array.from(this.labels[type]);
        });
        return result;
    }

    getLabelStats() {
        const stats = {};
        let total = 0;
        Object.keys(this.labels).forEach(type => {
            stats[type] = this.labels[type].size;
            total += this.labels[type].size;
        });
        stats.total = total;
        return stats;
    }

    onMouseMove(event) {
        if (!this.pointCloud || !this.onPointHover) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = this.pointSize * 0.5;
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObject(this.pointCloud);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.onPointHover({ x: point.x.toFixed(2), y: point.y.toFixed(2), z: point.z.toFixed(2) });
        }
    }

    getPointsInScreenRect(rect) {
        const indices = [];
        const canvasRect = this.renderer.domElement.getBoundingClientRect();
        for (let i = 0; i < this.pointCount; i++) {
            const x = this.points[i * 3];
            const y = this.points[i * 3 + 1];
            const z = this.points[i * 3 + 2];
            const vector = new THREE.Vector3(x, y, z);
            vector.project(this.camera);
            const screenX = (vector.x + 1) / 2 * canvasRect.width;
            const screenY = (-vector.y + 1) / 2 * canvasRect.height;
            if (screenX >= rect.x1 && screenX <= rect.x2 && screenY >= rect.y1 && screenY <= rect.y2 && vector.z < 1) {
                indices.push(i);
            }
        }
        return indices;
    }

    getPointsInScreenPolygon(polygon) {
        const indices = [];
        const canvasRect = this.renderer.domElement.getBoundingClientRect();
        for (let i = 0; i < this.pointCount; i++) {
            const x = this.points[i * 3];
            const y = this.points[i * 3 + 1];
            const z = this.points[i * 3 + 2];
            const vector = new THREE.Vector3(x, y, z);
            vector.project(this.camera);
            const screenX = (vector.x + 1) / 2 * canvasRect.width;
            const screenY = (-vector.y + 1) / 2 * canvasRect.height;
            if (this.pointInPolygon(screenX, screenY, polygon) && vector.z < 1) {
                indices.push(i);
            }
        }
        return indices;
    }

    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // === Map Tile Functions (REWRITTEN) ===

    async loadMapTiles() {
        this.clearMapTiles();
        if (!this.coordConverter) {
            console.warn("Cannot load map tiles: Coordinate converter is not initialized.");
            return;
        }

        // Determine zoom level based on bounds size
        const rangeX = this.bounds.x_max - this.bounds.x_min;
        const rangeY = this.bounds.y_max - this.bounds.y_min;
        const maxRange = Math.max(rangeX, rangeY);

        let zoom = 18;
        if (maxRange > 500) zoom = 16;
        else if (maxRange > 200) zoom = 17;
        else if (maxRange > 100) zoom = 18;
        else zoom = 19;
        
        console.log(`Loading map tiles at zoom ${zoom}, max range: ${maxRange.toFixed(0)}m`);
        
        // Convert point cloud bounds from local to GPS
        const swGps = this.coordConverter.localToGps({ x: this.bounds.x_min, y: this.bounds.y_min });
        const neGps = this.coordConverter.localToGps({ x: this.bounds.x_max, y: this.bounds.y_max });

        // Get tile numbers for the bounding box
        const tile1 = this._latLngToTile(swGps.lat, swGps.lng, zoom);
        const tile2 = this._latLngToTile(neGps.lat, neGps.lng, zoom);

        const minTileX = Math.min(tile1.x, tile2.x);
        const maxTileX = Math.max(tile1.x, tile2.x);
        const minTileY = Math.min(tile1.y, tile2.y);
        const maxTileY = Math.max(tile1.y, tile2.y);

        console.log(`Tile range: X[${minTileX}-${maxTileX}], Y[${minTileY}-${maxTileY}]`);

        // Load all tiles within the range
        const textureLoader = new THREE.TextureLoader();
        textureLoader.crossOrigin = 'anonymous';
        const promises = [];

        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
                promises.push(
                    this._loadSingleTile(textureLoader, zoom, tileX, tileY)
                );
            }
        }

        await Promise.all(promises);
        this.showMapTiles = true;
    }

    async _loadSingleTile(textureLoader, zoom, tileX, tileY) {
        // Get tile corner GPS coordinates
        const nwGps = this._tileToLatLng(tileX, tileY, zoom);
        const seGps = this._tileToLatLng(tileX + 1, tileY + 1, zoom);

        // Convert tile corners from GPS to local scene coordinates
        const nwLocal = this.coordConverter.gpsToLocal(nwGps);
        const seLocal = this.coordConverter.gpsToLocal(seGps);
        
        if (!nwLocal || !seLocal) {
            console.warn(`Could not project tile ${zoom}/${tileX}/${tileY}`);
            return;
        }

        const width = Math.abs(seLocal.x - nwLocal.x);
        const height = Math.abs(nwLocal.y - seLocal.y);
        const centerX = (nwLocal.x + seLocal.x) / 2;
        const centerY = (nwLocal.y + seLocal.y) / 2;
        const zPosition = this.bounds.z_min; // Place tiles at the bottom of the point cloud

        // Google Satellite tile URL
        const subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
        const subdomain = subdomains[(tileX + tileY) % 4];
        const url = `https://${subdomain}.google.com/vt/lyrs=s&x=${tileX}&y=${tileY}&z=${zoom}`;

        return new Promise((resolve, reject) => {
            textureLoader.load(
                url,
                (texture) => {
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    const geometry = new THREE.PlaneGeometry(width, height);
                    const material = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: true,
                        opacity: 0.8,
                        side: THREE.DoubleSide
                    });
                    const plane = new THREE.Mesh(geometry, material);
                    plane.position.set(centerX, centerY, zPosition - 0.1);
                    this.scene.add(plane);
                    this.mapTiles.push(plane);
                    resolve();
                },
                undefined,
                (err) => {
                     console.warn(`Failed to load tile ${zoom}/${tileX}/${tileY}:`, err);
                     resolve(); // Resolve anyway so one failed tile doesn't break all
                }
            );
        });
    }

    clearMapTiles() {
        for (const tile of this.mapTiles) {
            this.scene.remove(tile);
            tile.geometry.dispose();
            tile.material.map?.dispose();
            tile.material.dispose();
        }
        this.mapTiles = [];
        this.showMapTiles = false;
    }

    toggleMapTiles(show) {
        this.showMapTiles = show;
        for (const tile of this.mapTiles) {
            tile.visible = show;
        }
    }

    // Standard tile math, kept for internal use in map tile loading
    _latLngToTile(lat, lng, zoom) {
        const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
        const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
        return { x, y };
    }

    _tileToLatLng(tileX, tileY, zoom) {
        const n = Math.pow(2, zoom);
        const lng = tileX / n * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n)));
        const lat = latRad * 180 / Math.PI;
        return { lat, lng };
    }

    dispose() {
        if (this.pointCloud) {
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
            this.scene.remove(this.pointCloud);
        }
        this.renderer.dispose();
        this.controls.dispose();
    }
}

// ============================================
// Point Cloud Labeler
// ============================================
class PointCloudLabeler {
    constructor(scene, selectionCanvasId) {
        this.scene = scene;
        this.canvas = document.getElementById(selectionCanvasId);
        this.ctx = this.canvas.getContext('2d');

        this.selectionMode = null;
        this.isSelecting = false;
        this.additiveMode = false;

        this.selectedIndices = new Set();
        this.startPoint = null;
        this.currentPoint = null;
        this.lassoPoints = [];

        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        this.onSelectionChange = null;
        this.onLabelChange = null;
        this.currentAreaType = 'drivable';

        this.initCanvas();
        this.setupEvents();
    }

    initCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    setupEvents() {
        const container = this.scene.container;
        container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        container.addEventListener('mouseup', (e) => this.onMouseUp(e));
        container.addEventListener('mouseleave', (e) => this.onMouseUp(e));

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
            else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
            else if (e.key === 'Escape') { this.cancelSelection(); }
        });
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;
        this.cancelSelection();
        if (mode) {
            this.scene.container.style.cursor = 'crosshair';
            this.scene.controls.enabled = false;
        } else {
            this.scene.container.style.cursor = 'default';
            this.scene.controls.enabled = true;
        }
    }

    setAdditiveMode(additive) { this.additiveMode = additive; }
    setAreaType(type) { this.currentAreaType = type; }

    onMouseDown(e) {
        if (!this.selectionMode) return;
        const rect = this.canvas.getBoundingClientRect();
        this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this.currentPoint = { ...this.startPoint };
        this.isSelecting = true;
        if (this.selectionMode === 'lasso') this.lassoPoints = [this.startPoint];
        this.scene.controls.enabled = false;
    }

    onMouseMove(e) {
        if (!this.isSelecting) return;
        const rect = this.canvas.getBoundingClientRect();
        this.currentPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (this.selectionMode === 'lasso') this.lassoPoints.push(this.currentPoint);
        this.drawSelection();
    }

    onMouseUp(e) {
        if (!this.isSelecting) return;
        this.isSelecting = false;
        this.completeSelection();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.selectionMode) this.scene.controls.enabled = true;
    }

    drawSelection() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';

        if (this.selectionMode === 'box') {
            const x = Math.min(this.startPoint.x, this.currentPoint.x);
            const y = Math.min(this.startPoint.y, this.currentPoint.y);
            const w = Math.abs(this.currentPoint.x - this.startPoint.x);
            const h = Math.abs(this.currentPoint.y - this.startPoint.y);
            this.ctx.fillRect(x, y, w, h);
            this.ctx.strokeRect(x, y, w, h);
        } else if (this.selectionMode === 'lasso' && this.lassoPoints.length > 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
            for (let i = 1; i < this.lassoPoints.length; i++) {
                this.ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    completeSelection() {
        let newIndices = [];
        if (this.selectionMode === 'box') {
            const rect = {
                x1: Math.min(this.startPoint.x, this.currentPoint.x),
                y1: Math.min(this.startPoint.y, this.currentPoint.y),
                x2: Math.max(this.startPoint.x, this.currentPoint.x),
                y2: Math.max(this.startPoint.y, this.currentPoint.y)
            };
            if (rect.x2 - rect.x1 > 5 && rect.y2 - rect.y1 > 5) {
                newIndices = this.scene.getPointsInScreenRect(rect);
            }
        } else if (this.selectionMode === 'lasso' && this.lassoPoints.length > 2) {
            const simplified = this.simplifyPolygon(this.lassoPoints, 3);
            newIndices = this.scene.getPointsInScreenPolygon(simplified);
        }

        if (this.additiveMode) {
            newIndices.forEach(idx => this.selectedIndices.add(idx));
        } else {
            this.selectedIndices = new Set(newIndices);
        }

        this.scene.highlightSelection(this.selectedIndices);
        if (this.onSelectionChange) this.onSelectionChange(this.selectedIndices.size);
        this.lassoPoints = [];
    }

    simplifyPolygon(points, tolerance) {
        if (points.length <= 2) return points;
        const simplified = [points[0]];
        let lastPoint = points[0];
        for (let i = 1; i < points.length; i++) {
            const dist = Math.sqrt(Math.pow(points[i].x - lastPoint.x, 2) + Math.pow(points[i].y - lastPoint.y, 2));
            if (dist > tolerance) { simplified.push(points[i]); lastPoint = points[i]; }
        }
        return simplified;
    }

    cancelSelection() {
        this.isSelecting = false;
        this.lassoPoints = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    clearSelection() {
        this.selectedIndices.clear();
        this.scene.clearSelection();
        if (this.onSelectionChange) this.onSelectionChange(0);
    }

    getSelectedIndices() { return this.selectedIndices; }

    assignLabel() {
        if (this.selectedIndices.size === 0) return;
        this.saveState();
        this.scene.assignLabel(this.currentAreaType, this.selectedIndices);
        this.clearSelection();
        if (this.onLabelChange) this.onLabelChange();
    }

    saveState() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        const state = {};
        Object.keys(this.scene.labels).forEach(type => { state[type] = new Set(this.scene.labels[type]); });
        this.history.push(state);
        this.historyIndex++;
        if (this.history.length > this.maxHistory) { this.history.shift(); this.historyIndex--; }
    }

    restoreState(state) {
        Object.keys(this.scene.labels).forEach(type => { this.scene.labels[type] = new Set(state[type] || []); });
        this.scene.updateColors();
        if (this.onLabelChange) this.onLabelChange();
    }

    undo() {
        if (!this.canUndo()) return;
        this.historyIndex--;
        if (this.historyIndex >= 0) {
            this.restoreState(this.history[this.historyIndex]);
        } else {
            Object.keys(this.scene.labels).forEach(type => { this.scene.labels[type].clear(); });
            this.scene.updateColors();
            if (this.onLabelChange) this.onLabelChange();
        }
    }

    redo() {
        if (!this.canRedo()) return;
        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
    }

    canUndo() { return this.historyIndex >= 0; }
    canRedo() { return this.historyIndex < this.history.length - 1; }
    resetHistory() { this.history = []; this.historyIndex = -1; }
    getLabels() { return this.scene.getLabels(); }
    setLabels(labels) { this.scene.setLabels(labels); this.resetHistory(); }
}

// ============================================
// Point Cloud Editor (Main App)
// ============================================
class PointCloudEditor {
    constructor() {
        this.scene = null;
        this.labeler = null;
        this.coordConverter = null; // New property
        this.currentPcId = null;
        this.currentBagId = null;
        this.currentPcInfo = null;
        this.hasUnsavedChanges = false;
        this.autoSaveInterval = null;
        this.api = new PointCloudAPI();
        this.showMapTilesEnabled = false;
        this.framePreviewEnabled = false;

        // Frame-based mode
        this.isFrameMode = false;
        this.frames = [];
        this.currentFrameId = 0;
        this.frameMetadata = null;
    }

    async init() {
        this.scene = new PointCloudScene('threeContainer');
        this.labeler = new PointCloudLabeler(this.scene, 'selectionCanvas');
        this.setupCallbacks();
        this.setupUIHandlers();
        await this.refreshBagList();
        await this.refreshPointCloudList();
        console.log('Point Cloud Editor initialized');
    }

    setupCallbacks() {
        this.scene.onPointHover = (coords) => {
            document.getElementById('coordDisplay').textContent = `X: ${coords.x} Y: ${coords.y} Z: ${coords.z}`;
        };
        this.labeler.onSelectionChange = (count) => {
            document.getElementById('info-selected').textContent = count;
            document.getElementById('assignLabelBtn').disabled = count === 0;
        };
        this.labeler.onLabelChange = () => {
            this.updateLabelStats();
            this.updateHistoryButtons();
            this.hasUnsavedChanges = true;
        };
    }

    setupUIHandlers() {
        // Upload
        document.getElementById('uploadBagBtn').addEventListener('click', () => this.showUploadModal());
        document.getElementById('closeUploadModal').addEventListener('click', () => this.hideUploadModal());
        document.getElementById('selectFileBtn').addEventListener('click', () => document.getElementById('bagFileInput').click());
        document.getElementById('bagFileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.uploadBag(e.target.files[0]);
        });

        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.uploadBag(e.dataTransfer.files[0]);
        });

        // Bag selection
        document.getElementById('refreshBagsBtn').addEventListener('click', () => this.refreshBagList());
        document.getElementById('bagSelect').addEventListener('change', (e) => {
            this.currentBagId = e.target.value;
            document.getElementById('processBtn').disabled = !this.currentBagId;
            if (this.currentBagId) this.loadBagInfo(this.currentBagId);
        });
        document.getElementById('processBtn').addEventListener('click', () => this.processBag());

        // Point cloud
        document.getElementById('refreshPcBtn').addEventListener('click', () => this.refreshPointCloudList());
        document.getElementById('pcSelect').addEventListener('change', (e) => {
            document.getElementById('loadPcBtn').disabled = !e.target.value;
        });
        document.getElementById('loadPcBtn').addEventListener('click', () => {
            const pcId = document.getElementById('pcSelect').value;
            if (pcId) this.loadPointCloud(pcId);
        });

        // View
        document.getElementById('view3DBtn').addEventListener('click', () => this.setViewMode('3d'));
        document.getElementById('viewBEVBtn').addEventListener('click', () => this.setViewMode('bev'));
        document.getElementById('pointSize').addEventListener('input', (e) => {
            const size = parseFloat(e.target.value);
            document.getElementById('pointSizeValue').textContent = size.toFixed(1);
            this.scene.setPointSize(size);
        });
        document.getElementById('colorMode').addEventListener('change', (e) => this.scene.setColorMode(e.target.value));
        document.getElementById('showGrid').addEventListener('change', (e) => this.scene.setShowGrid(e.target.checked));
        document.getElementById('showMapTiles').addEventListener('change', (e) => this.toggleMapTiles(e.target.checked));

        // Selection
        document.getElementById('boxSelectBtn').addEventListener('click', () => this.setSelectionMode('box'));
        document.getElementById('lassoSelectBtn').addEventListener('click', () => this.setSelectionMode('lasso'));
        document.getElementById('additiveSelect').addEventListener('change', (e) => this.labeler.setAdditiveMode(e.target.checked));
        document.getElementById('clearSelectionBtn').addEventListener('click', () => this.labeler.clearSelection());

        // Area type
        document.querySelectorAll('.btn-area-type').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-area-type').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.labeler.setAreaType(btn.dataset.type);
            });
        });
        document.getElementById('assignLabelBtn').addEventListener('click', () => this.labeler.assignLabel());

        // History
        document.getElementById('undoBtn').addEventListener('click', () => { this.labeler.undo(); this.updateHistoryButtons(); });
        document.getElementById('redoBtn').addEventListener('click', () => { this.labeler.redo(); this.updateHistoryButtons(); });

        // Polygon & Export
        document.getElementById('generatePolygonsBtn').addEventListener('click', () => this.generatePolygons());
        document.getElementById('exportSemanticBtn').addEventListener('click', () => this.exportToSemantic());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportToSemantic());

        // Frame navigation
        const prevBtn = document.getElementById('prevFrameBtn');
        const nextBtn = document.getElementById('nextFrameBtn');
        const previewEnabled = this.framePreviewEnabled;
        const frameSlider = document.getElementById('frameSlider');
        const mergeBtn = document.getElementById('mergeFramesBtn');
        const framePreviewToggle = document.getElementById('framePreviewToggle');

        if (prevBtn) prevBtn.addEventListener('click', () => this.prevFrame());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextFrame());
        if (frameSlider) frameSlider.addEventListener('input', (e) => this.loadFrame(parseInt(e.target.value)));
        if (mergeBtn) mergeBtn.addEventListener('click', () => this.mergeAndExport());
        if (framePreviewToggle) framePreviewToggle.addEventListener('change', (e) => this.toggleFramePreview(e.target.checked));

        // Keyboard shortcuts for frame navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isFrameMode) return;
            if (e.key === 'ArrowLeft' && !e.ctrlKey) this.prevFrame();
            if (e.key === 'ArrowRight' && !e.ctrlKey) this.nextFrame();
        });
    }

    showUploadModal() { document.getElementById('uploadModal').classList.add('show'); }
    hideUploadModal() {
        document.getElementById('uploadModal').classList.remove('show');
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadArea').style.display = 'block';
    }

    async refreshBagList() {
        try {
            const bags = await this.api.listBags();
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
        }
    }

    async loadBagInfo(bagId) {
        try {
            const info = await this.api.getBagInfo(bagId);
            document.getElementById('bagStatus').innerHTML = `<strong>${info.filename}</strong><br>Duration: ${info.duration_sec.toFixed(1)}s<br>Topics: ${info.topics.length}`;
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
            const result = await this.api.uploadBag(file, (percent) => {
                progressFill.style.width = `${percent * 100}%`;
                progressText.textContent = `Uploading... ${Math.round(percent * 100)}%`;
            });
            progressText.textContent = 'Upload complete!';
            await this.refreshBagList();
            document.getElementById('bagSelect').value = result.bag_id;
            this.currentBagId = result.bag_id;
            document.getElementById('processBtn').disabled = false;
            setTimeout(() => this.hideUploadModal(), 1000);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed: ' + error.message);
            uploadArea.style.display = 'block';
            progress.style.display = 'none';
        }
    }

    async processBag() {
        if (!this.currentBagId) return;
        const options = {
            bag_id: this.currentBagId,
            lidar_topic: document.getElementById('lidarTopic').value,
            gps_topic: document.getElementById('gpsTopic').value,
            odom_topic: document.getElementById('odomTopic').value || null,
            offset_x: parseFloat(document.getElementById('offsetX').value) || 0,
            offset_y: parseFloat(document.getElementById('offsetY').value) || 0
        };

        const progressContainer = document.getElementById('processProgress');
        const progressFill = progressContainer.querySelector('.progress-fill');
        const progressText = progressContainer.querySelector('.progress-text');

        progressContainer.style.display = 'block';
        document.getElementById('processBtn').disabled = true;

        try {
            const { job_id } = await this.api.processBag(options);
            const result = await this.api.waitForJob(job_id, (status) => {
                progressFill.style.width = `${status.progress * 100}%`;
                progressText.textContent = status.message;
            });

            if (result.status === 'completed') {
                progressText.textContent = 'Processing complete!';
                await this.refreshPointCloudList();
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
            setTimeout(() => { progressContainer.style.display = 'none'; }, 2000);
        }
    }

    async refreshPointCloudList() {
        try {
            const pcs = await this.api.listPointClouds();
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
            if (this.hasUnsavedChanges && !confirm('You have unsaved changes. Load new point cloud anyway?')) return;
            
            this.coordConverter = null; // Reset converter
            const mapTilesCheckbox = document.getElementById('showMapTiles');
            mapTilesCheckbox.disabled = true;

            const info = await this.api.getPointCloudInfo(pcId);
            this.currentPcId = pcId;
            this.currentPcInfo = info;

            // Defensive check and converter initialization
            if (info.gps_origin && info.gps_origin.utm_zone) {
                try {
                    this.coordConverter = new CoordConverter(info.gps_origin);
                    mapTilesCheckbox.disabled = false;
                } catch (e) {
                    console.error("Failed to initialize coordinate converter:", e.message);
                    alert("Could not initialize coordinate converter. Map tile functionality will be disabled.");
                }
            } else {
                console.warn("GPS origin or UTM zone not provided. Map tile functionality is disabled.");
            }
            if (!this.coordConverter) {
                this.showMapTilesEnabled = false;
                mapTilesCheckbox.checked = false;
            } else {
                mapTilesCheckbox.checked = this.showMapTilesEnabled;
            }

            // Check if frame-based
            if (info.mode === 'frame_based') {
                this.frameMetadata = info;
                this.frames = info.frames || [];
                this.currentFrameId = 0;
                this.showFrameNavigation();
                this.updateFrameInfo();
                const framePreviewToggle = document.getElementById('framePreviewToggle');
                if (framePreviewToggle) framePreviewToggle.checked = false;
                this.framePreviewEnabled = false;
                await this.api.mergeFrames(pcId);
                const data = await this.api.downloadPointCloud(pcId);
                this.scene.loadPointCloud(data, info, this.coordConverter);
                const labels = await this.api.getLabels(pcId);
                this.labeler.setLabels(labels.labels);
                this.isFrameMode = false;
                this.setLabelingEnabled(true);
            } else {
                // Legacy: load entire point cloud
                const data = await this.api.downloadPointCloud(pcId);
                this.scene.loadPointCloud(data, info, this.coordConverter);
                const labels = await this.api.getLabels(pcId);
                this.labeler.setLabels(labels.labels);
                this.isFrameMode = false;
                this.hideFrameNavigation();
                const framePreviewToggle = document.getElementById('framePreviewToggle');
                if (framePreviewToggle) framePreviewToggle.checked = false;
                this.framePreviewEnabled = false;
                if (this.showMapTilesEnabled && this.coordConverter) {
                    await this.scene.loadMapTiles();
                }
                this.setLabelingEnabled(true);
            }

            this.hasUnsavedChanges = false;
            this.updatePointCloudInfo(info);
            this.updateLabelStats();
            this.enableEditing();
            this.startAutoSave();

            console.log(`Loaded point cloud: ${pcId}`);
        } catch (error) {
            console.error('Failed to load point cloud:', error);
            alert('Failed to load point cloud: ' + error.message);
        }
    }

    async loadFrameBasedPointCloud(pcId, info) {
        this.isFrameMode = true;
        this.frameMetadata = info;
        this.frames = info.frames || [];
        this.currentFrameId = 0;

        if (this.frames.length === 0) {
            alert('No frames found in this point cloud');
            return;
        }

        this.showFrameNavigation();
        this.updateFrameInfo();
        await this.loadFrame(0);
    }

    async loadFrame(frameId) {
        if (!this.currentPcId || !this.isFrameMode) return;

        try {
            // Save current frame labels before switching
            if (!this.framePreviewEnabled && this.hasUnsavedChanges && this.currentFrameId !== frameId) {
                await this.saveCurrentFrameLabels();
            }

            // Load frame data
            const data = await this.api.downloadFrame(this.currentPcId, frameId);

            // Create metadata for this frame
            const frame = this.frames[frameId];
            const frameMeta = {
                ...this.frameMetadata,
                bounds: frame.bounds,
                downsampled_points: frame.point_count
            };

            this.scene.loadPointCloud(data, frameMeta, this.coordConverter);
            if (this.showMapTilesEnabled && this.coordConverter) {
                await this.scene.loadMapTiles();
            }

            // Load frame labels
            if (!this.framePreviewEnabled) {
                const labelsResult = await this.api.getFrameLabels(this.currentPcId, frameId);
                this.labeler.setLabels(labelsResult.labels);
            }

            this.currentFrameId = frameId;
            this.hasUnsavedChanges = false;
            this.updateFrameInfo();
            this.updateLabelStats();

            console.log(`Loaded frame ${frameId}`);
        } catch (error) {
            console.error('Failed to load frame:', error);
            alert('Failed to load frame: ' + error.message);
        }
    }

    async saveCurrentFrameLabels() {
        if (!this.currentPcId || !this.isFrameMode) return;
        try {
            const labels = this.labeler.getLabels();
            await this.api.saveFrameLabels(this.currentPcId, this.currentFrameId, labels);
            this.hasUnsavedChanges = false;
            console.log(`Frame ${this.currentFrameId} labels saved`);
        } catch (error) {
            console.error('Failed to save frame labels:', error);
        }
    }

    async prevFrame() {
        if (this.currentFrameId > 0) {
            await this.loadFrame(this.currentFrameId - 1);
        }
    }

    async nextFrame() {
        if (this.currentFrameId < this.frames.length - 1) {
            await this.loadFrame(this.currentFrameId + 1);
        }
    }

    showFrameNavigation() {
        const nav = document.getElementById('frameNavigation');
        if (nav) nav.style.display = 'block';
    }

    hideFrameNavigation() {
        const nav = document.getElementById('frameNavigation');
        if (nav) nav.style.display = 'none';
    }

    updateFrameInfo() {
        const frameCounter = document.getElementById('frameCounter');
        const frameSlider = document.getElementById('frameSlider');
        const prevBtn = document.getElementById('prevFrameBtn');
        const nextBtn = document.getElementById('nextFrameBtn');
        const previewEnabled = this.framePreviewEnabled;

        if (frameCounter) {
            frameCounter.textContent = `Frame ${this.currentFrameId + 1} / ${this.frames.length}`;
        }
        if (frameSlider) {
            frameSlider.max = this.frames.length - 1;
            frameSlider.value = this.currentFrameId;
            frameSlider.disabled = !previewEnabled;
        }
        if (prevBtn) {
            prevBtn.disabled = !previewEnabled || this.currentFrameId <= 0;
        }
        if (nextBtn) {
            nextBtn.disabled = !previewEnabled || this.currentFrameId >= this.frames.length - 1;
        }

        // Update GPS info for current frame
        const frame = this.frames[this.currentFrameId];
        if (frame && frame.gps) {
            document.getElementById('info-lat').textContent = frame.gps.lat.toFixed(6);
            document.getElementById('info-lng').textContent = frame.gps.lng.toFixed(6);
        }
    }

    async mergeAndExport() {
        if (!this.currentPcId || !this.isFrameMode) return;

        try {
            // Save current frame first
            await this.saveCurrentFrameLabels();

            // Merge all frames
            const mergeResult = await this.api.mergeFrames(this.currentPcId);
            console.log('Merge result:', mergeResult);

            alert(`Frames merged!\n\nTotal points: ${mergeResult.total_points.toLocaleString()}\n\nYou can now export to Semantic Map.`);
        } catch (error) {
            console.error('Failed to merge frames:', error);
            alert('Failed to merge frames: ' + error.message);
        }
    }

    updatePointCloudInfo(info) {
        document.getElementById('info-total').textContent = info.total_points.toLocaleString();

        if (info.mode === 'frame_based') {
            document.getElementById('info-displayed').textContent = `${info.total_frames} frames`;
        } else {
            document.getElementById('info-displayed').textContent = (info.downsampled_points || info.total_points).toLocaleString();
        }

        if (info.gps_origin) {
            document.getElementById('info-lat').textContent = info.gps_origin.lat.toFixed(6);
            document.getElementById('info-lng').textContent = info.gps_origin.lng.toFixed(6);
            document.getElementById('info-zone').textContent = info.gps_origin.utm_zone;
        }
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

    async toggleMapTiles(show) {
        this.showMapTilesEnabled = show;
        if (show && this.scene.mapTiles.length === 0) {
            if (!this.coordConverter) {
                alert("Cannot load map tiles: GPS origin information is missing or invalid.");
                document.getElementById('showMapTiles').checked = false;
                this.showMapTilesEnabled = false;
                return;
            }
            try {
                await this.scene.loadMapTiles();
                console.log('Map tiles loaded');
            } catch (error) {
                console.error('Failed to load map tiles:', error);
                alert('Failed to load map tiles: ' + error.message);
                document.getElementById('showMapTiles').checked = false;
            }
        } else {
            this.scene.toggleMapTiles(show);
        }
    }

    startAutoSave() {
        if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
        this.autoSaveInterval = setInterval(() => {
            if (this.hasUnsavedChanges && this.currentPcId) this.saveLabels();
        }, 30000);
    }

    async saveLabels() {
        if (!this.currentPcId) return;
        try {
            if (this.isFrameMode) {
                await this.saveCurrentFrameLabels();
            } else {
                const labels = this.labeler.getLabels();
                await this.api.saveLabels(this.currentPcId, labels);
                this.hasUnsavedChanges = false;
                console.log('Labels saved');
            }
        } catch (error) {
            console.error('Failed to save labels:', error);
        }
    }

    async generatePolygons() {
        if (!this.currentPcId) return;
        await this.saveLabels();

        // Frame-based mode: merge first
        if (this.isFrameMode) {
            try {
                await this.api.mergeFrames(this.currentPcId);
                console.log('Frames merged for polygon generation');
            } catch (error) {
                console.error('Failed to merge frames:', error);
                alert('Failed to merge frames: ' + error.message);
                return;
            }
        }

        const options = {
            alpha: parseFloat(document.getElementById('alphaParam').value) || 2.0,
            simplify_tolerance: parseFloat(document.getElementById('simplifyParam').value) || 0.5
        };

        try {
            const result = await this.api.generatePolygons(this.currentPcId, options);
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
                        <span>${p.area_sqm.toFixed(1)} m2</span>
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
        const colors = { drivable: '#4CAF50', crosswalk: '#FF9800', sidewalk: '#9E9E9E', no_entry: '#F44336', plaza: '#2196F3' };
        return colors[type] || '#888888';
    }

    setLabelingEnabled(enabled) {
        document.querySelectorAll('.btn-area-type').forEach(btn => btn.disabled = !enabled);
        document.getElementById('assignLabelBtn').disabled = !enabled;
        document.getElementById('boxSelectBtn').disabled = !enabled;
        document.getElementById('lassoSelectBtn').disabled = !enabled;
        document.getElementById('additiveSelect').disabled = !enabled;
        document.getElementById('clearSelectionBtn').disabled = !enabled;
        document.getElementById('undoBtn').disabled = !enabled;
        document.getElementById('redoBtn').disabled = !enabled;
        document.getElementById('generatePolygonsBtn').disabled = !enabled;
        document.getElementById('exportSemanticBtn').disabled = !enabled;
        document.getElementById('exportBtn').disabled = !enabled;
    }

    async toggleFramePreview(enabled) {
        if (!this.currentPcId || !this.frameMetadata) return;
        this.framePreviewEnabled = enabled;
        if (enabled) {
            this.setLabelingEnabled(false);
            this.isFrameMode = true;
            const targetFrame = this.currentFrameId ?? 0;
            this.updateFrameInfo();
            await this.loadFrame(targetFrame);
        } else {
            this.isFrameMode = false;
            this.setLabelingEnabled(true);
            this.updateFrameInfo();
            if (this.currentPcInfo) {
                const data = await this.api.downloadPointCloud(this.currentPcId);
                this.scene.loadPointCloud(data, this.currentPcInfo, this.coordConverter);
                const labels = await this.api.getLabels(this.currentPcId);
                this.labeler.setLabels(labels.labels);
                if (this.showMapTilesEnabled && this.coordConverter) {
                    await this.scene.loadMapTiles();
                }
            }
        }
    }

    async exportToSemantic() {
        if (!this.currentPcId) return;
        const mapName = document.getElementById('exportMapName').value || 'Untitled Map';
        const filename = document.getElementById('exportFilename').value || `map_${Date.now()}.json`;

        try {
            // Save current labels
            await this.saveLabels();

            // If frame mode, merge first
            if (this.isFrameMode) {
                const mergeResult = await this.api.mergeFrames(this.currentPcId);
                console.log('Merged for export:', mergeResult);
            }

            const result = await this.api.exportToSemantic(this.currentPcId, { map_name: mapName, filename: filename });
            alert(`Exported successfully!\n\nFile: ${result.filename}\nAreas: ${result.area_count}\n\nYou can now open it in Semantic Editor.`);
        } catch (error) {
            console.error('Failed to export:', error);
            alert('Failed to export: ' + error.message);
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    window.pointCloudApp = new PointCloudEditor();
    await window.pointCloudApp.init();
});
