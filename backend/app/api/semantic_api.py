"""
Semantic Map API - Area-based HD Map management
"""
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import os

router = APIRouter(prefix="/api/semantic", tags=["semantic"])

# Data directory for semantic maps
SEMANTIC_DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "semantic"
SEMANTIC_DATA_DIR.mkdir(parents=True, exist_ok=True)


class AreaProperties(BaseModel):
    speed_limit: float = 0.0
    priority: int = 1
    traversable: bool = True
    cost_weight: float = 1.0
    remark: str = ""


class Area(BaseModel):
    id: str
    type: str
    polygon: List[List[float]]  # [[lng, lat], [lng, lat], ...]
    properties: AreaProperties


class CoordinateSystem(BaseModel):
    type: str = "WGS84"
    zone: Optional[str] = None
    origin: Optional[List[float]] = None
    note: Optional[str] = None


class AreaTypeConfig(BaseModel):
    color: str
    fillColor: str
    fillOpacity: float
    weight: int
    defaultSpeedLimit: float
    traversable: bool
    costWeight: float


class SemanticMapData(BaseModel):
    version: str = "1.0"
    name: str
    coordinate_system: CoordinateSystem
    areas: List[Area]
    area_types: Optional[Dict[str, AreaTypeConfig]] = None


def _safe_path(rel_path: str) -> Path:
    """Safely resolve path within data directory"""
    base = SEMANTIC_DATA_DIR.resolve()
    target = (base / rel_path).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


@router.get("/files", response_model=List[str])
async def list_semantic_files(response: Response):
    """List all semantic map JSON files"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    try:
        if not SEMANTIC_DATA_DIR.exists():
            return []

        files = [
            p.relative_to(SEMANTIC_DATA_DIR).as_posix()
            for p in SEMANTIC_DATA_DIR.rglob("*.json")
            if p.is_file()
        ]
        files.sort()
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load")
async def load_semantic_map(path: str, response: Response):
    """Load a semantic map file"""
    response.headers["Cache-Control"] = "no-store"

    try:
        file_path = _safe_path(path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        return data
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save/{filename}")
async def save_semantic_map(filename: str, map_data: SemanticMapData):
    """Save semantic map data to file"""
    try:
        # Validate filename
        if not filename:
            raise HTTPException(status_code=400, detail="Filename required")

        if not filename.lower().endswith('.json'):
            filename += '.json'

        # Security check
        import re
        if re.search(r'[<>:"/\\|?*\x00-\x1f]', filename.replace('/', '')):
            raise HTTPException(status_code=400, detail="Invalid characters in filename")

        file_path = _safe_path(filename)

        # Create parent directories if needed
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert to dict and save
        data_dict = map_data.dict()

        with file_path.open("w", encoding="utf-8") as f:
            json.dump(data_dict, f, ensure_ascii=False, indent=2)

        return {
            "message": f"Saved: {filename}",
            "path": filename,
            "areas_count": len(map_data.areas)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{filename}")
async def delete_semantic_map(filename: str):
    """Delete a semantic map file"""
    try:
        file_path = _safe_path(filename)

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Can only delete files")

        file_path.unlink()

        return {"message": f"Deleted: {filename}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/area-types")
async def get_area_types():
    """Get default area type configurations"""
    return {
        "drivable": {
            "color": "#4CAF50",
            "fillColor": "#4CAF50",
            "fillOpacity": 0.3,
            "weight": 2,
            "defaultSpeedLimit": 2.0,
            "traversable": True,
            "costWeight": 1.0,
            "description": "Drivable area for normal vehicle operation"
        },
        "crosswalk": {
            "color": "#FF9800",
            "fillColor": "#FF9800",
            "fillOpacity": 0.4,
            "weight": 2,
            "defaultSpeedLimit": 0.5,
            "traversable": True,
            "costWeight": 5.0,
            "description": "Crosswalk area - slow down and yield to pedestrians"
        },
        "sidewalk": {
            "color": "#9E9E9E",
            "fillColor": "#9E9E9E",
            "fillOpacity": 0.4,
            "weight": 2,
            "defaultSpeedLimit": 0.0,
            "traversable": False,
            "costWeight": 100.0,
            "description": "Pedestrian-only sidewalk - no vehicle entry"
        },
        "no_entry": {
            "color": "#F44336",
            "fillColor": "#F44336",
            "fillOpacity": 0.5,
            "weight": 3,
            "defaultSpeedLimit": 0.0,
            "traversable": False,
            "costWeight": 1000.0,
            "description": "No entry zone - strictly prohibited area"
        },
        "plaza": {
            "color": "#2196F3",
            "fillColor": "#2196F3",
            "fillOpacity": 0.3,
            "weight": 2,
            "defaultSpeedLimit": 1.0,
            "traversable": True,
            "costWeight": 2.0,
            "description": "Shared plaza space - slow speed required"
        }
    }
