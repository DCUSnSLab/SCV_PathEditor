/**
 * Point Cloud Labeler - Selection tools and label management
 */
class PointCloudLabeler {
    constructor(scene, selectionCanvasId) {
        this.scene = scene;
        this.canvas = document.getElementById(selectionCanvasId);
        this.ctx = this.canvas.getContext('2d');

        // Selection mode: null, 'box', 'lasso'
        this.selectionMode = null;
        this.isSelecting = false;
        this.additiveMode = false;

        // Selection data
        this.selectedIndices = new Set();
        this.startPoint = null;
        this.currentPoint = null;
        this.lassoPoints = [];

        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        // Callbacks
        this.onSelectionChange = null;
        this.onLabelChange = null;

        // Area types
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                this.redo();
            } else if (e.key === 'Escape') {
                this.cancelSelection();
            }
        });
    }

    /**
     * Set selection mode
     * @param {string|null} mode - 'box', 'lasso', or null
     */
    setSelectionMode(mode) {
        this.selectionMode = mode;
        this.cancelSelection();

        // Update cursor
        if (mode) {
            this.scene.container.style.cursor = 'crosshair';
            this.scene.controls.enabled = false;
        } else {
            this.scene.container.style.cursor = 'default';
            this.scene.controls.enabled = true;
        }
    }

    /**
     * Set additive mode
     * @param {boolean} additive
     */
    setAdditiveMode(additive) {
        this.additiveMode = additive;
    }

    /**
     * Set current area type for labeling
     * @param {string} type
     */
    setAreaType(type) {
        this.currentAreaType = type;
    }

    onMouseDown(e) {
        if (!this.selectionMode) return;

        const rect = this.canvas.getBoundingClientRect();
        this.startPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.currentPoint = { ...this.startPoint };
        this.isSelecting = true;

        if (this.selectionMode === 'lasso') {
            this.lassoPoints = [this.startPoint];
        }

        // Disable orbit controls during selection
        this.scene.controls.enabled = false;
    }

    onMouseMove(e) {
        if (!this.isSelecting) return;

        const rect = this.canvas.getBoundingClientRect();
        this.currentPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        if (this.selectionMode === 'lasso') {
            this.lassoPoints.push(this.currentPoint);
        }

        this.drawSelection();
    }

    onMouseUp(e) {
        if (!this.isSelecting) return;

        this.isSelecting = false;

        // Complete selection
        this.completeSelection();

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Re-enable controls if no selection mode
        if (!this.selectionMode) {
            this.scene.controls.enabled = true;
        }
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

            // Minimum selection size
            if (rect.x2 - rect.x1 > 5 && rect.y2 - rect.y1 > 5) {
                newIndices = this.scene.getPointsInScreenRect(rect);
            }
        } else if (this.selectionMode === 'lasso' && this.lassoPoints.length > 2) {
            // Simplify lasso points for performance
            const simplified = this.simplifyPolygon(this.lassoPoints, 3);
            newIndices = this.scene.getPointsInScreenPolygon(simplified);
        }

        // Update selection
        if (this.additiveMode) {
            newIndices.forEach(idx => this.selectedIndices.add(idx));
        } else {
            this.selectedIndices = new Set(newIndices);
        }

        // Update visualization
        this.scene.highlightSelection(this.selectedIndices);

        // Callback
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedIndices.size);
        }

        // Reset lasso
        this.lassoPoints = [];
    }

    /**
     * Simplify polygon using Douglas-Peucker-like approach
     */
    simplifyPolygon(points, tolerance) {
        if (points.length <= 2) return points;

        const simplified = [points[0]];
        let lastPoint = points[0];

        for (let i = 1; i < points.length; i++) {
            const dist = Math.sqrt(
                Math.pow(points[i].x - lastPoint.x, 2) +
                Math.pow(points[i].y - lastPoint.y, 2)
            );
            if (dist > tolerance) {
                simplified.push(points[i]);
                lastPoint = points[i];
            }
        }

        return simplified;
    }

    cancelSelection() {
        this.isSelecting = false;
        this.lassoPoints = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Clear current selection
     */
    clearSelection() {
        this.selectedIndices.clear();
        this.scene.clearSelection();

        if (this.onSelectionChange) {
            this.onSelectionChange(0);
        }
    }

    /**
     * Get selected indices
     * @returns {Set}
     */
    getSelectedIndices() {
        return this.selectedIndices;
    }

    /**
     * Assign label to selected points
     */
    assignLabel() {
        if (this.selectedIndices.size === 0) return;

        // Save state for undo
        this.saveState();

        // Assign label in scene
        this.scene.assignLabel(this.currentAreaType, this.selectedIndices);

        // Clear selection
        this.clearSelection();

        // Callback
        if (this.onLabelChange) {
            this.onLabelChange();
        }
    }

    /**
     * Save current state for undo
     */
    saveState() {
        // Remove any redo states
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Deep copy labels
        const state = {};
        Object.keys(this.scene.labels).forEach(type => {
            state[type] = new Set(this.scene.labels[type]);
        });

        this.history.push(state);
        this.historyIndex++;

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    /**
     * Restore a saved state
     */
    restoreState(state) {
        Object.keys(this.scene.labels).forEach(type => {
            this.scene.labels[type] = new Set(state[type] || []);
        });
        this.scene.updateColors();

        if (this.onLabelChange) {
            this.onLabelChange();
        }
    }

    /**
     * Undo last label action
     */
    undo() {
        if (!this.canUndo()) return;

        this.historyIndex--;
        if (this.historyIndex >= 0) {
            this.restoreState(this.history[this.historyIndex]);
        } else {
            // Restore to empty state
            Object.keys(this.scene.labels).forEach(type => {
                this.scene.labels[type].clear();
            });
            this.scene.updateColors();
            if (this.onLabelChange) {
                this.onLabelChange();
            }
        }
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (!this.canRedo()) return;

        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.historyIndex >= 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Reset history
     */
    resetHistory() {
        this.history = [];
        this.historyIndex = -1;
    }

    /**
     * Get labels from scene
     */
    getLabels() {
        return this.scene.getLabels();
    }

    /**
     * Set labels in scene
     */
    setLabels(labels) {
        this.scene.setLabels(labels);
        this.resetHistory();
    }
}
