"""
LiDAR Point Cloud Labeling Tool - API Endpoints
"""
import os
import json
import uuid
import shutil
import asyncio
import zipfile
import tempfile
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Response
from fastapi.responses import FileResponse

from app.models.lidar_models import (
    ProcessRequest, LabelUpdateRequest, PolygonGenerateRequest, ExportRequest,
    BagInfo, TopicInfo, ProcessingJob, ProcessingStatus,
    PointCloudInfo, BoundsInfo, GpsOrigin, LabelData, FrameInfo,
    PolygonResult, GeneratedPolygon, ExportResult
)
from app.services.rosbag_service import RosbagService
from app.services.pointcloud_service import PointCloudService
from app.services.polygon_service import PolygonService

router = APIRouter(prefix="/api/lidar", tags=["lidar"])

# Data directories
BASE_DIR = Path(__file__).parent.parent.parent.parent
BAGS_DIR = BASE_DIR / "data" / "lidar" / "bags"
POINTCLOUDS_DIR = BASE_DIR / "data" / "lidar" / "pointclouds"
SEMANTIC_DIR = BASE_DIR / "data" / "semantic"

# Ensure directories exist
BAGS_DIR.mkdir(parents=True, exist_ok=True)
POINTCLOUDS_DIR.mkdir(parents=True, exist_ok=True)
SEMANTIC_DIR.mkdir(parents=True, exist_ok=True)

# Initialize services
rosbag_service = RosbagService(str(BAGS_DIR))
pointcloud_service = PointCloudService(str(POINTCLOUDS_DIR))

# In-memory job storage (could be replaced with Redis/DB for production)
processing_jobs: Dict[str, Dict[str, Any]] = {}


# === Bag Management Endpoints ===

@router.post("/upload")
async def upload_bag(file: UploadFile = File(...)):
    """
    Upload a ROS2 bag file or folder.
    Accepts .db3 files or .zip archives containing bag folders.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Generate unique bag ID
    bag_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    bag_path = BAGS_DIR / bag_id

    try:
        # Handle different file types
        if file.filename.endswith('.zip'):
            # Extract zip archive
            with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name

            with zipfile.ZipFile(tmp_path, 'r') as zip_ref:
                zip_ref.extractall(bag_path)

            os.unlink(tmp_path)

        elif file.filename.endswith('.db3'):
            # Single db3 file - create bag structure
            bag_path.mkdir(parents=True, exist_ok=True)
            db3_path = bag_path / file.filename

            content = await file.read()
            with open(db3_path, 'wb') as f:
                f.write(content)

            # Create minimal metadata.yaml
            metadata_content = f"""rosbag2_bagfile_information:
  version: 4
  storage_identifier: sqlite3
  relative_file_paths:
    - {file.filename}
  starting_time:
    nanoseconds_since_epoch: 0
  duration:
    nanoseconds: 0
  message_count: 0
