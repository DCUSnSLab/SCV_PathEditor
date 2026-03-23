/**
 * Point Cloud API Client
 */
class PointCloudAPI {
    constructor() {
        this.baseUrl = '/api/lidar';
    }

    /**
     * Upload a ROS2 bag file
     * @param {File} file - The bag file to upload
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<Object>} Upload result
     */
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

    /**
     * List all uploaded bags
     * @returns {Promise<string[]>} List of bag IDs
     */
    async listBags() {
        const response = await fetch(`${this.baseUrl}/bags`);
        if (!response.ok) {
            throw new Error(`Failed to list bags: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Get bag info
     * @param {string} bagId - Bag ID
     * @returns {Promise<Object>} Bag metadata
     */
    async getBagInfo(bagId) {
        const response = await fetch(`${this.baseUrl}/bags/${bagId}/info`);
        if (!response.ok) {
            throw new Error(`Failed to get bag info: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Delete a bag
     * @param {string} bagId - Bag ID
     */
    async deleteBag(bagId) {
        const response = await fetch(`${this.baseUrl}/bags/${bagId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete bag: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Start processing a bag
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Job info
     */
    async processBag(options) {
        const response = await fetch(`${this.baseUrl}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to start processing: ${error}`);
        }
        return response.json();
    }

    /**
     * Get job status
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} Job status
     */
    async getJobStatus(jobId) {
        const response = await fetch(`${this.baseUrl}/jobs/${jobId}`);
        if (!response.ok) {
            throw new Error(`Failed to get job status: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Poll job until completion
     * @param {string} jobId - Job ID
     * @param {Function} onProgress - Progress callback
     * @param {number} interval - Poll interval in ms
     * @returns {Promise<Object>} Final job status
     */
    async waitForJob(jobId, onProgress = null, interval = 1000) {
        while (true) {
            const status = await this.getJobStatus(jobId);

            if (onProgress) {
                onProgress(status);
            }

            if (status.status === 'completed' || status.status === 'failed') {
                return status;
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }

    /**
     * List all point clouds
     * @returns {Promise<string[]>} List of point cloud IDs
     */
    async listPointClouds() {
        const response = await fetch(`${this.baseUrl}/pointclouds`);
        if (!response.ok) {
            throw new Error(`Failed to list point clouds: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Get point cloud info
     * @param {string} pcId - Point cloud ID
     * @returns {Promise<Object>} Point cloud metadata
     */
    async getPointCloudInfo(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}`);
        if (!response.ok) {
            throw new Error(`Failed to get point cloud info: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Download point cloud data
     * @param {string} pcId - Point cloud ID
     * @returns {Promise<ArrayBuffer>} Binary point data
     */
    async downloadPointCloud(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/download`);
        if (!response.ok) {
            throw new Error(`Failed to download point cloud: ${response.status}`);
        }
        return response.arrayBuffer();
    }

    /**
     * Delete a point cloud
     * @param {string} pcId - Point cloud ID
     */
    async deletePointCloud(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete point cloud: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Get labels for a point cloud
     * @param {string} pcId - Point cloud ID
     * @returns {Promise<Object>} Labels data
     */
    async getLabels(pcId) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/labels`);
        if (!response.ok) {
            throw new Error(`Failed to get labels: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Save labels for a point cloud
     * @param {string} pcId - Point cloud ID
     * @param {Object} labels - Labels data
     * @returns {Promise<Object>} Saved labels
     */
    async saveLabels(pcId, labels) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/labels`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ labels })
        });
        if (!response.ok) {
            throw new Error(`Failed to save labels: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Generate polygons from labels
     * @param {string} pcId - Point cloud ID
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated polygons
     */
    async generatePolygons(pcId, options = {}) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/generate-polygons`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to generate polygons: ${error}`);
        }
        return response.json();
    }

    /**
     * Export to semantic map
     * @param {string} pcId - Point cloud ID
     * @param {Object} options - Export options
     * @returns {Promise<Object>} Export result
     */
    async exportToSemantic(pcId, options) {
        const response = await fetch(`${this.baseUrl}/pointclouds/${pcId}/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to export: ${error}`);
        }
        return response.json();
    }
}

// Global instance
const pointCloudAPI = new PointCloudAPI();
