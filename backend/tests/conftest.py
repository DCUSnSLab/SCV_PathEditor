import os
import sys
import tempfile

# 앱 import 전에 데이터 디렉터리를 임시 경로로 지정 (실제 데이터 오염 방지)
_TMP = tempfile.mkdtemp(prefix="scv_test_")
os.environ["APP_DATA_DIR"] = os.path.join(_TMP, "path")

# backend 디렉터리를 import 경로에 추가 (from main import app)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from main import app
    with TestClient(app) as c:
        yield c