"""
            with open(bag_path / "metadata.yaml", 'w') as f:
                f.write(metadata_content)

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload .db3 or .zip file"
            )

        return {
            "bag_id": bag_id,
            "filename": file.filename,
            "message": "Bag uploaded successfully"
        }

    except Exception as e:
        # Cleanup on error
        if bag_path.exists():
            shutil.rmtree(bag_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/bags", response_model=List[str])
async def list_bags():
    """List all uploaded bag IDs"""
    return rosbag_service.list_bags()


@router.get("/bags/{bag_id}/info")
async def get_bag_info(bag_id: str):
    """Get metadata about a bag file"""
    try:
        info = rosbag_service.get_bag_info(bag_id)
        return BagInfo(
            bag_id=info["bag_id"],
            filename=info["filename"],
            size_bytes=info["size_bytes"],
            duration_sec=info["duration_sec"],
            topics=[TopicInfo(**t) for t in info["topics"]],
            start_time=info.get("start_time"),
            end_time=info.get("end_time"),
            upload_time=info["upload_time"]
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Bag not found: {bag_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read bag info: {str(e)}")


@router.delete("/bags/{bag_id}")
async def delete_bag(bag_id: str):
    """Delete an uploaded bag"""
    if rosbag_service.delete_bag(bag_id):
        return {"message": f"Bag {bag_id} deleted"}
    raise HTTPException(status_code=404, detail=f"Bag not found: {bag_id}")


# === Processing Endpoints ===

def process_bag_task(job_id: str, request: ProcessRequest):
    """Background task to process a bag file (frame-based)"""
    job = processing_jobs[job_id]

    try:
        # Update status: parsing
        job["status"] = ProcessingStatus.PARSING
        job["message"] = "Parsing LiDAR data..."
        job["progress"] = 0.1

        # Read LiDAR messages
        lidar_data = list(rosbag_service.read_pointcloud2_messages(
            request.bag_id, request.lidar_topic
        ))

        job["message"] = f"Parsed {len(lidar_data)} LiDAR scans"
        job["progress"] = 0.2

        # Read GPS messages
        job["message"] = "Parsing GPS data..."
        gps_data = list(rosbag_service.read_navsatfix_messages(
            request.bag_id, request.gps_topic
        ))

        job["message"] = f"Parsed {len(gps_data)} GPS fixes"
        job["progress"] = 0.3

        if not lidar_data:
            raise ValueError(f"No LiDAR data found on topic {request.lidar_topic}")
        if not gps_data:
            raise ValueError(f"No GPS data found on topic {request.gps_topic}")

        odom_data = None
        if request.odom_topic:
            job["message"] = "Parsing odometry data..."
            odom_data = list(rosbag_service.read_odometry_messages(
                request.bag_id, request.odom_topic
            ))
            job["progress"] = 0.35

        # Update status: syncing (frame-based sampling)
        job["status"] = ProcessingStatus.SYNCING
        job["message"] = "Sampling frames (1 per second)..."
        job["progress"] = 0.4

        # Sample frames at 1 second intervals
        frames = pointcloud_service.sample_frames_by_interval(
            lidar_data, gps_data,
            interval_sec=1.0,
            max_time_diff=request.max_time_diff,
            odom_data=odom_data
        )

        if not frames:
            raise ValueError("No frames sampled. Check time alignment between LiDAR and GPS.")

        job["message"] = f"Sampled {len(frames)} frames"
        job["progress"] = 0.6

        # Update status: saving frames
        job["status"] = ProcessingStatus.TRANSFORMING
        job["message"] = "Saving frames..."
        job["progress"] = 0.8

        # Save frames
        pc_id = f"pc_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        pointcloud_service.save_frames(
            pc_id, frames,
            request.offset_x, request.offset_y,
            bag_id=request.bag_id,
            voxel_size=request.voxel_size
        )

        # Update status: completed
        job["status"] = ProcessingStatus.COMPLETED
        job["message"] = f"Completed: {len(frames)} frames saved"
        job["progress"] = 1.0
        job["pc_id"] = pc_id
        job["completed_at"] = datetime.now().isoformat()

    except Exception as e:
        job["status"] = ProcessingStatus.FAILED
        job["message"] = "Processing failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.now().isoformat()


@router.post("/process")
async def process_bag(request: ProcessRequest, background_tasks: BackgroundTasks):
    """
    Start processing a bag file to create a point cloud.
    Returns a job ID to track progress.
    """
    # Verify bag exists
    bag_path = BAGS_DIR / request.bag_id
    if not bag_path.exists():
        raise HTTPException(status_code=404, detail=f"Bag not found: {request.bag_id}")

    # Create job
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    processing_jobs[job_id] = {
        "job_id": job_id,
        "bag_id": request.bag_id,
        "status": ProcessingStatus.PENDING,
        "progress": 0.0,
        "message": "Job created",
        "error": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "pc_id": None
    }

    # Start background processing
    background_tasks.add_task(process_bag_task, job_id, request)

    return {"job_id": job_id, "message": "Processing started"}


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a processing job"""
    if job_id not in processing_jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    job = processing_jobs[job_id]
    return ProcessingJob(
        job_id=job["job_id"],
        bag_id=job["bag_id"],
        status=job["status"],
        progress=job["progress"],
        message=job["message"],
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
        pc_id=job.get("pc_id")
    )


# === Point Cloud Endpoints ===

@router.get("/pointclouds", response_model=List[str])
async def list_pointclouds():
    """List all processed point cloud IDs"""
    return pointcloud_service.list_pointclouds()


