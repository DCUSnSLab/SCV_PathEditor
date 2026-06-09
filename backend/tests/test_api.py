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


# ---- QA 회귀 (PR-A): 의도한 4xx 가 500 으로 삼켜지지 않는지 ----

def test_delete_link_missing_returns_404(client):
    # B2: except Exception 이 404 를 삼키지 않아야 함 (이전엔 500)
    assert client.delete("/api/path/links/LZZZZ9999").status_code == 404


def test_delete_node_missing_returns_404(client):
    assert client.delete("/api/path/nodes/NZZZZ9999").status_code == 404


def test_update_position_missing_returns_404(client):
    r = client.put("/api/path/nodes/NZZZZ9999/position", params={"lat": 35.0, "lon": 128.0})
    assert r.status_code == 404


def test_save_oversize_returns_413(client):
    # B1: 413 이 직렬화 except 에 삼켜지지 않고 그대로 반환되어야 함
    big_remark = "x" * 6000
    nodes = [dict(ID=f"N{i:05d}", Remark=big_remark,
                  GpsInfo={"Lat": 35.0, "Long": 128.0, "Alt": 0.0},
                  UtmInfo={"Easting": 0.0, "Northing": 0.0, "Zone": "52S"})
             for i in range(2000)]  # ≈12MB
    r = client.post("/api/path/save/qa_big.json", json={"Node": nodes, "Link": []})
    assert r.status_code == 413


def test_download_folder_returns_404(client):
    # B5: 폴더 다운로드는 _safe_join 단계에서 404
    client.post("/api/path/files/mkdir", json={"path": "qa_dlfolder"})
    assert client.get("/api/path/download", params={"path": "qa_dlfolder"}).status_code == 404


def test_files_overview(client):
    # 지도 기반 불러오기: 첫 노드 좌표 + 요약 반환, 노드 없는 파일은 제외
    with_nodes = {"Node": [_full_node("N0001", 35.123456, 128.654321), _full_node("N0002", 35.2, 128.7)],
                  "Link": [_full_link("L00010002", "N0001", "N0002")]}
    assert client.post("/api/path/save/qa_ov_a.json", json=with_nodes).status_code == 200
    assert client.post("/api/path/save/qa_ov_empty.json", json={"Node": [], "Link": []}).status_code == 200

    ov = client.get("/api/path/overview")
    assert ov.status_code == 200
    data = ov.json()
    entry = next((x for x in data if x["path"] == "qa_ov_a.json"), None)
    assert entry is not None
    assert abs(entry["lat"] - 35.123456) < 1e-6 and abs(entry["lng"] - 128.654321) < 1e-6
    assert entry["nodeCount"] == 2 and entry["linkCount"] == 1
    # 노드 없는 파일은 마커 대상에서 제외
    assert all(x["path"] != "qa_ov_empty.json" for x in data)


def test_overview_cache_reflects_changes(client):
    import os, time
    save = lambda body: client.post("/api/path/save/qa_cache.json", json=body)
    assert save({"Node": [_full_node("N0001", 35.0, 128.0)], "Link": []}).status_code == 200
    e = next((x for x in client.get("/api/path/overview").json() if x["path"] == "qa_cache.json"), None)
    assert e and e["nodeCount"] == 1 and e["linkCount"] == 0

    # 내용 변경(노드 2/링크 1) + mtime 갱신 → 캐시 무효화되어 새 요약 반환
    assert save({"Node": [_full_node("N0001", 35.0, 128.0), _full_node("N0002", 35.1, 128.1)],
                 "Link": [_full_link("L00010002", "N0001", "N0002")]}).status_code == 200
    fp = os.path.join(os.environ["APP_DATA_DIR"], "qa_cache.json")
    os.utime(fp, (time.time() + 10, time.time() + 10))
    e2 = next((x for x in client.get("/api/path/overview").json() if x["path"] == "qa_cache.json"), None)
    assert e2 and e2["nodeCount"] == 2 and e2["linkCount"] == 1

    # 삭제 후 overview(캐시)에서 제거
    assert client.post("/api/path/files/delete", json={"path": "qa_cache.json"}).status_code == 200
    assert all(x["path"] != "qa_cache.json" for x in client.get("/api/path/overview").json())


def test_get_load_syncs_server_state(client):
    # B3: GET /load 가 서버 인메모리 상태를 채워, 로드한 데이터의 삭제가 동작해야 함
    data = {"Node": [_full_node("N0001", 35.0, 128.0), _full_node("N0002", 35.001, 128.001)],
            "Link": [_full_link("L00010002", "N0001", "N0002")]}
    assert client.post("/api/path/save/qa_sync_a.json", json=data).status_code == 200
    # 서버 상태를 빈 파일 저장으로 비움
    assert client.post("/api/path/save/qa_sync_empty.json", json={"Node": [], "Link": []}).status_code == 200
    assert len(client.get("/api/path/nodes").json()) == 0
    # GET 로드 후 서버 상태가 다시 채워지는지
    assert client.get("/api/path/load", params={"path": "qa_sync_a.json"}).status_code == 200
    assert len(client.get("/api/path/nodes").json()) == 2
    # 로드한 링크 삭제가 200 (이전엔 서버에 없어 500/404)
    assert client.delete("/api/path/links/L00010002").status_code == 200
