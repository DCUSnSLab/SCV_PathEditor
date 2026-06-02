from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api.path_api import router as path_router
from app.api.coords_api import router as coords_router

# FastAPI 앱 생성
app = FastAPI(
    title="SCV Path Editor Web API",
    description="Web-based path editor for autonomous vehicle routing",
    version="1.0.0"
)

# CORS 설정
# 허용 출처는 환경변수 CORS_ALLOW_ORIGINS(쉼표 구분)로 제어한다. 기본값은 개발 편의를 위한 "*".
# 주의: 와일드카드("*")와 allow_credentials=True 는 브라우저 CORS 규약상 함께 쓸 수 없으므로,
#       와일드카드일 때는 credentials 를 비활성화한다. 프로덕션에서는 구체 도메인을 지정할 것.
_cors_origins_env = os.environ.get("CORS_ALLOW_ORIGINS", "*")
allow_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]
allow_credentials = "*" not in allow_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(path_router)
app.include_router(coords_router)

@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트"""
    return {"status": "healthy", "message": "SCV Path Editor Web API is running"}

@app.get("/api/config")
async def get_config():
    """프런트엔드 런타임 설정 (소스에 비밀값을 두지 않기 위해 서버 env 에서 주입).

    - mapboxToken: 환경변수 MAPBOX_TOKEN (미설정 시 빈 문자열 → 프런트는 Esri 위성으로 대체)
    """
    return {"mapboxToken": os.environ.get("MAPBOX_TOKEN", "")}

# 정적 파일 서빙 (프론트엔드)
# 주의: "/" 마운트는 모든 경로를 가로채므로, 반드시 모든 API/라우트 등록 이후에 둔다.
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"]
    )