// Map management using Leaflet
class PathMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.nodes = new Map(); // nodeId -> {marker, data}
        this.links = new Map(); // linkId -> {polyline, data}
        this.selectedNode = null;
        this.selectedNodes = new Set();
        this.mode = null // select, drag, addNode, quickLink
        this.quickLinkFirstNode = null;

        // 구간 노드 생성 관련 변수
        this.intervalCreateStartPos = null;
        this.tempLine = null;
        this.tempMouseMoveMarker = null;
        
        // 이벤트 콜백
        this.onNodeSelect = null;
        this.onNodeDrag = null;
        this.onMapClick = null;
        this.onLinkCreate = null;
        
        // 드래그 관련 변수들
        this.isDragging = false;
        this.draggedMarker = null;
        this.draggedNodeId = null;
        this.dragUpdateTimeout = null;

        // 드래그 선택 관련 변수들
        this.isSelectionDragging = false;
        this.selectionStartPoint = null;
        this.selectionRectangle = null;
        this.selectionStartLatLng = null;

        this.showNodeIds = true; // 노드 ID 표시 여부 플래그
        
        this.initMap();
    }

    createSatelliteLayerWithFallback() {
        // Google Satellite 시도
        const googleSatellite = L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            attribution: '© Google',
            maxZoom: 30,
            maxNativeZoom: 21,
            zoomOffset: 0,
            subdomains: ['0', '1', '2', '3']
        });

        // Esri Satellite (fallback)
        const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 30,
            maxNativeZoom: 18,
            zoomOffset: 0
        });

        // Google 타일 로드 실패 시 Esri로 fallback
        googleSatellite.on('tileerror', (e) => {
            console.log('Google Satellite 타일 로드 실패, Esri로 전환');
            if (this.map.hasLayer(googleSatellite)) {
                this.map.removeLayer(googleSatellite);
                this.map.addLayer(esriSatellite);
                this.tileLayers.satellite = esriSatellite;
            }
        });

        return googleSatellite;
    }

    createBingLayer() {
        // Bing Maps Satellite용 커스텀 레이어
        const BingLayer = L.TileLayer.extend({
            getTileUrl: function(coords) {
                var quadkey = this._coordsToQuadKey(coords.x, coords.y, coords.z);
                return 'https://ecn.t' + Math.floor(Math.random() * 4) + '.tiles.virtualearth.net/tiles/a' + quadkey + '?g=1';
            },
            
            _coordsToQuadKey: function(x, y, z) {
                var quadkey = '';
                for (var i = z; i > 0; i--) {
                    var digit = 0;
                    var mask = 1 << (i - 1);
                    if ((x & mask) !== 0) digit += 1;
                    if ((y & mask) !== 0) digit += 2;
                    quadkey += digit;
                }
                return quadkey;
            }
        });

        return new BingLayer('', {
            attribution: '© Microsoft Bing Maps',
            maxZoom: 30,
            maxNativeZoom: 20, // Bing은 20레벨까지 네이티브 지원
            zoomOffset: 0,
            tileSize: 256
        });
    }

    createMapboxLayer() {
        // Mapbox 토큰은 서버 env(MAPBOX_TOKEN)에서 /api/config 로 주입된다 (소스에 키를 두지 않음).
        const apiKey = (window.APP_CONFIG && window.APP_CONFIG.mapboxToken) || '';

        if (!apiKey) {
            // 토큰 미설정 시 Mapbox 대신 Esri 위성 레이어로 대체
            console.warn('MAPBOX_TOKEN 미설정 — Mapbox 위성 대신 Esri 위성 레이어를 사용합니다.');
            return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
                maxZoom: 30,
                maxNativeZoom: 18,
                zoomOffset: 0
            });
        }

        // Mapbox Satellite (최고 해상도 - 22레벨)
        return L.tileLayer(`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token=${apiKey}`, {
            attribution: '© Mapbox, © OpenStreetMap',
            maxZoom: 30,
            maxNativeZoom: 22, // 최고 해상도!
            tileSize: 512,
            zoomOffset: -1
        });
    }

    createYandexLayer() {
        // Yandex Maps Satellite (러시아/동유럽 지역 고해상도)
        return L.tileLayer('https://sat0{s}.maps.yandex.net/tiles?l=sat&v=3.1012.0&x={x}&y={y}&z={z}&lang=ru_RU', {
            attribution: '© Yandex Maps',
            maxZoom: 30,
            maxNativeZoom: 21,
            zoomOffset: 0,
            subdomains: ['1', '2', '3', '4']
        });
    }

    createCartoLayer() {
        // CartoDB Positron with high-res satellite overlay
        return L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager_nolabels/{z}/{x}/{y}.png', {
            attribution: '© CartoDB, © OpenStreetMap',
            maxZoom: 30,
            maxNativeZoom: 20,
            zoomOffset: 0,
            subdomains: ['a', 'b', 'c', 'd']
        });
    }

    createGoogleHybridLayer() {
        // Google Hybrid (위성 + 라벨) - 실용적!
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            attribution: '© Google',
            maxZoom: 30,
            maxNativeZoom: 21,
            zoomOffset: 0,
            subdomains: ['0', '1', '2', '3']
        });
    }

    createGoogleTerrainLayer() {
        // Google Terrain - 지형 정보 최고!
        return L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
            attribution: '© Google',
            maxZoom: 30,
            maxNativeZoom: 20,
            zoomOffset: 0,
            subdomains: ['0', '1', '2', '3']
        });
    }

    createDarkLayer() {
        // Dark Mode 지도 - 개쩌는 스타일!
        return L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
            attribution: '© CartoDB, © OpenStreetMap',
            maxZoom: 30,
            maxNativeZoom: 20,
            zoomOffset: 0,
            subdomains: ['a', 'b', 'c', 'd']
        });
    }

    setMapStyle(styleName) {
        if (!this.tileLayers || !this.tileLayers[styleName]) {
            console.error(`Map style '${styleName}' not found.`);
            return;
        }

        // 모든 타일 레이어 제거
        for (const key in this.tileLayers) {
            this.map.removeLayer(this.tileLayers[key]);
        }

        // 선택된 타일 레이어 추가
        this.map.addLayer(this.tileLayers[styleName]);
    }

    toggleNodeLabels(visible) {
        this.showNodeIds = visible;
        this.nodes.forEach(nodeInfo => {
            const marker = nodeInfo.marker;
            const nodeId = nodeInfo.data.ID;

            // 기존 tooltip 제거 후 새로 생성
            marker.unbindTooltip();

            const label = L.tooltip({
                permanent: visible,
                direction: 'top',
                offset: [0, -10],
                className: 'node-label'
            }).setContent(nodeId);

            marker.bindTooltip(label);

            if (visible) {
                marker.openTooltip();
            }
        });
    }

    initMap() {
        // 기본 위치 (한국 서울)
        const defaultCenter = [37.5665, 126.9780];
        const defaultZoom = 15;

        // Leaflet 지도 초기화
        this.map = L.map(this.containerId, {
            center: defaultCenter,
            zoom: defaultZoom,
            zoomControl: true,
            attributionControl: true
        });

        // 타일 레이어 정의
        this.tileLayers = {
            street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 30,
                maxNativeZoom: 19,
                zoomOffset: 0
            }),
            satellite: this.createSatelliteLayerWithFallback(),
            bing: this.createBingLayer(),
            mapbox: this.createMapboxLayer(),
            yandex: this.createYandexLayer(),
            carto: this.createCartoLayer(),
            hybrid: this.createGoogleHybridLayer(),
            terrain: this.createGoogleTerrainLayer(),
            dark: this.createDarkLayer()
        };

        // 기본 타일 레이어 추가
        this.tileLayers.street.addTo(this.map);

        // 지도 클릭 이벤트
        this.map.on('click', (e) => {
            this.handleMapClick(e);
        });

        // 줌 변경 시 마커 크기 조정
        this.map.on('zoomend', () => {
            this.updateMarkerSizes();
        });

        // 전역 마우스 이벤트 (드래그용)
        this.map.on('mousedown', (e) => {
            this.handleGlobalMouseDown(e);
        });

        this.map.on('mousemove', (e) => {
            this.handleGlobalMouseMove(e);
        });

        this.map.on('mouseup', (e) => {
            this.handleGlobalMouseUp(e);
        });

        // 키보드 이벤트 리스너 (Ctrl 키 감지용)
        this.setupKeyboardListeners();
    }

    handleMapClick(e) {
        const { lat, lng } = e.latlng;

        // 제스처 기반 모드는 전용 핸들러에서 처리
        if (this.mode === 'quickLink') {
            this.handleQuickLinkClick(e);
        } else if (this.mode === 'intervalCreate') {
            this.handleIntervalCreateClick(e.latlng);
        }

        // addNode 등 onMapClick 콜백으로 처리되는 모드는 여기서 한 번만 전달
        if (this.onMapClick) {
            this.onMapClick(lat, lng, this.mode);
        }
    }

    handleQuickLinkClick(e) {
        // 클릭한 위치에서 가장 가까운 노드 찾기
        const clickedNode = this.findNearestNode(e.latlng, 50); // 50픽셀 이내
        
        if (!clickedNode) return;

        if (!this.quickLinkFirstNode) {
            // 첫 번째 노드 선택
            this.quickLinkFirstNode = clickedNode;
            this.highlightNode(clickedNode.nodeId, '#ffff00'); // 노란색으로 하이라이트
            showNotification(`첫 번째 노드 ${clickedNode.nodeId} 선택됨. 두 번째 노드를 클릭하세요.`, 'info');
        } else {
            // 두 번째 노드 선택 - 링크 생성
            if (clickedNode.nodeId === this.quickLinkFirstNode.nodeId) {
                showNotification('동일한 노드입니다. 다른 노드를 선택해주세요.', 'warning');
                return;
            }

            this.createQuickLink(this.quickLinkFirstNode, clickedNode);
            this.resetQuickLinkSelection();
        }
    }

    async createQuickLink(fromNode, toNode) {
        try {
            const linkData = {
                FromNodeID: fromNode.nodeId,
                ToNodeID: toNode.nodeId,
                AdminCode: "110",
                RoadRank: 1,
                RoadType: 1,
                RoadNo: "20",
                LinkType: 3,
                LaneNo: 2,
                R_LinkID: `R_${fromNode.nodeId}`,
                L_LinkID: `L_${toNode.nodeId}`,
                SectionID: "QUICKLINK_SECTION",
                Length: this.calculateDistance(fromNode.data, toNode.data),
                ITSLinkID: `ITS_${Date.now()}`,
                Maker: "QuickLink 자동생성",
                UpdateDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                Version: "2021",
                Remark: "QuickLink로 자동 생성된 링크",
                HistType: "02A",
                HistRemark: "QuickLink 기능으로 생성"
            };

            const newLink = await pathAPI.createLink(linkData);
            this.addLink(newLink);
            
            if (this.onLinkCreate) {
                this.onLinkCreate(newLink);
            }
            
            showNotification(`링크 ${newLink.ID} 생성 완료`, 'success');
        } catch (error) {
            handleAPIError(error, '링크 생성 중 오류가 발생했습니다');
        }
    }

    resetQuickLinkSelection() {
        if (this.quickLinkFirstNode) {
            this.highlightNode(this.quickLinkFirstNode.nodeId, '#e74c3c'); // 원래 색상으로 복원
            this.refreshNodeAppearance(this.quickLinkFirstNode.nodeId);
            this.quickLinkFirstNode = null;
        }
    }

    findNearestNode(latlng, maxPixelDistance = 30) {
        let nearestNode = null;
        let minDistance = Infinity;

        this.nodes.forEach((nodeInfo, nodeId) => {
            const marker = nodeInfo.marker;
            const markerLatLng = marker.getLatLng();
            
            // 픽셀 거리 계산
            const markerPoint = this.map.latLngToContainerPoint(markerLatLng);
            const clickPoint = this.map.latLngToContainerPoint(latlng);
            const pixelDistance = markerPoint.distanceTo(clickPoint);
            
            if (pixelDistance < maxPixelDistance && pixelDistance < minDistance) {
                minDistance = pixelDistance;
                nearestNode = { nodeId, ...nodeInfo };
            }
        });

        return nearestNode;
    }

    calculateDistance(node1, node2) {
        // UTM 좌표를 사용하여 거리 계산 (km 단위)
        const dx = node1.UtmInfo.Easting - node2.UtmInfo.Easting;
        const dy = node1.UtmInfo.Northing - node2.UtmInfo.Northing;
        const distanceM = Math.sqrt(dx * dx + dy * dy);
        return Math.round(distanceM / 1000 * 100000) / 100000; // km 단위, 소수점 5자리
    }

    setMode(mode) {
        this.mode = mode;
        
        // 모드별 커서 변경
        const mapContainer = this.map.getContainer();
        mapContainer.style.cursor = mode === 'drag' ? 'move' : 
                                   mode === 'addNode' ? 'crosshair' : 
                                   mode === 'quickLink' ? 'pointer' : 
                                   mode === 'intervalCreate' ? 'crosshair' : 'default';
        
        // 다른 모드로 변경 시 구간 생성 상태 초기화
        if (mode !== 'intervalCreate') {
            this.resetIntervalCreate();
        }

        // // QuickLink 모드가 아닐 때 선택 상태 초기화
        // if (mode !== 'quickLink') {
        //     this.resetQuickLinkSelection();
        // }

        // ★ 복수 선택도 모드 변경 시 초기화
        this.clearSelections();
        this.refreshAllNodeAppearances();
        
        // 드래그 모드 설정
        this.nodes.forEach(nodeInfo => {
            const element = nodeInfo.marker.getElement();
            if (element) {
                if (mode === 'drag') {
                    nodeInfo.marker._isDraggable = true;
                    element.style.cursor = 'grab';
                    element.title = '드래그하여 노드 위치 변경';
                } else {
                    nodeInfo.marker._isDraggable = false;
                    element.style.cursor = 'pointer';
                    element.title = nodeInfo.data.ID;
                }
            }
        });
    }

    addNode(nodeData) {
        const { GpsInfo, ID } = nodeData;
        const latlng = [GpsInfo.Lat, GpsInfo.Long];

        const baseColor = this.nodeTypeToColor(nodeData.NodeType);
        const customIcon = L.divIcon({
            className: 'node-marker',
            html: `<div style="background-color:${baseColor}; border:2px solid white; border-radius:50%; width:16px; height:16px;"></div>`,
            iconSize: [16,16],
            iconAnchor: [8,8]
        });

        const marker = L.marker(latlng, { icon: customIcon, draggable: false });
        marker._isDraggable = false;
        marker._nodeId = ID;

        // 라벨 추가
        const label = L.tooltip({
            permanent: this.showNodeIds, // showNodeIds 상태에 따라 permanent 설정
            direction: 'top',
            offset: [0, -10],
            className: 'node-label'
        }).setContent(ID);

        marker.bindTooltip(label);

        if (this.showNodeIds) {
            marker.openTooltip();
        }

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            // 복수 선택 모드: 토글(누적/해제)
            if (this.mode === 'select') {
                this.toggleSelectNode(ID);
                return;
            }
            // 삭제 모드: 클릭한 노드 삭제
            if (this.mode === 'delete') {
                if (window.uiManager) {
                    window.uiManager.deleteNode(ID);
                }
                return;
            }
            // QuickLink 모드: 마커를 정확히 클릭해도 링크 선택이 동작하도록 위임
            // (stopPropagation 으로 지도 클릭 핸들러가 막히므로 여기서 직접 처리)
            if (this.mode === 'quickLink') {
                this.handleQuickLinkClick({ latlng: marker.getLatLng() });
                return;
            }
            // 그 외 지도 클릭 제스처 사용 모드에서는 마커 클릭을 무시
            if (this.mode === 'addNode' || this.mode === 'intervalCreate') {
                return;
            }
            // 그 외(아무 모드도 아님/일반 상태/드래그 모드 등): 항상 단일 선택
            this.selectOnly(ID);
        });

        // 드래그 이벤트 핸들러 - DOM 요소에 직접 이벤트 추가
        marker.on('add', () => {
            const element = marker.getElement();
            if (element) {
                element.addEventListener('mousedown', (e) => {
                    if (this.mode === 'drag') {
                        this.startDragging(marker, ID, e);
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });
            }
        });

        marker.addTo(this.map);
        this.nodes.set(ID, { marker, data: nodeData });

        // 선택 상태 반영(밝기/테두리)
        this.refreshNodeAppearance(ID);

        // 헤딩 화살표 쓰신다면 유지
        this.updateHeadingForNode?.(ID);

        return marker;
    }

    removeNode(nodeId) {
        const nodeInfo = this.nodes.get(nodeId);
        if (nodeInfo) {
            this.map.removeLayer(nodeInfo.marker);
            if (nodeInfo.headingMarker) this.map.removeLayer(nodeInfo.headingMarker);
            this.nodes.delete(nodeId);
            
            // 선택된 노드였다면 선택 해제
            if (this.selectedNode === nodeId) {
                this.selectedNode = null;
            }
        }
    }

    addLink(linkData) {
        const { ID, FromNodeID, ToNodeID } = linkData;
        
        const fromNode = this.nodes.get(FromNodeID);
        const toNode = this.nodes.get(ToNodeID);
        
        if (!fromNode || !toNode) {
            console.warn(`링크 ${ID}의 노드를 찾을 수 없습니다: ${FromNodeID} -> ${ToNodeID}`);
            return null;
        }

        const fromLatLng = fromNode.marker.getLatLng();
        const toLatLng = toNode.marker.getLatLng();

        // 화살표 스타일 폴리라인 생성
        const polyline = L.polyline([fromLatLng, toLatLng], {
            color: '#3498db',
            weight: 3,
            opacity: 0.7,
            className: 'link-arrow'
        });

        // 화살표 마커 추가 (중간점에)
        const midpoint = L.latLng(
            (fromLatLng.lat + toLatLng.lat) / 2,
            (fromLatLng.lng + toLatLng.lng) / 2
        );

        // 화살표 방향 계산
        const angle = Math.atan2(toLatLng.lng - fromLatLng.lng, toLatLng.lat - fromLatLng.lat) * 180 / Math.PI;
        
        const arrowIcon = L.divIcon({
            html: `<div style="transform: rotate(${angle}deg); color: #3498db; font-size: 16px;">▲</div>`,
            className: 'arrow-icon',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const arrowMarker = L.marker(midpoint, { icon: arrowIcon });

        // 팝업 추가
        const popupContent = `
            <div>
                <strong>Link: ${ID}</strong><br>
                From: ${FromNodeID}<br>
                To: ${ToNodeID}<br>
                Length: ${linkData.Length.toFixed(3)} km
            </div>
        `;
        polyline.bindPopup(popupContent);

        // 지도에 추가
        polyline.addTo(this.map);
        arrowMarker.addTo(this.map);

        // 저장
        this.links.set(ID, { 
            polyline, 
            arrowMarker, 
            data: linkData 
        });

        return polyline;
    }

    removeLink(linkId) {
        const linkInfo = this.links.get(linkId);
        if (linkInfo) {
            this.map.removeLayer(linkInfo.polyline);
            if (linkInfo.arrowMarker) {
                this.map.removeLayer(linkInfo.arrowMarker);
            }
            this.links.delete(linkId);
        }
    }

    selectNode(nodeId) {

        if (this.selectedNode && this.selectedNode !== nodeId) {
            this._applySelectVisual(this.selectedNode, false);
        }
        this.selectedNode = nodeId;
        this._applySelectVisual(nodeId, true);

        if (this.onNodeSelect) {
            const nodeInfo = this.nodes.get(nodeId);
            this.onNodeSelect(nodeId, nodeInfo ? nodeInfo.data : null);
        }
    }

    highlightNode(nodeId /*, _colorIgnored */) {
        // 상태는 class로, 색은 NodeType + refresh 로 통일
        const info = this.nodes.get(nodeId);
        if (info) {
            // 호출자가 색 인자를 줘도 무시하고, 실제 외형은 여기서만 결정
            this.refreshNodeAppearance(nodeId);
        }
    }

    /** --- Heading arrows (▲) --- */
// 주어진 heading(deg, 북=0°, 시계방향)으로 회전한 주황색 화살표 아이콘 생성
// ⬇ 기존 _makeHeadingIcon(...) 을 이걸로 교체
    _makeHeadingIcon(deg) {
        // 링크 폴리라인 굵기(3)의 1.2배 느낌
        const shaftWidth = 4;           // 3 * 1.2 ≈ 4
        const box = 36;                 // 아이콘 전체 박스(px) - 화살 길이감
        const svg = `
    <svg width="${box}" height="${box}" viewBox="0 0 100 100">
      <defs>
        <marker id="hhead" markerWidth="18" markerHeight="18" refX="9" refY="6" orient="auto">
          <path d="M0,0 L18,6 L0,12 z" fill="#f39c12" />
        </marker>
      </defs>
      <!-- 아래(노드)에서 위(북)로 뻗는 몸통 -->
      <line x1="50" y1="92" x2="50" y2="18"
            stroke="#f39c12" stroke-width="${shaftWidth}"
            stroke-linecap="round" marker-end="url(#hhead)" />
    </svg>
  `;
        return L.divIcon({
            className: 'heading-arrow-icon',
            html: `<div class="heading-arrow-long" style="transform: rotate(${deg}deg);">${svg}</div>`,
            iconSize: [box, box],
            // 아이콘의 거의 바닥이 노드 중심에 오도록 앵커 설정
            iconAnchor: [box / 2, box - 2],
        });
    }


// 노드의 Heading 값에 맞춰 화살표를 생성/갱신(-1이면 제거)
    updateHeadingForNode(nodeId) {
        const entry = this.nodes.get(nodeId);
        if (!entry) return;

        // 기존 화살표 제거
        if (entry.headingMarker) {
            this.map.removeLayer(entry.headingMarker);
            entry.headingMarker = null;
        }

        const h = entry.data?.Heading;
        if (typeof h === 'number' && h >= 0) {
            entry.headingMarker = L.marker(entry.marker.getLatLng(), {
                icon: this._makeHeadingIcon(h),
                interactive: false,
                keyboard: false,
            }).addTo(this.map);
        }
    }

// 노드 이동 시 화살표도 같은 위치로 이동
    updateHeadingPosition(nodeId) {
        const entry = this.nodes.get(nodeId);
        if (entry?.headingMarker) {
            entry.headingMarker.setLatLng(entry.marker.getLatLng());
        }
    }


    async handleNodeDrag(nodeId, newLat, newLng) {
        console.log(`Handling drag for node ${nodeId}: ${newLat}, ${newLng}`);
        
        // 즉시 UI 업데이트 (노드 데이터)
        const nodeInfo = this.nodes.get(nodeId);
        if (nodeInfo) {
            const originalLat = nodeInfo.data.GpsInfo.Lat;
            const originalLng = nodeInfo.data.GpsInfo.Long;
            
            // 노드 데이터 즉시 업데이트
            nodeInfo.data.GpsInfo.Lat = newLat;
            nodeInfo.data.GpsInfo.Long = newLng;
            
            // 연결된 링크들 즉시 업데이트
            this.updateNodeLinks(nodeId);
            
            // 백그라운드에서 API 호출 (실패해도 UI는 이미 업데이트됨)
            try {
                await pathAPI.updateNodePosition(nodeId, newLat, newLng);
                console.log(`API 업데이트 성공: ${nodeId}`);
                
                if (this.onNodeDrag) {
                    this.onNodeDrag(nodeId, newLat, newLng);
                }
                
            } catch (error) {
                console.error(`API 업데이트 실패: ${nodeId}`, error);
                
                // API 실패 시 원래 위치로 복원
                nodeInfo.data.GpsInfo.Lat = originalLat;
                nodeInfo.data.GpsInfo.Long = originalLng;
                nodeInfo.marker.setLatLng([originalLat, originalLng]);
                this.updateHeadingPosition(nodeId);
                
                // 링크들도 다시 복원
                this.updateNodeLinks(nodeId);
                
                handleAPIError(error, '노드 위치 업데이트 중 오류가 발생했습니다');
            }
        }
    }

    updateNodeLinks(nodeId) {
        // 해당 노드와 연결된 모든 링크를 찾아서 배열로 수집 (forEach 중에 수정하지 않기 위해)
        const linksToUpdate = [];
        
        this.links.forEach((linkInfo, linkId) => {
            const { FromNodeID, ToNodeID } = linkInfo.data;
            if (FromNodeID === nodeId || ToNodeID === nodeId) {
                linksToUpdate.push({ linkId, linkData: linkInfo.data });
            }
        });
        
        // 수집된 링크들을 안전하게 업데이트
        linksToUpdate.forEach(({ linkId, linkData }) => {
            try {
                // 링크 제거
                this.removeLink(linkId);
                
                // 새로운 위치로 링크 다시 추가
                this.addLink(linkData);
            } catch (error) {
                console.error(`링크 ${linkId} 업데이트 중 오류:`, error);
            }
        });
    }

    updateMarkerSizes() {
        const zoom = this.map.getZoom();
        const baseSize = Math.max(12, Math.min(20, (zoom - 10) * 2 + 16));
        
        this.nodes.forEach(nodeInfo => {
            const element = nodeInfo.marker.getElement();
            if (element) {
                const iconDiv = element.querySelector('div');
                if (iconDiv) {
                    iconDiv.style.width = `${baseSize}px`;
                    iconDiv.style.height = `${baseSize}px`;
                }
            }
        });
    }

    startDragging(marker, nodeId, e) {
        console.log('Starting drag for node:', nodeId);
        this.isDragging = true;
        this.draggedMarker = marker;
        this.draggedNodeId = nodeId;
        this.map.dragging.disable();
        
        // 마커 스타일 변경으로 드래그 상태 표시
        const element = marker.getElement();
        if (element) {
            element.style.cursor = 'grabbing';
            element.style.zIndex = '1000';
        }
    }

    handleGlobalMouseDown(e) {
        // 복수 선택 모드에서 드래그 선택 시작
        if (this.mode === 'select' && e.originalEvent.target === this.map.getContainer()) {
            this.startSelectionDrag(e);
        }
    }

    handleGlobalMouseMove(e) {
        // 노드 드래그 처리
        if (this.isDragging && this.draggedMarker && this.mode === 'drag') {
            // 마커 위치는 즉시 업데이트
            this.draggedMarker.setLatLng(e.latlng);
            // 헤딩 화살표도 같은 위치로 이동
            if (this.draggedNodeId) this.updateHeadingPosition(this.draggedNodeId);

            // 링크 업데이트는 쓰로틀링 적용 (성능 개선)
            if (this.dragUpdateTimeout) {
                clearTimeout(this.dragUpdateTimeout);
            }

            this.dragUpdateTimeout = setTimeout(() => {
                if (this.isDragging && this.draggedNodeId) {
                    this.updateNodeLinks(this.draggedNodeId);
                }
            }, 50); // 50ms마다 한 번씩만 링크 업데이트
        }

        // 드래그 선택 처리
        if (this.isSelectionDragging) {
            this.updateSelectionDrag(e);
        }
    }

    handleGlobalMouseUp(e) {
        // 드래그 선택 종료 처리
        if (this.isSelectionDragging) {
            this.endSelectionDrag(e);
            return;
        }

        if (this.isDragging && this.draggedMarker) {
            console.log('Ending drag for node:', this.draggedNodeId);
            
            // 드래그 상태 초기화
            this.isDragging = false;
            this.map.dragging.enable();
            
            // 타임아웃 정리
            if (this.dragUpdateTimeout) {
                clearTimeout(this.dragUpdateTimeout);
                this.dragUpdateTimeout = null;
            }
            
            // 마커 스타일 복원
            const element = this.draggedMarker.getElement();
            if (element) {
                element.style.cursor = 'grab';
                element.style.zIndex = '';
            }
            
            const newPos = this.draggedMarker.getLatLng();
            const nodeId = this.draggedNodeId;
            
            // 상태 초기화 (handleNodeDrag 호출 전에)
            this.draggedMarker = null;
            this.draggedNodeId = null;
            
            // 최종 위치 업데이트 (비동기로 처리되므로 페이지 블록되지 않음)
            this.handleNodeDrag(nodeId, newPos.lat, newPos.lng);
        }
    }

    clearAll() {
        // 모든 노드 제거
        this.nodes.forEach((nodeInfo) => {
            this.map.removeLayer(nodeInfo.marker);
            if (nodeInfo.headingMarker) this.map.removeLayer(nodeInfo.headingMarker);
        });
        this.nodes.clear();

        // 모든 링크 제거
        this.links.forEach((linkInfo) => {
            this.map.removeLayer(linkInfo.polyline);
            if (linkInfo.arrowMarker) {
                this.map.removeLayer(linkInfo.arrowMarker);
            }
        });
        this.links.clear();

        this.selectedNode = null;
        this.selectedNodes.clear(); // 지도 재구성 시 복수 선택 상태도 초기화 (stale 선택 방지)
        this.quickLinkFirstNode = null;
    }

    fitToData() {
        if (this.nodes.size === 0) return;

        const group = new L.featureGroup();
        this.nodes.forEach(nodeInfo => {
            group.addLayer(nodeInfo.marker);
        });

        this.map.fitBounds(group.getBounds(), { padding: [20, 20] });
    }

    getSelectedNode() {
        return this.selectedNode ? this.nodes.get(this.selectedNode) : null;
    }

    getSelectedNodeIds() {
        return Array.from(this.selectedNodes);
    }
    getSelectedNodes() {
        return this.getSelectedNodeIds().map(id => this.nodes.get(id)?.data).filter(Boolean);
    }

    getMapCenter() {
        if (!this.map) return null;
        const center = this.map.getCenter();
        return {
            lat: center.lat,
            lng: center.lng
        };
    }
    clearSelections() {
        // 상태만 비우는 게 아니라, 시각 스타일도 강제 원복
        if (this.selectedNode) {
            this.selectedNode = null;
        }
        this.selectedNodes.forEach(id => {
            // 혹시 남아 있을 수 있는 .selected 방지
            const el = this.nodes.get(id)?.marker?.getElement();
            el?.classList.remove('selected');
        });
        this.selectedNodes.clear();

        // 전 노드 외형을 NodeType 기준으로 다시 칠함
        this.refreshAllNodeAppearances();

        // 패널도 비움
        this.onNodeSelect?.(null, null);
    }


    toggleSelectNode(nodeId) {
        if (this.selectedNodes.has(nodeId)) {
            this.selectedNodes.delete(nodeId);
        } else {
            this.selectedNodes.add(nodeId);
        }
        this.refreshNodeAppearance(nodeId);

        // 패널 갱신
        if (this.onNodeSelect) {
            if (this.selectedNodes.size >= 2) {
                this.onNodeSelect(null, null);
            } else if (this.selectedNodes.size === 1) {
                const id = [...this.selectedNodes][0];
                const nd = this.nodes.get(id)?.data || null;
                this.onNodeSelect(id, nd);
            } else {
                this.onNodeSelect(null, null);
            }
        }
    }



    // --- 구간 노드 생성 관련 함수들 ---

    handleIntervalCreateClick(latlng) {
        if (!this.intervalCreateStartPos) {
            // 시작점 설정
            this.intervalCreateStartPos = latlng;
            
            // 임시 마커 추가
            this.tempStartMarker = L.circleMarker(latlng, { color: '#00ff00', radius: 8 }).addTo(this.map);
            showNotification('시작점이 선택되었습니다. 끝점을 클릭하세요.', 'info');

            // 마우스 이동에 따른 임시 라인 표시 시작
            this.map.on('mousemove', this.drawTempLine, this);

        } else {
            // 끝점 설정 및 노드 생성 실행
            this.map.off('mousemove', this.drawTempLine, this); // 마우스 이동 이벤트 리스너 제거
            this.generateNodesAlongLine(this.intervalCreateStartPos, latlng);
            this.resetIntervalCreate();
        }
    }

    drawTempLine(e) {
        if (!this.intervalCreateStartPos) return;

        if (this.tempLine) {
            this.map.removeLayer(this.tempLine);
        }

        this.tempLine = L.polyline([this.intervalCreateStartPos, e.latlng], {
            color: '#00ff00',
            dashArray: '5, 10'
        }).addTo(this.map);
    }

    resetIntervalCreate() {
        if (this.tempStartMarker) {
            this.map.removeLayer(this.tempStartMarker);
            this.tempStartMarker = null;
        }
        if (this.tempLine) {
            this.map.removeLayer(this.tempLine);
            this.tempLine = null;
        }
        this.intervalCreateStartPos = null;
        this.map.off('mousemove', this.drawTempLine, this);
    }

    async generateNodesAlongLine(startLatLng, endLatLng) {
        const intervalMeters = parseFloat(document.getElementById('nodeInterval').value);
        if (isNaN(intervalMeters) || intervalMeters <= 0) {
            showNotification('유효한 구간 간격을 입력하세요.', 'error');
            return;
        }

        showLoading();

        try {
            // 1. 시작점과 끝점의 UTM 좌표 얻기
            const startUtm = await pathAPI.latLngToUtm(startLatLng.lat, startLatLng.lng);
            const endUtm = await pathAPI.latLngToUtm(endLatLng.lat, endLatLng.lng);

            if (startUtm.zone_number !== endUtm.zone_number || startUtm.zone_letter !== endUtm.zone_letter) {
                throw new Error('시작점과 끝점이 다른 UTM Zone에 속해있어 계산할 수 없습니다.');
            }

            // 2. 총 거리와 방향 벡터 계산
            const dx = endUtm.easting - startUtm.easting;
            const dy = endUtm.northing - startUtm.northing;
            const totalDistance = Math.sqrt(dx * dx + dy * dy);
            const unitVector = { x: dx / totalDistance, y: dy / totalDistance };

            // 3. 생성할 노드 개수 계산
            const nodeCount = Math.floor(totalDistance / intervalMeters);
            if (nodeCount < 1) {
                showNotification('선택한 거리가 너무 짧아 노드를 생성할 수 없습니다.', 'warning');
                return;
            }

            // 4. 노드 생성
            const newNodes = [];
            for (let i = 1; i <= nodeCount; i++) {
                const newEasting = startUtm.easting + unitVector.x * i * intervalMeters;
                const newNorthing = startUtm.northing + unitVector.y * i * intervalMeters;

                const newLatLng = await pathAPI.utmToLatLng(newEasting, newNorthing, startUtm.zone_number, startUtm.zone_letter);
                
                const nodeData = {
                    GpsInfo: { Lat: newLatLng.lat, Long: newLatLng.lng, Alt: 0 },
                    UtmInfo: { Easting: newEasting, Northing: newNorthing, Zone: `${startUtm.zone_number}${startUtm.zone_letter}` },
                    Maker: 'IntervalCreate',
                    Remark: `${i * intervalMeters}m 지점`
                };

                const createdNode = await pathAPI.createNode(nodeData);
                this.addNode(createdNode);
                uiManager.currentData.Node.push(createdNode);
                newNodes.push(createdNode);
            }
            uiManager.updateNodeTable();

            // 5. 링크 생성
            for (let i = 0; i < newNodes.length - 1; i++) {
                const fromNode = newNodes[i];
                const toNode = newNodes[i + 1];
                const linkData = { 
                    FromNodeID: fromNode.ID, 
                    ToNodeID: toNode.ID, 
                    Length: intervalMeters / 1000 // km 단위로 변환
                };
                const createdLink = await pathAPI.createLink(linkData);
                this.addLink(createdLink);
                uiManager.currentData.Link.push(createdLink);
            }
            uiManager.updateLinkTable();

            showNotification(`${nodeCount}개의 노드와 ${nodeCount - 1}개의 링크가 생성되었습니다.`, 'success');

        } catch (error) {
            handleAPIError(error, '구간 노드 생성 중 오류가 발생했습니다.');
        } finally {
            hideLoading();
        }
    }

    selectOnly(nodeId) {
        // 기존 선택 전부 해제
        this.clearSelections();

        // 단일 선택으로 상태 기록
        this.selectedNode = nodeId;
        this.selectedNodes.add(nodeId); // 내부적으로는 1개만 유지

        // 외형 적용
        this.refreshNodeAppearance(nodeId);

        // 패널 갱신
        if (this.onNodeSelect) {
            const nd = this.nodes.get(nodeId)?.data || null;
            this.onNodeSelect(nodeId, nd);
        }
    }


    isNodeSelected(id) {
        return this.selectedNodes.has(id) || this.selectedNode === id;
    }

    // NodeType → 색상 (요구 색상표)
    nodeTypeToColor(nt) {
        switch (Number(nt)) {
            case 1:  return 'rgb(255,0,0)';      // Red
            case 2:  return 'rgb(0,255,0)';      // Green
            case 3:  return 'rgb(0,0,255)';      // Blue
            case 4:  return 'rgb(255,255,0)';    // Yellow
            case 5:  return 'rgb(255,0,255)';    // Magenta
            case 6:  return 'rgb(0,255,255)';    // Cyan
            case 7:  return 'rgb(255,165,0)';    // Orange
            case 8:  return 'rgb(128,0,128)';    // Purple
            case 9:  return 'rgb(255,192,203)';  // Pink
            case 10: return 'rgb(165,42,42)';    // Brown
            case 11: return 'rgb(128,128,128)';  // Gray
            default: return 'rgb(0,0,0)';        // Black
        }
    }

// 마커의 점(div) 엘리먼트
    _getNodeDot(nodeId) {
        const entry = this.nodes.get(nodeId);
        const el = entry?.marker?.getElement();
        return el ? el.querySelector('div') : null;
    }

// 선택/해제 외형 적용(밝기 1.5배 + 테두리 5배)
    _applySelectVisual(nodeId, selected) {
        const entry = this.nodes.get(nodeId);
        const dot = this._getNodeDot(nodeId);
        if (!entry || !dot) return;

        // 기본색(항상 NodeType 기준으로 다시 칠함)
        dot.style.backgroundColor = this.nodeTypeToColor(entry.data?.NodeType);
        dot.style.filter       = selected ? 'brightness(1.5)' : '';
        dot.style.border       = selected ? '10px solid white' : '2px solid white';

        // 혹시 남아 있을지도 모를 .selected 클래스는 항상 제거(충돌 예방)
        const root = entry.marker.getElement();
        root?.classList.remove('selected');
    }


// 단일 노드 외형 새로고침
    refreshNodeAppearance(nodeId) {
        this._applySelectVisual(nodeId, this.isNodeSelected(nodeId));
    }

// 전 노드 새로고침
    refreshAllNodeAppearances() {
        this.nodes.forEach((_, id) => this.refreshNodeAppearance(id));
    }

    // 드래그 선택 시작
    startSelectionDrag(e) {
        // 노드나 마커를 클릭한 경우는 선택 드래그를 시작하지 않음
        if (e.originalEvent.target.closest('.leaflet-marker-icon')) {
            return;
        }

        this.isSelectionDragging = true;
        this.selectionStartLatLng = e.latlng;
        this.selectionStartPoint = this.map.latLngToContainerPoint(e.latlng);

        // 지도 드래그 비활성화
        this.map.dragging.disable();

        // 선택 사각형 생성
        this.createSelectionRectangle();

        // 이벤트 전파 방지
        L.DomEvent.stopPropagation(e.originalEvent);
        L.DomEvent.preventDefault(e.originalEvent);
    }

    // 드래그 선택 업데이트
    updateSelectionDrag(e) {
        if (!this.isSelectionDragging || !this.selectionStartLatLng) {
            return;
        }

        const currentPoint = this.map.latLngToContainerPoint(e.latlng);
        const startPoint = this.selectionStartPoint;

        // 선택 사각형 업데이트
        const bounds = L.latLngBounds([
            this.selectionStartLatLng,
            e.latlng
        ]);

        if (this.selectionRectangle) {
            this.selectionRectangle.setBounds(bounds);
        }

        // 실시간으로 선택 범위 내 노드들 하이라이트
        this.highlightNodesInBounds(bounds);
    }

    // 드래그 선택 종료
    endSelectionDrag(e) {
        if (!this.isSelectionDragging) {
            return;
        }

        const bounds = L.latLngBounds([
            this.selectionStartLatLng,
            e.latlng
        ]);

        // 선택 범위 내 노드들 실제 선택
        this.selectNodesInBounds(bounds);

        // 정리
        this.cleanupSelectionDrag();
    }

    // 선택 사각형 생성
    createSelectionRectangle() {
        if (this.selectionRectangle) {
            this.map.removeLayer(this.selectionRectangle);
        }

        this.selectionRectangle = L.rectangle(
            L.latLngBounds([this.selectionStartLatLng, this.selectionStartLatLng]),
            {
                color: '#3498db',
                weight: 2,
                fillColor: '#3498db',
                fillOpacity: 0.1,
                dashArray: '5, 5'
            }
        ).addTo(this.map);
    }

    // 범위 내 노드들 하이라이트
    highlightNodesInBounds(bounds) {
        this.nodes.forEach((nodeInfo, nodeId) => {
            const nodeLatLng = nodeInfo.marker.getLatLng();
            const isInBounds = bounds.contains(nodeLatLng);

            // 임시 하이라이트 스타일 적용
            const element = nodeInfo.marker.getElement();
            if (element) {
                if (isInBounds) {
                    element.style.border = '3px solid #e74c3c';
                    element.style.boxShadow = '0 0 10px rgba(231, 76, 60, 0.5)';
                } else {
                    // 원래 스타일로 복원 (기존 선택된 것은 유지)
                    if (this.selectedNodes.has(nodeId)) {
                        element.style.border = '3px solid #e74c3c';
                        element.style.boxShadow = '0 0 10px rgba(231, 76, 60, 0.8)';
                    } else {
                        element.style.border = '2px solid white';
                        element.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
                    }
                }
            }
        });
    }

    // 범위 내 노드들 선택
    selectNodesInBounds(bounds) {
        // 기존 선택 해제 (Ctrl 키가 눌리지 않은 경우)
        if (!this.isCtrlPressed) {
            this.clearSelections();
        }

        let selectedCount = 0;
        this.nodes.forEach((nodeInfo, nodeId) => {
            const nodeLatLng = nodeInfo.marker.getLatLng();
            if (bounds.contains(nodeLatLng)) {
                this.selectedNodes.add(nodeId);
                selectedCount++;
            }
        });

        // 모든 노드 외형 새로고침
        this.refreshAllNodeAppearances();

        // 선택 콜백 호출
        if (this.onNodeSelect) {
            if (this.selectedNodes.size >= 2) {
                this.onNodeSelect(null, null);
            } else if (this.selectedNodes.size === 1) {
                const id = [...this.selectedNodes][0];
                const nd = this.nodes.get(id)?.data || null;
                this.onNodeSelect(id, nd);
            } else {
                this.onNodeSelect(null, null);
            }
        }

        // 알림 표시
        if (selectedCount > 0) {
            showNotification(`${selectedCount}개 노드가 선택되었습니다`, 'info');
        }
    }

    // 드래그 선택 정리
    cleanupSelectionDrag() {
        this.isSelectionDragging = false;
        this.selectionStartPoint = null;
        this.selectionStartLatLng = null;

        // 선택 사각형 제거
        if (this.selectionRectangle) {
            this.map.removeLayer(this.selectionRectangle);
            this.selectionRectangle = null;
        }

        // 지도 드래그 재활성화
        this.map.dragging.enable();
    }

    // Ctrl 키 상태 감지 (다중 선택용)
    get isCtrlPressed() {
        return this.ctrlPressed || false;
    }

    // 키보드 이벤트 리스너 설정
    setupKeyboardListeners() {
        this.ctrlPressed = false;

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.ctrlPressed = true;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!e.ctrlKey && !e.metaKey) {
                this.ctrlPressed = false;
            }
        });

        // 윈도우 포커스가 벗어났을 때 Ctrl 상태 초기화
        window.addEventListener('blur', () => {
            this.ctrlPressed = false;
        });
    }
}