@router.get("/pointclouds/{pc_id}")
async def get_pointcloud_info(pc_id: str):
    """Get metadata about a point cloud"""
    try:
        meta = pointcloud_service.load_pointcloud_meta(pc_id)

        # Check if frame-based
        is_frame_based = meta.get("mode") == "frame_based"

        # Build frames info for frame-based mode
        frames_info = None
        if is_frame_based and "frames" in meta:
            frames_info = [
                FrameInfo(
                    frame_id=f["frame_id"],
                    timestamp=f["timestamp"],
                    point_count=f["point_count"],
                    gps=f["gps"],
                    heading=f["heading"],
                    bounds=BoundsInfo(**f["bounds"])
                )
                for f in meta["frames"]
            ]

        return PointCloudInfo(
            pc_id=meta["pc_id"],
            bag_id=meta.get("bag_id", ""),
            total_points=meta["total_points"],
            downsampled_points=meta.get("downsampled_points"),
            bounds=BoundsInfo(**meta["bounds"]),
            gps_origin=GpsOrigin(**meta["gps_origin"]),
            created_at=meta["created_at"],
            offset_x=meta.get("offset_x", 0.0),
            offset_y=meta.get("offset_y", 0.0),
            voxel_size=meta.get("voxel_size"),
            mode=meta.get("mode"),
            total_frames=meta.get("total_frames"),
            frames=frames_info
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


@router.get("/pointclouds/{pc_id}/download")
async def download_pointcloud(pc_id: str, response: Response):
    """Download point cloud data as binary for web visualization"""
    try:
        data = pointcloud_service.load_pointcloud_for_web(pc_id)
        response.headers["Content-Type"] = "application/octet-stream"
        response.headers["Content-Length"] = str(len(data))
        return Response(content=data, media_type="application/octet-stream")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


@router.delete("/pointclouds/{pc_id}")
async def delete_pointcloud(pc_id: str):
    """Delete a point cloud"""
    if pointcloud_service.delete_pointcloud(pc_id):
        return {"message": f"Point cloud {pc_id} deleted"}
    raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


# === Labeling Endpoints ===

@router.get("/pointclouds/{pc_id}/labels")
async def get_labels(pc_id: str):
    """Get current labels for a point cloud"""
    try:
        labels = pointcloud_service.load_labels(pc_id)
        return LabelData(**labels)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


@router.post("/pointclouds/{pc_id}/labels")
async def save_labels(pc_id: str, request: LabelUpdateRequest):
    """Save labels for a point cloud"""
    try:
        # Verify point cloud exists
        pointcloud_service.load_pointcloud_meta(pc_id)
        labels = pointcloud_service.save_labels(pc_id, request.labels)
        return LabelData(**labels)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


# === Polygon Generation Endpoints ===

@router.post("/pointclouds/{pc_id}/generate-polygons")
async def generate_polygons(pc_id: str, request: PolygonGenerateRequest):
    """Generate polygons from labeled points"""
    try:
        polygon_service = PolygonService()

        # Load data
        meta = pointcloud_service.load_pointcloud_meta(pc_id)
        pc_path = POINTCLOUDS_DIR / pc_id

        # Check if frame-based and use merged data
        if meta.get("mode") == "frame_based":
            merged_path = pc_path / "merged.npy"
            merged_labels_path = pc_path / "merged_labels.json"

            if not merged_path.exists():
                raise HTTPException(
                    status_code=400,
                    detail="Please merge frames first using 'Merge All Frames' button"
                )

            full_points = np.load(merged_path)
            with open(merged_labels_path) as f:
                labels_data = json.load(f)
        else:
            labels_data = pointcloud_service.load_labels(pc_id)
            full_points = pointcloud_service.load_full_pointcloud(pc_id)

        # Generate polygons for each label type
        polygons = []
        origin = meta["gps_origin"]

        for area_type, indices in labels_data["labels"].items():
            if len(indices) < request.min_points:
                continue

            # Get labeled points (2D only)
            labeled_points = full_points[indices, :2]

            # Generate polygon
            polygon_coords = polygon_service.generate_polygon_from_points(
                labeled_points,
                origin,
                alpha=request.alpha,
                simplify_tolerance=request.simplify_tolerance
            )

            if polygon_coords:
                # Calculate area
                area_sqm = polygon_service.calculate_area(polygon_coords, origin)

                polygons.append(GeneratedPolygon(
                    id=f"{area_type}_{len([p for p in polygons if p.area_type == area_type]) + 1:03d}",
                    area_type=area_type,
                    polygon=polygon_coords,
                    point_count=len(indices),
                    area_sqm=area_sqm
                ))

        return PolygonResult(
            pc_id=pc_id,
            polygons=polygons,
            generated_at=datetime.now().isoformat()
        )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Polygon generation failed: {str(e)}")


# === Frame-based Endpoints ===

@router.get("/pointclouds/{pc_id}/frames")
async def get_frame_list(pc_id: str):
    """Get list of frames for a point cloud"""
    try:
        meta = pointcloud_service.load_pointcloud_meta(pc_id)
        if meta.get("mode") != "frame_based":
            raise HTTPException(status_code=400, detail="Point cloud is not frame-based")

        return {
            "pc_id": pc_id,
            "total_frames": meta["total_frames"],
            "frames": meta["frames"]
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


@router.get("/pointclouds/{pc_id}/frames/{frame_id}")
async def get_frame(pc_id: str, frame_id: int, response: Response):
    """Download a single frame's point data as binary"""
    try:
        data = pointcloud_service.load_frame(pc_id, frame_id)
        response.headers["Content-Type"] = "application/octet-stream"
        response.headers["Content-Length"] = str(len(data))
        return Response(content=data, media_type="application/octet-stream")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Frame {frame_id} not found")


@router.get("/pointclouds/{pc_id}/frames/{frame_id}/labels")
async def get_frame_labels(pc_id: str, frame_id: int):
    """Get labels for a specific frame"""
    try:
        labels = pointcloud_service.load_frame_labels(pc_id, frame_id)
        return {
            "pc_id": pc_id,
            "frame_id": frame_id,
            "labels": labels
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


@router.post("/pointclouds/{pc_id}/frames/{frame_id}/labels")
async def save_frame_labels(pc_id: str, frame_id: int, request: LabelUpdateRequest):
    """Save labels for a specific frame"""
    try:
        result = pointcloud_service.save_frame_labels(pc_id, frame_id, request.labels)
        return {
            "pc_id": pc_id,
            "frame_id": frame_id,
            "message": "Labels saved"
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")


@router.post("/pointclouds/{pc_id}/merge")
async def merge_frames(pc_id: str):
    """Merge all frames into a single point cloud for export"""
    try:
        merged_points, merged_labels = pointcloud_service.merge_all_frames(pc_id)

        # Save merged data
        pc_path = POINTCLOUDS_DIR / pc_id

        # Save merged points
        import numpy as np
        np.save(pc_path / "merged.npy", merged_points.astype(np.float32))

        # Save merged labels
        merged_label_data = {
            "pc_id": pc_id,
            "labels": merged_labels,
            "last_modified": datetime.now().isoformat()
        }
        with open(pc_path / "merged_labels.json", "w") as f:
            json.dump(merged_label_data, f, indent=2)

        # Count labels
        label_counts = {k: len(v) for k, v in merged_labels.items()}

        return {
            "pc_id": pc_id,
            "total_points": len(merged_points),
            "label_counts": label_counts,
            "message": "Frames merged successfully"
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")


# === Export Endpoint ===

@router.post("/pointclouds/{pc_id}/export")
async def export_to_semantic(pc_id: str, request: ExportRequest):
    """Export generated polygons to SemanticMapData format"""
    try:
        polygon_service = PolygonService()

        # Load data
        meta = pointcloud_service.load_pointcloud_meta(pc_id)
        pc_path = POINTCLOUDS_DIR / pc_id

        # Check if frame-based and use merged data
        if meta.get("mode") == "frame_based":
            merged_path = pc_path / "merged.npy"
            merged_labels_path = pc_path / "merged_labels.json"

            if not merged_path.exists():
                raise HTTPException(
                    status_code=400,
                    detail="Please merge frames first using /merge endpoint"
                )

            full_points = np.load(merged_path)
            with open(merged_labels_path) as f:
                labels_data = json.load(f)
        else:
            labels_data = pointcloud_service.load_labels(pc_id)
            full_points = pointcloud_service.load_full_pointcloud(pc_id)

        # Generate all polygons
        polygons = []
        origin = meta["gps_origin"]

        for area_type, indices in labels_data["labels"].items():
            if len(indices) < 10:  # Minimum points
                continue

            labeled_points = full_points[indices, :2]
            polygon_coords = polygon_service.generate_polygon_from_points(
                labeled_points, origin, alpha=2.0, simplify_tolerance=0.5
            )

            if polygon_coords:
                polygons.append({
                    "type": area_type,
                    "polygon": polygon_coords,
                    "point_count": len(indices)
                })

        # Create SemanticMapData
        semantic_data = polygon_service.create_semantic_map_data(
            request.map_name,
            polygons,
            origin
        )

        # Save to file
        filename = request.filename
        if not filename.endswith('.json'):
            filename += '.json'

        # Sanitize filename
        filename = "".join(c for c in filename if c.isalnum() or c in "._-")

        output_path = SEMANTIC_DIR / filename
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(semantic_data, f, indent=2, ensure_ascii=False)

        return ExportResult(
            filename=filename,
            path=str(output_path),
            area_count=len(polygons),
            exported_at=datetime.now().isoformat()
        )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Point cloud not found: {pc_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
