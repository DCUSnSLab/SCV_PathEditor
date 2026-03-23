// Semantic Map API Client
const semanticAPI = {
    baseUrl: '/api/semantic',

    // List all semantic map files
    async listFiles() {
        const response = await fetch(`${this.baseUrl}/files`);
        if (!response.ok) {
            throw new Error(`Failed to list files: ${response.statusText}`);
        }
        return await response.json();
    },

    // Load a semantic map
    async loadMap(filename) {
        const response = await fetch(`${this.baseUrl}/load?path=${encodeURIComponent(filename)}`);
        if (!response.ok) {
            throw new Error(`Failed to load map: ${response.statusText}`);
        }
        return await response.json();
    },

    // Save a semantic map
    async saveMap(filename, mapData) {
        const response = await fetch(`${this.baseUrl}/save/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(mapData)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save map');
        }
        return await response.json();
    },

    // Convert GPS to UTM
    async gpsToUtm(lat, lng) {
        const response = await fetch(`/api/coords/gps-to-utm?lat=${lat}&lon=${lng}`);
        if (!response.ok) {
            throw new Error('Failed to convert coordinates');
        }
        return await response.json();
    },

    // Convert UTM to GPS
    async utmToGps(easting, northing, zoneNumber, zoneLetter) {
        const response = await fetch(
            `/api/coords/utm-to-gps?easting=${easting}&northing=${northing}&zone_number=${zoneNumber}&zone_letter=${zoneLetter}`
        );
        if (!response.ok) {
            throw new Error('Failed to convert coordinates');
        }
        return await response.json();
    }
};

// Utility functions
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(el => el.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function handleAPIError(error, defaultMessage = 'An error occurred') {
    console.error(error);
    showNotification(error.message || defaultMessage, 'error');
}
