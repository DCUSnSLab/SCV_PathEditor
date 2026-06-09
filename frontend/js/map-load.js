// 지도 기반 불러오기 페이지
// 첫 노드 마커(군집) + 검색 + 폴더 필터 + 경로 미리보기 라인 + 즐겨찾기(localStorage).
// 팝업의 '열기'로 에디터(index.html)로 이동하며 자동 로드.

const FAV_KEY = 'mapload_favorites';

// 마커 클릭 팝업의 '열기' 버튼 → 에디터로 이동(?load=<path>)
window.openPath = function (encodedPath) {
    const path = decodeURIComponent(encodedPath);
    window.location.href = buildAppUrl('/index.html') + '?load=' + encodeURIComponent(path);
};

(function () {
    const KOREA_CENTER = [36.3, 127.8];
    const map = L.map('map', { center: KOREA_CENTER, zoom: 7 });

    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 22, maxNativeZoom: 19
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri', maxZoom: 22, maxNativeZoom: 18
    });
    street.addTo(map);
    L.control.layers({ '거리(OSM)': street, '위성(Esri)': satellite }).addTo(map);

    const cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    cluster.addTo(map);

    const countEl = document.getElementById('count');
    const statusEl = document.getElementById('status');
    const searchBox = document.getElementById('searchBox');
    const folderFilter = document.getElementById('folderFilter');
    const favOnly = document.getElementById('favOnly');
    const showStatus = (msg) => { statusEl.style.display = msg ? 'block' : 'none'; statusEl.textContent = msg || ''; };

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function folderOf(path) { const i = path.indexOf('/'); return i === -1 ? '(루트)' : path.slice(0, i); }

    // ---- 즐겨찾기 (localStorage) ----
    let favorites = new Set();
    try { favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) {}
    const saveFavs = () => localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
    const isFav = (p) => favorites.has(p);

    let entries = [];          // { item, marker, folder }
    const byPath = new Map();  // path -> entry
    const previewCache = new Map();
    let preview = null;

    function markerColor(p) { return isFav(p) ? '#f1c40f' : '#e74c3c'; }

    function buildPopup(it) {
        const fav = isFav(it.path);
        return `
            <div class="pin-popup">
                <strong>${escapeHtml(it.path)}</strong>
                <div class="meta">노드 ${it.nodeCount}개 · 링크 ${it.linkCount}개<br>
                    첫 노드: ${it.lat.toFixed(6)}, ${it.lng.toFixed(6)}</div>
                <button onclick="openPath('${encodeURIComponent(it.path)}')">📂 이 경로 열기</button>
                <button onclick="toggleFav('${encodeURIComponent(it.path)}')" style="background:#f39c12;margin-left:6px;">
                    ${fav ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
            </div>`;
    }

    function buildMarker(it) {
        const marker = L.circleMarker([it.lat, it.lng], {
            radius: 7, color: '#fff', weight: 2, fillColor: markerColor(it.path), fillOpacity: 0.9
        });
        marker._filePath = it.path;  // 주의: Leaflet CircleMarker 내부가 _path 를 사용하므로 다른 이름 사용
        marker.bindPopup(buildPopup(it));
        marker.bindTooltip(it.path, { direction: 'top' });
        return marker;
    }

    // ---- 경로 미리보기 라인 (읽기 전용 /download 사용, 서버 상태 미변경) ----
    function clearPreview() { if (preview) { map.removeLayer(preview); preview = null; } }

    function endpointIcon(bg, label, cls) {
        return L.divIcon({
            className: cls,
            html: `<div style="background:${bg};color:#fff;border:2px solid #fff;border-radius:50%;` +
                  `width:22px;height:22px;display:flex;align-items:center;justify-content:center;` +
                  `font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.45);">${label}</div>`,
            iconSize: [22, 22], iconAnchor: [11, 11]
        });
    }

    // 링크 방향(From→To)으로 출발(들어오는 링크 없음)·도착(나가는 링크 없음) 노드 판정.
    // 링크가 없으면 노드 순서의 첫/마지막으로 대체.
    function findEndpoints(nodes, links, coord) {
        const inDeg = {}, outDeg = {};
        links.forEach(l => { outDeg[l.FromNodeID] = (outDeg[l.FromNodeID] || 0) + 1; inDeg[l.ToNodeID] = (inDeg[l.ToNodeID] || 0) + 1; });
        let startId = null, endId = null;
        if (links.length) {
            for (const n of nodes) { const id = n.ID; if ((outDeg[id] || 0) > 0 && (inDeg[id] || 0) === 0) { startId = id; break; } }
            for (const n of nodes) { const id = n.ID; if ((inDeg[id] || 0) > 0 && (outDeg[id] || 0) === 0) { endId = id; } }
        }
        const withCoord = nodes.filter(n => coord[n.ID]);
        if (!startId || !coord[startId]) startId = withCoord.length ? withCoord[0].ID : null;
        if (!endId || !coord[endId]) endId = withCoord.length ? withCoord[withCoord.length - 1].ID : null;
        return { startId, endId };
    }

    async function showPreview(path) {
        clearPreview();
        let data = previewCache.get(path);
        if (!data) {
            try {
                const res = await fetch(buildAppUrl('/api/path/download?path=' + encodeURIComponent(path)), { headers: { 'Cache-Control': 'no-cache' } });
                if (!res.ok) return;
                data = await res.json();
                previewCache.set(path, data);
            } catch (e) { return; }
        }
        const nodes = data.Node || [], links = data.Link || [];
        const coord = {};
        nodes.forEach(n => { const g = n.GpsInfo || {}; if (typeof g.Lat === 'number' && typeof g.Long === 'number') coord[n.ID] = [g.Lat, g.Long]; });

        const segs = [];
        links.forEach(l => { const a = coord[l.FromNodeID], b = coord[l.ToNodeID]; if (a && b) segs.push([a, b]); });
        const layers = [];
        if (segs.length) {
            layers.push(L.polyline(segs, { className: 'path-preview', color: '#2980b9', weight: 3, opacity: 0.85 }));
        } else {
            const pts = nodes.map(n => coord[n.ID]).filter(Boolean);
            if (pts.length < 2) {
                // 노드가 1개뿐이면 라인 없이 출발 마커만
                if (pts.length === 1) layers.push(L.marker(pts[0], { icon: endpointIcon('#2ecc71', '출', 'endpoint-pin start'), interactive: false }).bindTooltip('출발점'));
                if (!layers.length) return;
                preview = L.layerGroup(layers).addTo(map);
                return;
            }
            layers.push(L.polyline(pts, { className: 'path-preview', color: '#2980b9', weight: 3, opacity: 0.85, dashArray: '4,6' }));
        }

        // 출발/도착 마커
        const { startId, endId } = findEndpoints(nodes, links, coord);
        if (startId && coord[startId]) {
            layers.push(L.marker(coord[startId], { icon: endpointIcon('#2ecc71', '출', 'endpoint-pin start'), interactive: false, zIndexOffset: 1000 }).bindTooltip('출발점', { direction: 'top' }));
        }
        if (endId && coord[endId] && endId !== startId) {
            layers.push(L.marker(coord[endId], { icon: endpointIcon('#c0392b', '도', 'endpoint-pin end'), interactive: false, zIndexOffset: 1000 }).bindTooltip('도착점', { direction: 'top' }));
        }
        preview = L.layerGroup(layers).addTo(map);
    }

    // popupopen/close 는 map 에서 발생 (군집 내 마커 포함). 소스 마커의 _path 로 미리보기 토글
    map.on('popupopen', (e) => { const p = e.popup && e.popup._source && e.popup._source._filePath; if (p) showPreview(p); });
    map.on('popupclose', () => clearPreview());

    // ---- 즐겨찾기 토글 (팝업 버튼) ----
    window.toggleFav = function (encodedPath) {
        const path = decodeURIComponent(encodedPath);
        const e = byPath.get(path); if (!e) return;
        if (favorites.has(path)) favorites.delete(path); else favorites.add(path);
        saveFavs();
        e.marker.setStyle({ fillColor: markerColor(path) });
        e.marker.setPopupContent(buildPopup(e.item));
        if (favOnly.checked) applyFilter(false);
    };

    // ---- 필터 ----
    function applyFilter(fit) {
        const q = (searchBox.value || '').trim().toLowerCase();
        const folder = folderFilter.value;
        const favMode = favOnly.checked;
        cluster.clearLayers();
        const visible = [];
        for (const e of entries) {
            if (favMode && !isFav(e.item.path)) continue;
            if (folder && e.folder !== folder) continue;
            if (q && !e.item.path.toLowerCase().includes(q)) continue;
            cluster.addLayer(e.marker);
            visible.push(e.marker);
        }
        countEl.textContent = `경로 ${visible.length} / ${entries.length}개`;
        if (visible.length === 0) {
            showStatus(favMode ? '즐겨찾기한 경로가 없습니다.' : '조건에 맞는 경로가 없습니다.');
        } else {
            showStatus('');
            if (fit) { try { map.fitBounds(L.featureGroup(visible).getBounds(), { padding: [40, 40], maxZoom: 17 }); } catch (e) {} }
        }
    }

    function populateFolders() {
        Array.from(new Set(entries.map(e => e.folder))).sort().forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            folderFilter.appendChild(opt);
        });
    }

    let searchTimer = null;
    searchBox.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => applyFilter(true), 200); });
    folderFilter.addEventListener('change', () => applyFilter(true));
    favOnly.addEventListener('change', () => applyFilter(true));

    async function load() {
        let items;
        try { items = await pathAPI.listOverview(); }
        catch (e) { countEl.textContent = '불러오기 실패'; showStatus('경로 목록을 불러오지 못했습니다: ' + (e.message || e)); return; }
        if (!Array.isArray(items) || items.length === 0) { countEl.textContent = '표시할 경로 없음'; showStatus('첫 노드 좌표가 있는 경로 파일이 없습니다.'); return; }
        entries = items.map(it => { const e = { item: it, marker: buildMarker(it), folder: folderOf(it.path) }; byPath.set(it.path, e); return e; });
        populateFolders();
        applyFilter(true);
    }

    load();
})();
