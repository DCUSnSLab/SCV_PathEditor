"""
LiDAR Point Cloud Labeling Tool - Data Models
"""
from pydantic import BaseModel
from typing import List, Dict, Optional, Tuple
from enum import Enum
from datetime import datetime


class ProcessingStatus(str, Enum):
    """Processing job status"""
    PENDING = "pending"
    PARSING = "parsing"
    SYNCING = "syncing"
    TRANSFORMING = "transforming"
    ACCUMULATING = "accumulating"
    DOWNSAMPLING = "downsampling"
    COMPLETED = "completed"
    FAILED = "failed"


class AreaType(str, Enum):
    """Area types matching existing semantic map types"""
    DRIVABLE = "drivable"
    CROSSWALK = "crosswalk"
    SIDEWALK = "sidewalk"
    NO_ENTRY = "no_entry"
    PLAZA = "plaza"


# === Request Models ===

class ProcessRequest(BaseModel):
    """Request to process a ROS2 bag file"""
    bag_id: str
    lidar_topic: str = "/velodyne_points"
    gps_topic: str = "/ublox_gps_node/fix"
    odom_topic: Optional[str] = None
    offset_x: float = 0.0  # LiDAR to GPS antenna offset (meters)
    offset_y: float = 0.0
    voxel_size: float = 0.1  # Downsampling voxel size (meters)
    max_points: int = 1000000  # Max points for web visualization
    max_time_diff: float = 0.1  # Max time difference for sync (seconds)


class LabelUpdateRequest(BaseModel):
    """Request to update point labels"""
    labels: Dict[str, List[int]]  # {"drivable": [0,1,2...], "crosswalk": [100,101...]}


class PolygonGenerateRequest(BaseModel):
    """Request to generate polygons from labels"""
    alpha: float = 2.0  # Alpha shape parameter (meters)
    simplify_tolerance: float = 0.5  # Douglas-Peucker tolerance (meters)
    min_points: int = 10  # Minimum points to form a polygon


class ExportRequest(BaseModel):
    """Request to export as SemanticMapData"""
    map_name: str
    filename: str  # Output filename (without path)


# === Response Models ===

class TopicInfo(BaseModel):
    """Information about a ROS2 topic"""
    name: str
    msg_type: str
    count: int


class BagInfo(BaseModel):
    """Metadata about an uploaded ROS2 bag"""
    bag_id: str
    filename: str
    size_bytes: int
    duration_sec: float
    topics: List[TopicInfo]
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    upload_time: str


class ProcessingJob(BaseModel):
    """Processing job status"""
    job_id: str
    bag_id: str
    status: ProcessingStatus
    progress: float = 0.0  # 0.0 ~ 1.0
    message: str = ""
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    pc_id: Optional[str] = None  # Result point cloud ID


class BoundsInfo(BaseModel):
    """Bounding box information"""
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    z_min: float
    z_max: float


class GpsOrigin(BaseModel):
    """GPS origin for coordinate reference"""
    lat: float
    lng: float
    utm_easting: float
    utm_northing: float
    utm_zone: str


class FrameInfo(BaseModel):
    """Information about a single frame"""
    frame_id: int
    timestamp: float
    point_count: int
    gps: Dict[str, float]
    heading: float
    bounds: BoundsInfo


class PointCloudInfo(BaseModel):
    """Metadata about a processed point cloud"""
    pc_id: str
    bag_id: str
    total_points: int
    downsampled_points: Optional[int] = None
    bounds: BoundsInfo
    gps_origin: GpsOrigin
    created_at: str
    offset_x: float
    offset_y: float
    voxel_size: Optional[float] = None
    # Frame-based mode fields
    mode: Optional[str] = None  # "frame_based" or None for legacy
    total_frames: Optional[int] = None
    frames: Optional[List[FrameInfo]] = None


class LabelData(BaseModel):
    """Current label state for a point cloud"""
    pc_id: str
    labels: Dict[str, List[int]]
    last_modified: str


class GeneratedPolygon(BaseModel):
    """A polygon generated from labeled points"""
    id: str
    area_type: str
    polygon: List[List[float]]  # [[lng, lat], [lng, lat], ...]
    point_count: int
    area_sqm: float


class PolygonResult(BaseModel):
    """Result of polygon generation"""
    pc_id: str
    polygons: List[GeneratedPolygon]
    generated_at: str


class ExportResult(BaseModel):
    """Result of SemanticMapData export"""
    filename: str
    path: str
    area_count: int
    exported_at: str


# === Internal Models (not exposed via API) ===

class GpsData(BaseModel):
    """GPS fix data"""
    timestamp: float
    lat: float
    lng: float
    alt: float
    status: int = 0


class LidarScan(BaseModel):
    """Single LiDAR scan metadata (points stored separately)"""
    timestamp: float
    point_count: int
