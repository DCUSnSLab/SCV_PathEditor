from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api.path_api import router as path_router
from app.api.coords_api import router as coords_router
from app.api.semantic_api import router as semantic_router
from app.api.lidar_api import router as lidar_router

# FastAPI 앱 생성
app = FastAPI(
    title="SCV Path Editor Web API",
    description="Web-based path editor for autonomous vehicle routing",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 구체적인 도메인으로 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(path_router)
app.include_router(coords_router)
app.include_router(semantic_router)
app.include_router(lidar_router)

# 정적 파일 서빙 (프론트엔드)
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트"""
    return {"status": "healthy", "message": "SCV Path Editor Web API is running"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=["app"]
    )