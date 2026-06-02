"""SCV Path Editor 백엔드 API 테스트."""


def _full_node(node_id, lat, lon):
    return {
        "ID": node_id,
        "GpsInfo": {"Lat": lat, "Long": lon, "Alt": 0.0},
        "UtmInfo": {"Easting": 0.0, "Northing": 0.0, "Zone": "52S"},
    }


def _full_link(link_id, from_id, to_id, length=0.1):
    return {"ID": link_id, "FromNodeID": from_id, "ToNodeID": to_id, "Length": length}


# ---- 기본 엔드포인트 ----

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_config_has_mapbox_key(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    assert "mapboxToken" in r.json()


# ---- 좌표 변환 ----

def test_coords_roundtrip(client):
    lat, lon = 35.886, 128.611  # 대구 인근 (UTM zone 52)
    r = client.post("/api/coords/latlng-to-utm", json={"lat": lat, "lng": lon})
    assert r.status_code == 200
    utm = r.json()
    assert utm["zone_number"] == 52  # 하드코딩 "52N" 이 아닌 실제 산출 확인

    r2 = client.post("/api/coords/utm-to-latlng", json={
        "easting": utm["easting"], "northing": utm["northing"],
        "zone_number": utm["zone_number"], "zone_letter": utm["zone_letter"],
    })
    assert r2.status_code == 200
    back = r2.json()
    assert abs(back["lat"] - lat) < 1e-4
    assert abs(back["lng"] - lon) < 1e-4


# ---- 노드 CRUD ----

def test_node_crud(client):
    payload = {
        "GpsInfo": {"Lat": 35.0, "Long": 128.0, "Alt": 0.0},
        "UtmInfo": {"Easting": 0.0, "Northing": 0.0, "Zone": "52S"},
    }
    r = client.post("/api/path/nodes", json=payload)
    assert r.status_code == 200
    node_id = r.json()["ID"]
    assert node_id.startswith("N")

    assert any(n["ID"] == node_id for n in client.get("/api/path/nodes").json())
    assert client.get(f"/api/path/nodes/{node_id}").status_code == 200

    assert client.delete(f"/api/path/nodes/{node_id}").status_code == 200
    assert client.get(f"/api/path/nodes/{node_id}").status_code == 404


def test_link_requires_existing_nodes(client):
    r = client.post("/api/path/links", json=_full_link("LXX", "N9998", "N9999"))
    assert r.status_code == 404


# ---- 저장 / 로드 / 목록 ----

def test_save_load_and_meta(client):
    data = {
        "Node": [_full_node("N0001", 35.0, 128.0), _full_node("N0002", 35.001, 128.001)],
        "Link": [_full_link("L00010002", "N0001", "N0002")],
    }
    r = client.post("/api/path/save/test_suite.json", json=data)
    assert r.status_code == 200

    r = client.get("/api/path/load", params={"path": "test_suite.json"})
    assert r.status_code == 200
    loaded = r.json()
    assert len(loaded["Node"]) == 2 and len(loaded["Link"]) == 1

    assert "test_suite.json" in client.get("/api/path/files").json()

    meta = client.get("/api/path/files/meta").json()
    entry = next((m for m in meta if m["path"] == "test_suite.json"), None)
    assert entry is not None and entry["size"] > 0


def test_save_rejects_non_json(client):
    data = {"Node": [], "Link": []}
    assert client.post("/api/path/save/bad.txt", json=data).status_code == 400


# ---- 보안 / 회귀 ----

def test_upload_rejects_path_traversal(client):
    files = {"file": ("../evil.json", b'{"Node": [], "Link": []}', "application/json")}
    r = client.post("/api/path/upload", files=files)
    assert r.status_code == 400  # 데이터 루트 밖 경로 차단


def test_removed_clipboard_endpoint(client):
    # 서버측 클립보드 API 제거 회귀 가드
    assert client.get("/api/path/clipboard/status").status_code == 404
