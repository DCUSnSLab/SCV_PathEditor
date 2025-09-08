from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from typing import List
import json
import tempfile
import os
from pydantic import BaseModel
from pathlib import Path

from ..models.path_models import (
    Node, Link, PathData, NodeCreate, LinkCreate, 
    NodeUpdate, LinkUpdate
)
from ..services.path_service import PathService

router = APIRouter(prefix="/api/path", tags=["path"])

# 전역 서비스 인스턴스
path_service = PathService()


@router.get("/files", response_model=List[str])
async def list_files():
    """사용 가능한 JSON 파일 목록 반환"""
    try:
        files = path_service.list_available_files()
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/load/{filename}", response_model=PathData)
async def load_path_data(filename: str):
    """JSON 파일에서 경로 데이터 로드"""
    try:
        path_data = path_service.load_path_data(filename)
        return path_data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save/{filename}")
async def save_path_data(filename: str, path_data: PathData):
    """경로 데이터를 JSON 파일로 저장"""
    try:
        result = path_service.save_path_data(filename, path_data)
        return {"message": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/current", response_model=PathData)
async def get_current_data():
    """현재 로드된 경로 데이터 반환"""
    try:
        return path_service.get_current_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """JSON 파일 업로드"""
    if not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are allowed")
    
    try:
        # 임시 파일로 저장
        with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.json') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        # JSON 유효성 검사
        with open(tmp_file_path, 'r', encoding='utf-8') as f:
            json_data = json.load(f)
        
        # 데이터 구조 검사
        if "Node" not in json_data or "Link" not in json_data:
            raise HTTPException(status_code=400, detail="Invalid JSON structure. Must contain 'Node' and 'Link' arrays")
        
        # 최종 저장 위치로 이동
        final_path = os.path.join(path_service.data_dir, file.filename)
        os.makedirs(os.path.dirname(final_path), exist_ok=True)
        os.rename(tmp_file_path, final_path)
        
        return {"message": f"File {file.filename} uploaded successfully"}
    
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        # 임시 파일 정리
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_file(filename: str):
    """JSON 파일 다운로드"""
    file_path = os.path.join(path_service.data_dir, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='application/json'
    )


# Node API
@router.get("/nodes", response_model=List[Node])
async def get_all_nodes():
    """모든 노드 목록 반환"""
    try:
        return path_service.current_nodes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nodes/{node_id}", response_model=Node)
async def get_node(node_id: str):
    """특정 노드 정보 반환"""
    node = path_service.get_node_by_id(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


@router.post("/nodes", response_model=Node)
async def create_node(node_data: NodeCreate):
    """새 노드 생성"""
    try:
        new_node = path_service.add_node(node_data)
        return new_node
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/nodes/{node_id}/position")
async def update_node_position(node_id: str, lat: float, lon: float):
    """노드 위치 업데이트"""
    try:
        updated_node = path_service.update_node(node_id, lat, lon)
        if not updated_node:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        return {"message": f"Node {node_id} position updated", "node": updated_node}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str):
    """노드 삭제"""
    try:
        success = path_service.delete_node(node_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        return {"message": f"Node {node_id} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Link API
@router.get("/links", response_model=List[Link])
async def get_all_links():
    """모든 링크 목록 반환"""
    try:
        return path_service.current_links
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/links/{link_id}", response_model=Link)
async def get_link(link_id: str):
    """특정 링크 정보 반환"""
    link = path_service.get_link_by_id(link_id)
    if not link:
        raise HTTPException(status_code=404, detail=f"Link {link_id} not found")
    return link


@router.post("/links", response_model=Link)
async def create_link(link_data: LinkCreate):
    """새 링크 생성"""
    try:
        # FromNodeID와 ToNodeID가 존재하는지 확인
        from_node = path_service.get_node_by_id(link_data.FromNodeID)
        to_node = path_service.get_node_by_id(link_data.ToNodeID)
        
        if not from_node:
            raise HTTPException(status_code=404, detail=f"FromNode {link_data.FromNodeID} not found")
        if not to_node:
            raise HTTPException(status_code=404, detail=f"ToNode {link_data.ToNodeID} not found")
        
        new_link = path_service.add_link(link_data)
        return new_link
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/links/{link_id}")
async def delete_link(link_id: str):
    """링크 삭제"""
    try:
        success = path_service.delete_link(link_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Link {link_id} not found")
        return {"message": f"Link {link_id} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 안전한 경로 합성: 데이터 루트 밖으로 못 나가게 보호
def _resolve_path(rel_path: str) -> Path:
    base = Path(path_service.data_dir).resolve()
    target = (base / rel_path).resolve()
    if base == target or str(target).startswith(str(base) + os.sep):
        return target
    raise HTTPException(status_code=400, detail="Invalid path (outside data dir)")

class MkdirReq(BaseModel):
    path: str  # 생성할 폴더의 '상대 경로' (예: 'subdir' 또는 'a/b/new')

class DeleteReq(BaseModel):
    path: str  # 삭제할 파일의 '상대 경로' (예: 'a/sample.json')

class MoveReq(BaseModel):
    src: str   # 파일의 '상대 경로' (예: 'a/foo.json')
    dest: str  # '대상 폴더'의 '상대 경로' (예: 'b' 또는 'b/c')

@router.post("/files/mkdir")
async def create_folder(req: MkdirReq):
    """폴더 생성"""
    try:
        target = _resolve_path(req.path)
        target.mkdir(parents=True, exist_ok=False)
        return {"message": f"Folder created: {req.path}"}
    except FileExistsError:
        raise HTTPException(status_code=409, detail="Folder already exists")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/delete")
async def delete_file(req: DeleteReq):
    """파일 삭제(폴더는 대상 아님)"""
    try:
        target = _resolve_path(req.path)
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
        if target.is_dir():
            raise HTTPException(status_code=400, detail="Deleting folders is not allowed")
        # (원하면 확장자 제한) if target.suffix.lower() != ".json": raise HTTPException(400, "Only .json")
        target.unlink()
        return {"message": f"Deleted: {req.path}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/move")
async def move_file(req: MoveReq):
    """파일을 폴더로 이동 (dest는 '폴더')"""
    try:
        src = _resolve_path(req.src)
        if not src.exists() or not src.is_file():
            raise HTTPException(status_code=404, detail="Source file not found")

        dest_dir = _resolve_path(req.dest) if req.dest else Path(path_service.data_dir).resolve()
        if not dest_dir.exists():
            raise HTTPException(status_code=404, detail="Destination folder not found")
        if not dest_dir.is_dir():
            raise HTTPException(status_code=400, detail="Destination must be a folder")

        dest = dest_dir / src.name
        # 동일 파일명 존재 시 충돌
        if dest.exists():
            raise HTTPException(status_code=409, detail="A file with the same name already exists in destination")

        src.replace(dest)  # 원자적 move 시도
        return {"message": f"Moved: {req.src} -> {req.dest}/"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/files/dirs", response_model=List[str])
async def list_directories():
    """
    데이터 루트 아래의 디렉터리 상대경로 목록 반환 (빈 폴더 포함)
    예: ["demo", "demo/new-sub", "configs"]
    """
    base = Path(path_service.data_dir).resolve()
    if not base.exists():
        return []

    dirs = []
    for p in base.rglob("*"):
        if p.is_dir():
            rel = p.relative_to(base).as_posix()
            if rel:  # 루트("") 제외
                dirs.append(rel)

    dirs.sort()
    return dirs