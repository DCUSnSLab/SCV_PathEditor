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
    const clearPreviewBtn = document.getElementById('clearPreviewBtn');
    const showStatus = (msg) => { statusEl.style.display = msg ? 'block' : 'none'; statusEl.textContent = msg || ''; };

    // escapeHtml 은 api.js 의 전역 헬퍼 사용 (중복 정의 제거)
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

    function buildPopup(it, note) {
        const fav = isFav(it.path);
        return `
            <div class="pin-popup">
                <strong>${escapeHtml(it.path)}</strong>
                <div class="meta">노드 ${it.nodeCount}개 · 링크 ${it.linkCount}개<br>
                    첫 노드: ${it.lat.toFixed(6)}, ${it.lng.toFixed(6)}</div>
                <button onclick="openPath('${encodeURIComponent(it.path)}')">📂 이 경로 열기</button>
                <button onclick="toggleFav('${encodeURIComponent(it.path)}')" style="background:#f39c12;margin-left:6px;">
                    ${fav ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
                ${note || ''}
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
    // 팝업을 닫아도 미리보기는 유지된다(사용자가 팝업 없이 경로를 살펴볼 수 있도록).
    // 다른 마커를 클릭하면 그 경로로 교체되고, 명시적으로 '미리보기 닫기' 버튼을 눌러야 사라진다.
    function clearPreview() {
        if (preview) { map.removeLayer(preview); preview = null; }
        if (clearPreviewBtn) clearPreviewBtn.style.display = 'none';
    }

    if (clearPreviewBtn) clearPreviewBtn.addEventListener('click', clearPreview);

    function endpointIcon(bg, label, cls) {
        return L.divIcon({
            className: cls,
            html: `<div style="background:${bg};color:#fff;border:2px solid #fff;border-radius:50%;` +
                  `width:22px;height:22px;display:flex;align-items:center;justify-content:center;` +
                  `font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.45);">${label}</div>`,
            iconSize: [22, 22], iconAnchor: [11, 11]
        });
    }

    // 링크 방향(From→To)으로 출발(들어오는 링크 없음)·도착(나가는 링크 없음) 노드 후보를 찾는다.
    // 후보가 정확히 1개씩일 때만 '명확'하다고 보고 표시한다. 순환 구조(후보 0개)나 분기/합류가
    // 있는 도로망(후보 2개 이상)에서는 임의로 하나를 골라 보여주면 오해를 줄 수 있어 표시하지 않는다.
    function computeEndpoints(nodes, links) {
        if (!links.length) {
            // 링크가 없는 경우: 노드가 1개뿐이면 그 점 자체가 유일한 지점이므로 명확, 그 외엔 판단 불가
            return nodes.length === 1
                ? { startId: nodes[0].ID, endId: null, ambiguous: false }
                : { startId: null, endId: null, ambiguous: nodes.length > 1 };
        }
        const inDeg = {}, outDeg = {};
        links.forEach(l => { outDeg[l.FromNodeID] = (outDeg[l.FromNodeID] || 0) + 1; inDeg[l.ToNodeID] = (inDeg[l.ToNodeID] || 0) + 1; });
        const starts = nodes.filter(n => (outDeg[n.ID] || 0) > 0 && (inDeg[n.ID] || 0) === 0);
        const ends = nodes.filter(n => (inDeg[n.ID] || 0) > 0 && (outDeg[n.ID] || 0) === 0);
        if (starts.length === 1 && ends.length === 1) {
            return { startId: starts[0].ID, endId: ends[0].ID, ambiguous: false };
        }
        return { startId: null, endId: null, ambiguous: true };
    }

    async function showPreview(path, sourceMarker) {
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
        let hasLine = false;
        if (segs.length) {
            layers.push(L.polyline(segs, { className: 'path-preview', color: '#2980b9', weight: 3, opacity: 0.85 }));
            hasLine = true;
        } else {
            const pts = nodes.map(n => coord[n.ID]).filter(Boolean);
            if (pts.length >= 2) {
                layers.push(L.polyline(pts, { className: 'path-preview', color: '#2980b9', weight: 3, opacity: 0.85, dashArray: '4,6' }));
                hasLine = true;
            }
        }

        // 출발/도착 마커 (명확한 경우에만)
        const { startId, endId, ambiguous } = computeEndpoints(nodes, links);
        if (!ambiguous) {
            if (startId && coord[startId]) {
                layers.push(L.marker(coord[startId], { icon: endpointIcon('#2ecc71', '출', 'endpoint-pin start'), interactive: false, zIndexOffset: 1000 }).bindTooltip('출발점', { direction: 'top' }));
            }
            if (endId && coord[endId] && endId !== startId) {
                layers.push(L.marker(coord[endId], { icon: endpointIcon('#c0392b', '도', 'endpoint-pin end'), interactive: false, zIndexOffset: 1000 }).bindTooltip('도착점', { direction: 'top' }));
            }
        }
        if (!layers.length) return;

        // 새 미리보기가 준비된 시점에만 이전 것을 교체(로딩 중 깜빡임/공백 방지)
        clearPreview();
        preview = L.layerGroup(layers).addTo(map);
        if (clearPreviewBtn) {
            clearPreviewBtn.style.display = 'inline-block';
            clearPreviewBtn.textContent = '✕ 미리보기 닫기 (' + path.split('/').pop() + ')';
        }

        // 순환/분기 등으로 출발·도착이 명확하지 않으면 팝업에 안내를 덧붙인다
        if (ambiguous && hasLine && sourceMarker) {
            const entry = byPath.get(path);
            if (entry) {
                const note = '<div style="color:#c0392b;font-size:11px;margin-top:6px;">⚠ 출발/도착점이 명확하지 않은 경로입니다(순환·분기 구조)</div>';
                sourceMarker.setPopupContent(buildPopup(entry.item, note));
            }
        }
    }

    // popupopen 은 map 에서 발생(군집 내 마커 포함). 소스 마커의 _filePath 로 미리보기 표시.
    // popupclose 에서는 더 이상 미리보기를 지우지 않는다 — 팝업을 닫아도 경로를 계속 볼 수 있도록.
    map.on('popupopen', (e) => {
        const src = e.popup && e.popup._source;
        const p = src && src._filePath;
        if (p) showPreview(p, src);
    });

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
