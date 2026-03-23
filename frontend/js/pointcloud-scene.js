/**
 * Point Cloud Scene - Three.js 3D visualization
 */
class PointCloudScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.pointCloud = null;
        this.gridHelper = null;

        // Point data
        this.points = null;          // Float32Array of positions (x,y,z,x,y,z,...)
        this.pointCount = 0;
        this.bounds = null;
        this.metadata = null;

        // View settings
        this.viewMode = '3d';        // '3d' or 'bev'
        this.pointSize = 2;
        this.colorMode = 'height';   // 'height' or 'label'
        this.showGrid = true;

        // Selection
        this.selectedIndices = new Set();
        this.highlightColor = new THREE.Color(1, 1, 0);  // Yellow for selection

        // Label colors (matching existing area types)
        this.labelColors = {
            unlabeled: new THREE.Color(0.5, 0.5, 0.5),
            drivable: new THREE.Color(0.298, 0.686, 0.314),    // #4CAF50
            crosswalk: new THREE.Color(1.0, 0.596, 0.0),       // #FF9800
            sidewalk: new THREE.Color(0.620, 0.620, 0.620),    // #9E9E9E
            no_entry: new THREE.Color(0.957, 0.263, 0.212),    // #F44336
            plaza: new THREE.Color(0.129, 0.588, 0.953)        // #2196F3
        };

        // Labels data
        this.labels = {
            drivable: new Set(),
            crosswalk: new Set(),
            sidewalk: new Set(),
            no_entry: new Set(),
            plaza: new Set()
        };

        // Callbacks
        this.onPointHover = null;

        this.initScene();
    }

    initScene() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            10000
        );
        this.camera.position.set(0, 100, 100);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 5000;

        // Grid helper
        this.gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x333333);
        this.gridHelper.rotation.x = Math.PI / 2;  // XY plane
        this.scene.add(this.gridHelper);

        // Axes helper
        this.axesHelper = new THREE.AxesHelper(20);
        this.scene.add(this.axesHelper);

        // Lighting (for potential future use)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Animation loop
        this.animate();

        // Resize handler
        window.addEventListener('resize', () => this.resize());

        // Mouse move for coordinate display
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

    /**
     * Load point cloud from binary data
     * @param {ArrayBuffer} binaryData - Float32 array of x,y,z coordinates
     * @param {Object} metadata - Point cloud metadata
     */
    loadPointCloud(binaryData, metadata) {
        // Remove existing point cloud
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
        }

        // Parse binary data
        this.points = new Float32Array(binaryData);
        this.pointCount = this.points.length / 3;
        this.metadata = metadata;

        console.log(`Loading ${this.pointCount} points`);

        // Store bounds
        this.bounds = metadata.bounds;

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));

        // Initialize colors
        const colors = new Float32Array(this.pointCount * 3);
        this.updateColors(colors);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Material with point size
        const material = new THREE.PointsMaterial({
            size: this.pointSize,
            vertexColors: true,
            sizeAttenuation: true
        });

        this.pointCloud = new THREE.Points(geometry, material);
        this.scene.add(this.pointCloud);

        // Reset labels
        Object.keys(this.labels).forEach(key => this.labels[key].clear());
        this.selectedIndices.clear();

        // Fit camera to bounds
        this.fitCameraToBounds();

        // Update grid position
        this.updateGridPosition();
    }

    /**
     * Update point colors based on color mode
     * @param {Float32Array} colors - Color array to fill (optional)
     */
    updateColors(colors = null) {
        if (!this.pointCloud && !colors) return;

        if (!colors) {
            colors = this.pointCloud.geometry.attributes.color.array;
        }

        for (let i = 0; i < this.pointCount; i++) {
            let color;

            // Check if selected
            if (this.selectedIndices.has(i)) {
                color = this.highlightColor;
            }
            // Check if labeled
            else if (this.colorMode === 'label') {
                color = this.getPointLabelColor(i);
            }
            // Color by height
            else {
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

    /**
     * Get the label color for a point
     * @param {number} index - Point index
     * @returns {THREE.Color}
     */
    getPointLabelColor(index) {
        for (const [type, indices] of Object.entries(this.labels)) {
            if (indices.has(index)) {
                return this.labelColors[type];
            }
        }
        return this.labelColors.unlabeled;
    }

    /**
     * Set point size
     * @param {number} size - Point size
     */
    setPointSize(size) {
        this.pointSize = size;
        if (this.pointCloud) {
            this.pointCloud.material.size = size;
        }
    }

    /**
     * Set color mode
     * @param {string} mode - 'height' or 'label'
     */
    setColorMode(mode) {
        this.colorMode = mode;
        this.updateColors();
    }

    /**
     * Set view mode
     * @param {string} mode - '3d' or 'bev'
     */
    setViewMode(mode) {
        this.viewMode = mode;

        if (mode === 'bev') {
            // Bird's Eye View: camera directly above, looking down
            const centerX = (this.bounds.x_min + this.bounds.x_max) / 2;
            const centerY = (this.bounds.y_min + this.bounds.y_max) / 2;
            const maxRange = Math.max(
                this.bounds.x_max - this.bounds.x_min,
                this.bounds.y_max - this.bounds.y_min
            );

            this.camera.position.set(centerX, centerY, maxRange * 1.2);
            this.camera.up.set(0, 1, 0);
            this.controls.target.set(centerX, centerY, 0);

            // Restrict rotation for BEV
            this.controls.minPolarAngle = 0;
            this.controls.maxPolarAngle = 0;
            this.controls.enableRotate = false;
        } else {
            // 3D view: restore free rotation
            this.controls.minPolarAngle = 0;
            this.controls.maxPolarAngle = Math.PI;
            this.controls.enableRotate = true;

            // Reset to 3D perspective
            this.fitCameraToBounds();
        }

        this.controls.update();
    }

    /**
     * Toggle grid visibility
     * @param {boolean} show
     */
    setShowGrid(show) {
        this.showGrid = show;
        this.gridHelper.visible = show;
    }

    /**
     * Fit camera to point cloud bounds
     */
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

        this.camera.position.set(
            centerX + distance * 0.5,
            centerY - distance * 0.5,
            centerZ + distance * 0.5
        );

        this.controls.target.set(centerX, centerY, centerZ);
        this.controls.update();
    }

    /**
     * Update grid position to match point cloud center
     */
    updateGridPosition() {
        if (!this.bounds) return;

        const centerX = (this.bounds.x_min + this.bounds.x_max) / 2;
        const centerY = (this.bounds.y_min + this.bounds.y_max) / 2;

        this.gridHelper.position.set(centerX, centerY, this.bounds.z_min);
    }

    /**
     * Highlight selected points
     * @param {Set|Array} indices - Point indices to highlight
     */
    highlightSelection(indices) {
        if (Array.isArray(indices)) {
            this.selectedIndices = new Set(indices);
        } else {
            this.selectedIndices = indices;
        }
        this.updateColors();
    }

    /**
     * Clear selection highlight
     */
    clearSelection() {
        this.selectedIndices.clear();
        this.updateColors();
    }

    /**
     * Set labels from loaded data
     * @param {Object} labelsData - Labels object
     */
    setLabels(labelsData) {
        Object.keys(this.labels).forEach(type => {
            this.labels[type] = new Set(labelsData[type] || []);
        });
        this.updateColors();
    }

    /**
     * Assign label to selected points
     * @param {string} areaType - Area type
     * @param {Set|Array} indices - Point indices (defaults to selected)
     */
    assignLabel(areaType, indices = null) {
        const targetIndices = indices || this.selectedIndices;

        // Remove from all other labels
        Object.keys(this.labels).forEach(type => {
            targetIndices.forEach(idx => this.labels[type].delete(idx));
        });

        // Add to new label
        targetIndices.forEach(idx => this.labels[areaType].add(idx));

        this.updateColors();
    }

    /**
     * Get current labels
     * @returns {Object} Labels with arrays
     */
    getLabels() {
        const result = {};
        Object.keys(this.labels).forEach(type => {
            result[type] = Array.from(this.labels[type]);
        });
        return result;
    }

    /**
     * Get label statistics
     * @returns {Object} Count per label type
     */
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

    /**
     * Mouse move handler for coordinate display
     */
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
            this.onPointHover({
                x: point.x.toFixed(2),
                y: point.y.toFixed(2),
                z: point.z.toFixed(2)
            });
        }
    }

    /**
     * Get points within a 2D screen rectangle
     * @param {Object} rect - {x1, y1, x2, y2} in screen coordinates
     * @returns {number[]} Array of point indices
     */
    getPointsInScreenRect(rect) {
        const indices = [];
        const canvasRect = this.renderer.domElement.getBoundingClientRect();

        for (let i = 0; i < this.pointCount; i++) {
            const x = this.points[i * 3];
            const y = this.points[i * 3 + 1];
            const z = this.points[i * 3 + 2];

            // Project to screen
            const vector = new THREE.Vector3(x, y, z);
            vector.project(this.camera);

            const screenX = (vector.x + 1) / 2 * canvasRect.width;
            const screenY = (-vector.y + 1) / 2 * canvasRect.height;

            // Check if in rectangle
            if (screenX >= rect.x1 && screenX <= rect.x2 &&
                screenY >= rect.y1 && screenY <= rect.y2 &&
                vector.z < 1) {  // Only visible points (in front of camera)
                indices.push(i);
            }
        }

        return indices;
    }

    /**
     * Get points within a 2D screen polygon
     * @param {Array} polygon - Array of {x, y} points in screen coordinates
     * @returns {number[]} Array of point indices
     */
    getPointsInScreenPolygon(polygon) {
        const indices = [];
        const canvasRect = this.renderer.domElement.getBoundingClientRect();

        for (let i = 0; i < this.pointCount; i++) {
            const x = this.points[i * 3];
            const y = this.points[i * 3 + 1];
            const z = this.points[i * 3 + 2];

            // Project to screen
            const vector = new THREE.Vector3(x, y, z);
            vector.project(this.camera);

            const screenX = (vector.x + 1) / 2 * canvasRect.width;
            const screenY = (-vector.y + 1) / 2 * canvasRect.height;

            // Check if in polygon
            if (this.pointInPolygon(screenX, screenY, polygon) && vector.z < 1) {
                indices.push(i);
            }
        }

        return indices;
    }

    /**
     * Check if point is inside polygon (ray casting algorithm)
     */
    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Dispose of all resources
     */
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
