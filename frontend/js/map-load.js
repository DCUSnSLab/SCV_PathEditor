// 지도 기반 불러오기 페이지
// 각 path 파일의 첫 노드 좌표에 마커를 찍고, 팝업의 '열기' 버튼으로 에디터(index.html)로 이동하며 자동 로드.

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

    const countEl = document.getElementById('count');
    const statusEl = document.getElementById('status');
    const showStatus = (msg) => { statusEl.style.display = 'block'; statusEl.textContent = msg; };

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

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

        const group = L.featureGroup();
        items.forEach(it => {
            const marker = L.circleMarker([it.lat, it.lng], {
                radius: 7, color: '#fff', weight: 2,
                fillColor: '#e74c3c', fillOpacity: 0.9
            });
            const html = `
                <div class="pin-popup">
                    <strong>${escapeHtml(it.path)}</strong>
                    <div class="meta">노드 ${it.nodeCount}개 · 링크 ${it.linkCount}개<br>
                        첫 노드: ${it.lat.toFixed(6)}, ${it.lng.toFixed(6)}</div>
                    <button onclick="openPath('${encodeURIComponent(it.path)}')">📂 이 경로 열기</button>
                </div>`;
            marker.bindPopup(html);
            marker.bindTooltip(it.path, { direction: 'top' });
            marker.addTo(group);
        });
        group.addTo(map);

        try { map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 17 }); } catch (e) {}
        countEl.textContent = `경로 ${items.length}개`;
    }

    load();
})();
