// Map management using Leaflet
class PathMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.nodes = new Map(); // nodeId -> {marker, data}
        this.links = new Map(); // linkId -> {polyline, data}
        this.selectedNode = null;
        this.mode = 'select'; // select, drag, addNode, quickLink
        this.quickLinkFirstNode = null;
        
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
        
        this.initMap();
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

        // 타일 레이어 추가 (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        // 지도 클릭 이벤트
        this.map.on('click', (e) => {
            this.handleMapClick(e);
        });

        // 줌 변경 시 마커 크기 조정
        this.map.on('zoomend', () => {
            this.updateMarkerSizes();
        });

        // 전역 마우스 이벤트 (드래그용)
        this.map.on('mousemove', (e) => {
            this.handleGlobalMouseMove(e);
        });

        this.map.on('mouseup', (e) => {
            this.handleGlobalMouseUp(e);
        });
    }

    handleMapClick(e) {
        const { lat, lng } = e.latlng;
        
        if (this.mode === 'addNode') {
            this.handleAddNodeClick(lat, lng);
        } else if (this.mode === 'quickLink') {
            this.handleQuickLinkClick(e);
        }
        
        if (this.onMapClick) {
            this.onMapClick(lat, lng, this.mode);
        }
    }

    handleAddNodeClick(lat, lng) {
        if (this.onMapClick) {
            this.onMapClick(lat, lng, 'addNode');
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
                                   mode === 'quickLink' ? 'pointer' : 'default';
        
        // QuickLink 모드가 아닐 때 선택 상태 초기화
        if (mode !== 'quickLink') {
            this.resetQuickLinkSelection();
        }
        
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

        // 일반 마커로 변경 (CircleMarker 대신 Marker 사용)
        const customIcon = L.divIcon({
            className: 'node-marker',
            html: `<div style="background-color: #e74c3c; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const marker = L.marker(latlng, {
            icon: customIcon,
            draggable: false
        });

        // 드래그 상태 추적을 위한 플래그
        marker._isDraggable = false;
        marker._nodeId = ID;

        // 라벨 추가
        const label = L.tooltip({
            permanent: true,
            direction: 'top',
            offset: [0, -10],
            className: 'node-label'
        }).setContent(ID);

        marker.bindTooltip(label);

        // 팝업 추가
        const popupContent = `
            <div>
                <strong>Node: ${ID}</strong><br>
                위도: ${GpsInfo.Lat.toFixed(6)}<br>
                경도: ${GpsInfo.Long.toFixed(6)}<br>
                고도: ${GpsInfo.Alt.toFixed(2)}m
            </div>
        `;
        marker.bindPopup(popupContent);

        // 이벤트 핸들러
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (this.mode === 'select') {
                this.selectNode(ID);
            }
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

        // 지도에 추가
        marker.addTo(this.map);

        // 저장
        this.nodes.set(ID, { marker, data: nodeData });

        return marker;
    }

    removeNode(nodeId) {
        const nodeInfo = this.nodes.get(nodeId);
        if (nodeInfo) {
            this.map.removeLayer(nodeInfo.marker);
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
        // 이전 선택 해제
        if (this.selectedNode) {
            this.highlightNode(this.selectedNode, '#e74c3c');
        }

        // 새 노드 선택
        this.selectedNode = nodeId;
        this.highlightNode(nodeId, '#f1c40f');

        if (this.onNodeSelect) {
            const nodeInfo = this.nodes.get(nodeId);
            this.onNodeSelect(nodeId, nodeInfo ? nodeInfo.data : null);
        }
    }

    highlightNode(nodeId, color) {
        const nodeInfo = this.nodes.get(nodeId);
        if (nodeInfo) {
            const element = nodeInfo.marker.getElement();
            if (element) {
                const iconDiv = element.querySelector('div');
                if (iconDiv) {
                    iconDiv.style.backgroundColor = color;
                }
                
                // 선택된 노드 클래스 추가/제거
                if (color === '#f1c40f') {
                    element.classList.add('selected');
                } else {
                    element.classList.remove('selected');
                }
            }
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

    handleGlobalMouseMove(e) {
        if (this.isDragging && this.draggedMarker && this.mode === 'drag') {
            // 마커 위치는 즉시 업데이트
            this.draggedMarker.setLatLng(e.latlng);
            
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
    }

    handleGlobalMouseUp(e) {
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
}