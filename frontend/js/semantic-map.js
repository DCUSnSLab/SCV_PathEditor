// Semantic Map Editor - Map Management
class SemanticMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.drawnItems = null;
        this.drawControl = null;
        this.areas = new Map(); // areaId -> { layer, data }
        this.selectedArea = null;
        this.currentAreaType = 'drivable';
        this.areaCounter = 0;
        this.isDrawing = false;
        this.isEditing = false;
        this.isDeleting = false;

        // Area type configuration
        this.areaTypes = {
            drivable: {
                color: '#4CAF50',
                fillColor: '#4CAF50',
                fillOpacity: 0.3,
                weight: 2,
                defaultSpeedLimit: 2.0,
                traversable: true,
                costWeight: 1.0
            },
            crosswalk: {
                color: '#FF9800',
                fillColor: '#FF9800',
                fillOpacity: 0.4,
                weight: 2,
                defaultSpeedLimit: 0.5,
                traversable: true,
                costWeight: 5.0
            },
            sidewalk: {
                color: '#9E9E9E',
                fillColor: '#9E9E9E',
                fillOpacity: 0.4,
                weight: 2,
                defaultSpeedLimit: 0.0,
                traversable: false,
                costWeight: 100.0
            },
            no_entry: {
                color: '#F44336',
                fillColor: '#F44336',
                fillOpacity: 0.5,
                weight: 3,
                defaultSpeedLimit: 0.0,
                traversable: false,
                costWeight: 1000.0
            },
            plaza: {
                color: '#2196F3',
                fillColor: '#2196F3',
                fillOpacity: 0.3,
                weight: 2,
                defaultSpeedLimit: 1.0,
                traversable: true,
                costWeight: 2.0
            }
        };

        // Callbacks
        this.onAreaSelect = null;
        this.onAreaCreate = null;
        this.onAreaDelete = null;
        this.onAreaUpdate = null;

        this.initMap();
    }

    initMap() {
        // Default location
        const defaultCenter = [35.9138614, 128.80401319999999];
        const defaultZoom = 18;

        // Initialize Leaflet map
        this.map = L.map(this.containerId, {
            center: defaultCenter,
            zoom: defaultZoom,
            zoomControl: true
        });

        // Tile layers
        this.tileLayers = {
            street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 22,
                maxNativeZoom: 19
            }),
            satellite: L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                attribution: '&copy; Google',
                maxZoom: 22,
                maxNativeZoom: 21,
                subdomains: ['0', '1', '2', '3']
            }),
            hybrid: L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                attribution: '&copy; Google',
                maxZoom: 22,
                maxNativeZoom: 21,
                subdomains: ['0', '1', '2', '3']
            }),
            dark: L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
                attribution: '&copy; CartoDB',
                maxZoom: 22,
                maxNativeZoom: 20,
                subdomains: ['a', 'b', 'c', 'd']
            })
        };

        // Add default tile layer
        this.tileLayers.satellite.addTo(this.map);

        // Initialize feature group for drawn items
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        // Initialize draw control (hidden by default, we'll use custom buttons)
        this.drawControl = new L.Control.Draw({
            draw: false,
            edit: {
                featureGroup: this.drawnItems,
                remove: false
            }
        });

        // Map events
        this.setupMapEvents();

        // Coordinate display
        this.addCoordinateDisplay();
    }

    setupMapEvents() {
        // Handle polygon creation
        this.map.on(L.Draw.Event.CREATED, (e) => {
            const layer = e.layer;
            this.handlePolygonCreated(layer);
        });

        // Handle polygon edit
        this.map.on(L.Draw.Event.EDITED, (e) => {
            const layers = e.layers;
            layers.eachLayer((layer) => {
                this.handlePolygonEdited(layer);
            });
        });

        // Handle polygon delete
        this.map.on(L.Draw.Event.DELETED, (e) => {
            const layers = e.layers;
            layers.eachLayer((layer) => {
                this.handlePolygonDeleted(layer);
            });
        });

        // Handle click on map (deselect)
        this.map.on('click', (e) => {
            if (!this.isDrawing) {
                this.deselectArea();
            }
        });
    }

    addCoordinateDisplay() {
        const coordDiv = L.DomUtil.create('div', 'coordinate-display');
        coordDiv.innerHTML = 'Lat: --, Lng: --';
        document.querySelector('.center-panel').appendChild(coordDiv);

        this.map.on('mousemove', (e) => {
            coordDiv.innerHTML = `Lat: ${e.latlng.lat.toFixed(6)}, Lng: ${e.latlng.lng.toFixed(6)}`;
        });
    }

    setMapStyle(styleName) {
        if (!this.tileLayers[styleName]) return;

        Object.values(this.tileLayers).forEach(layer => {
            if (this.map.hasLayer(layer)) {
                this.map.removeLayer(layer);
            }
        });

        this.tileLayers[styleName].addTo(this.map);
    }

    setAreaType(type) {
        if (this.areaTypes[type]) {
            this.currentAreaType = type;
        }
    }

    startDrawing() {
        this.isDrawing = true;
        this.isEditing = false;
        this.isDeleting = false;

        // Create polygon drawer with current area type style
        const style = this.areaTypes[this.currentAreaType];
        const polygonDrawer = new L.Draw.Polygon(this.map, {
            shapeOptions: {
                color: style.color,
                fillColor: style.fillColor,
                fillOpacity: style.fillOpacity,
                weight: style.weight
            },
            showArea: true,
            metric: true
        });

        polygonDrawer.enable();

        // When drawing finishes
        this.map.once(L.Draw.Event.CREATED, () => {
            this.isDrawing = false;
        });

        this.map.once(L.Draw.Event.DRAWSTOP, () => {
            this.isDrawing = false;
        });
    }

    startEditing() {
        this.isEditing = !this.isEditing;
        this.isDrawing = false;
        this.isDeleting = false;

        if (this.isEditing) {
            // Enable editing on all layers
            this.drawnItems.eachLayer((layer) => {
                if (layer.editing) {
                    layer.editing.enable();
                }
            });
            showNotification('Edit mode enabled. Click polygons to edit vertices.', 'info');
        } else {
            // Disable editing
            this.drawnItems.eachLayer((layer) => {
                if (layer.editing) {
                    layer.editing.disable();
                }
            });
            // Update all areas with new coordinates
            this.areas.forEach((areaInfo, areaId) => {
                this.handlePolygonEdited(areaInfo.layer);
            });
            showNotification('Edit mode disabled.', 'info');
        }

        return this.isEditing;
    }

    startDeleting() {
        this.isDeleting = !this.isDeleting;
        this.isDrawing = false;
        this.isEditing = false;

        if (this.isDeleting) {
            // Add click handlers for deletion
            this.areas.forEach((areaInfo, areaId) => {
                areaInfo.layer.on('click', this._deleteClickHandler = () => {
                    this.deleteArea(areaId);
                });
            });
            showNotification('Delete mode enabled. Click polygons to delete.', 'warning');
        } else {
            // Remove click handlers
            this.areas.forEach((areaInfo) => {
                areaInfo.layer.off('click', this._deleteClickHandler);
            });
            showNotification('Delete mode disabled.', 'info');
        }

        return this.isDeleting;
    }

    handlePolygonCreated(layer) {
        // Generate area ID
        this.areaCounter++;
        const areaId = `${this.currentAreaType}_${String(this.areaCounter).padStart(3, '0')}`;

        // Get polygon coordinates
        const latLngs = layer.getLatLngs()[0];
        const polygon = latLngs.map(ll => [ll.lng, ll.lat]); // [lng, lat] for GeoJSON

        // Create area data
        const typeConfig = this.areaTypes[this.currentAreaType];
        const areaData = {
            id: areaId,
            type: this.currentAreaType,
            polygon: polygon,
            properties: {
                speed_limit: typeConfig.defaultSpeedLimit,
                priority: 1,
                traversable: typeConfig.traversable,
                cost_weight: typeConfig.costWeight,
                remark: ''
            }
        };

        // Add to map
        this.addAreaToMap(areaId, layer, areaData);

        // Callback
        if (this.onAreaCreate) {
            this.onAreaCreate(areaId, areaData);
        }

        showNotification(`Area ${areaId} created`, 'success');
    }

    handlePolygonEdited(layer) {
        // Find area by layer
        let editedAreaId = null;
        this.areas.forEach((areaInfo, areaId) => {
            if (areaInfo.layer === layer) {
                editedAreaId = areaId;
            }
        });

        if (editedAreaId) {
            const areaInfo = this.areas.get(editedAreaId);
            const latLngs = layer.getLatLngs()[0];
            const polygon = latLngs.map(ll => [ll.lng, ll.lat]);

            areaInfo.data.polygon = polygon;

            if (this.onAreaUpdate) {
                this.onAreaUpdate(editedAreaId, areaInfo.data);
            }
        }
    }

    handlePolygonDeleted(layer) {
        let deletedAreaId = null;
        this.areas.forEach((areaInfo, areaId) => {
            if (areaInfo.layer === layer) {
                deletedAreaId = areaId;
            }
        });

        if (deletedAreaId) {
            this.areas.delete(deletedAreaId);

            if (this.onAreaDelete) {
                this.onAreaDelete(deletedAreaId);
            }
        }
    }

    addAreaToMap(areaId, layer, areaData) {
        // Style the layer
        const style = this.areaTypes[areaData.type];
        layer.setStyle({
            color: style.color,
            fillColor: style.fillColor,
            fillOpacity: style.fillOpacity,
            weight: style.weight
        });

        // Add tooltip
        layer.bindTooltip(areaId, {
            permanent: false,
            direction: 'center',
            className: 'area-tooltip'
        });

        // Add click handler for selection
        layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (!this.isDeleting) {
                this.selectArea(areaId);
            }
        });

        // Add to feature group
        this.drawnItems.addLayer(layer);

        // Store area info
        this.areas.set(areaId, {
            layer: layer,
            data: areaData
        });
    }

    selectArea(areaId) {
        // Deselect previous
        if (this.selectedArea && this.selectedArea !== areaId) {
            const prevArea = this.areas.get(this.selectedArea);
            if (prevArea) {
                const style = this.areaTypes[prevArea.data.type];
                prevArea.layer.setStyle({
                    weight: style.weight,
                    dashArray: null
                });
            }
        }

        // Select new
        const areaInfo = this.areas.get(areaId);
        if (areaInfo) {
            this.selectedArea = areaId;
            areaInfo.layer.setStyle({
                weight: 4,
                dashArray: '5, 5'
            });

            if (this.onAreaSelect) {
                this.onAreaSelect(areaId, areaInfo.data);
            }
        }
    }

    deselectArea() {
        if (this.selectedArea) {
            const areaInfo = this.areas.get(this.selectedArea);
            if (areaInfo) {
                const style = this.areaTypes[areaInfo.data.type];
                areaInfo.layer.setStyle({
                    weight: style.weight,
                    dashArray: null
                });
            }
            this.selectedArea = null;

            if (this.onAreaSelect) {
                this.onAreaSelect(null, null);
            }
        }
    }

    deleteArea(areaId) {
        const areaInfo = this.areas.get(areaId);
        if (areaInfo) {
            this.drawnItems.removeLayer(areaInfo.layer);
            this.areas.delete(areaId);

            if (this.selectedArea === areaId) {
                this.selectedArea = null;
            }

            if (this.onAreaDelete) {
                this.onAreaDelete(areaId);
            }

            showNotification(`Area ${areaId} deleted`, 'info');
        }
    }

    updateAreaProperties(areaId, properties) {
        const areaInfo = this.areas.get(areaId);
        if (!areaInfo) return false;

        // Update type if changed
        if (properties.type && properties.type !== areaInfo.data.type) {
            areaInfo.data.type = properties.type;
            const style = this.areaTypes[properties.type];
            areaInfo.layer.setStyle({
                color: style.color,
                fillColor: style.fillColor,
                fillOpacity: style.fillOpacity
            });
        }

        // Update properties
        Object.assign(areaInfo.data.properties, properties);

        if (this.onAreaUpdate) {
            this.onAreaUpdate(areaId, areaInfo.data);
        }

        return true;
    }

    focusOnArea(areaId) {
        const areaInfo = this.areas.get(areaId);
        if (areaInfo) {
            this.map.fitBounds(areaInfo.layer.getBounds(), { padding: [50, 50] });
            this.selectArea(areaId);
        }
    }

    clearAll() {
        this.drawnItems.clearLayers();
        this.areas.clear();
        this.selectedArea = null;
        this.areaCounter = 0;
    }

    fitToData() {
        if (this.areas.size === 0) return;
        this.map.fitBounds(this.drawnItems.getBounds(), { padding: [50, 50] });
    }

    // Load semantic map data
    loadMapData(mapData) {
        this.clearAll();

        if (!mapData || !mapData.areas) {
            console.warn('No areas in map data');
            return;
        }

        // Set area counter to max existing ID
        let maxId = 0;
        mapData.areas.forEach(area => {
            const match = area.id.match(/_(\d+)$/);
            if (match) {
                maxId = Math.max(maxId, parseInt(match[1]));
            }
        });
        this.areaCounter = maxId;

        // Add each area
        mapData.areas.forEach(area => {
            // Convert polygon from [lng, lat] to Leaflet [lat, lng]
            const latLngs = area.polygon.map(coord => [coord[1], coord[0]]);
            const layer = L.polygon(latLngs);
            this.addAreaToMap(area.id, layer, area);
        });

        // Fit map to data
        this.fitToData();
    }

    // Export to semantic map format
    exportMapData(mapName = 'untitled') {
        const areas = [];
        this.areas.forEach((areaInfo) => {
            areas.push(areaInfo.data);
        });

        return {
            version: '1.0',
            name: mapName,
            coordinate_system: {
                type: 'WGS84',
                note: 'Coordinates stored as [longitude, latitude]'
            },
            areas: areas,
            area_types: this.areaTypes
        };
    }

    getAreaCount() {
        return this.areas.size;
    }

    getAllAreas() {
        const result = [];
        this.areas.forEach((areaInfo, areaId) => {
            result.push({ id: areaId, ...areaInfo.data });
        });
        return result;
    }
}
