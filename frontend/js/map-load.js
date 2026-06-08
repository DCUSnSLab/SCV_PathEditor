// 지도 기반 불러오기 페이지
// 각 path 파일의 첫 노드 좌표에 마커(군집) + 검색 + 폴더 필터.
// 팝업의 '열기' 버튼으로 에디터(index.html)로 이동하며 자동 로드.

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

    // 군집 그룹
    const cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    cluster.addTo(map);

    const countEl = document.getElementById('count');
    const statusEl = document.getElementById('status');
    const searchBox = document.getElementById('searchBox');
    const folderFilter = document.getElementById('folderFilter');
    const showStatus = (msg) => { statusEl.style.display = msg ? 'block' : 'none'; statusEl.textContent = msg || ''; };

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function folderOf(path) {
        const i = path.indexOf('/');
        return i === -1 ? '(루트)' : path.slice(0, i);
    }

    let entries = [];  // { item, marker, folder }

    function buildMarker(it) {
        const marker = L.circleMarker([it.lat, it.lng], {
            radius: 7, color: '#fff', weight: 2, fillColor: '#e74c3c', fillOpacity: 0.9
        });
        marker.bindPopup(`
            <div class="pin-popup">
                <strong>${escapeHtml(it.path)}</strong>
                <div class="meta">노드 ${it.nodeCount}개 · 링크 ${it.linkCount}개<br>
                    첫 노드: ${it.lat.toFixed(6)}, ${it.lng.toFixed(6)}</div>
                <button onclick="openPath('${encodeURIComponent(it.path)}')">📂 이 경로 열기</button>
            </div>`);
        marker.bindTooltip(it.path, { direction: 'top' });
        return marker;
    }

    function applyFilter(fit) {
        const q = (searchBox.value || '').trim().toLowerCase();
        const folder = folderFilter.value;
        cluster.clearLayers();
        const visible = [];
        for (const e of entries) {
            if (folder && e.folder !== folder) continue;
            if (q && !e.item.path.toLowerCase().includes(q)) continue;
            cluster.addLayer(e.marker);
            visible.push(e.marker);
        }
        countEl.textContent = `경로 ${visible.length} / ${entries.length}개`;
        if (visible.length === 0) {
            showStatus('조건에 맞는 경로가 없습니다.');
        } else {
            showStatus('');
            if (fit) { try { map.fitBounds(L.featureGroup(visible).getBounds(), { padding: [40, 40], maxZoom: 17 }); } catch (e) {} }
        }
    }

    function populateFolders() {
        const folders = Array.from(new Set(entries.map(e => e.folder))).sort();
        for (const f of folders) {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            folderFilter.appendChild(opt);
        }
    }

    let searchTimer = null;
    searchBox.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => applyFilter(false), 200);
    });
    folderFilter.addEventListener('change', () => applyFilter(true));

    async function load() {
        let items;
        try {
            items = await pathAPI.listOverview();
        } catch (e) {
            countEl.textContent = '불러오기 실패';
            showStatus('경로 목록을 불러오지 못했습니다: ' + (e.message || e));
            return;
        }
        if (!Array.isArray(items) || items.length === 0) {
            countEl.textContent = '표시할 경로 없음';
            showStatus('첫 노드 좌표가 있는 경로 파일이 없습니다.');
            return;
        }
        entries = items.map(it => ({ item: it, marker: buildMarker(it), folder: folderOf(it.path) }));
        populateFolders();
        applyFilter(true);
    }

    load();
})();
