"""
Point Cloud Processing Service
- Time synchronization
- Heading calculation
- Coordinate transformation
- Frame-based processing
"""
import math
import json
import bisect
import shutil
import numpy as np
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
from pyproj import CRS, Transformer
from pyproj.exceptions import CRSError


class PointCloudService:
    """Service for processing and managing point clouds"""

    def __init__(self, storage_dir: str):
        """
        Initialize point cloud service.

        Args:
            storage_dir: Directory to store processed point clouds
        """
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._transformer_cache = {}

    def _get_transformer(self, from_crs, to_crs) -> Transformer:
        """Cache transformers for performance."""
        key = (from_crs, to_crs)
        if key not in self._transformer_cache:
            self._transformer_cache[key] = Transformer.from_crs(from_crs, to_crs, always_xy=True)
        return self._transformer_cache[key]

    def _crop_local_points(self, points: np.ndarray, size: float, z_min: float, z_max: float) -> np.ndarray:
        if len(points) == 0:
            return points
        half = size / 2.0
        mask = (
            (np.abs(points[:, 0]) <= half)
            & (np.abs(points[:, 1]) <= half)
            & (points[:, 2] >= z_min)
            & (points[:, 2] <= z_max)
        )
        return points[mask]

    def _voxel_downsample(self, points: np.ndarray, voxel_size: float) -> np.ndarray:
        if voxel_size <= 0 or len(points) == 0:
            return points
        coords = points[:, :3]
        voxel_indices = np.floor(coords / voxel_size).astype(np.int64)
        _, unique_indices = np.unique(voxel_indices, axis=0, return_index=True)
        unique_indices = np.sort(unique_indices)
        return points[unique_indices]

    def get_pc_path(self, pc_id: str) -> Path:
        """Get the path to a point cloud directory by ID"""
        return self.storage_dir / pc_id

    def list_pointclouds(self) -> List[str]:
        """List all processed point cloud IDs"""
        pcs = []
        for path in self.storage_dir.iterdir():
            if path.is_dir() and (path / "meta.json").exists():
                pcs.append(path.name)
        return sorted(pcs)

    def _calculate_stable_headings(self, gps_data: List[Tuple[float, Dict[str, Any]]]):
        """
        Pre-calculates a stable, forward-looking heading for each GPS point.
        The heading for point `i` is determined by the vector from `i` to `i+1`.
        """
        if len(gps_data) < 2:
            for _, gps in gps_data:
                gps['stable_heading'] = 0.0
            return

        # Get UTM zone from the first valid point
        first_gps = gps_data[0][1]
        zone_number = int(math.floor((first_gps['lng'] + 180) / 6) + 1)
        is_northern = first_gps['lat'] >= 0

        try:
            wgs84_crs = CRS.from_epsg(4326)
            utm_crs = CRS.from_dict({
                'proj': 'utm', 'zone': zone_number, 'south': not is_northern
            })
            transformer = self._get_transformer(wgs84_crs, utm_crs)
        except CRSError:
            # Fallback if CRS fails
            for _, gps in gps_data:
                gps['stable_heading'] = 0.0
            return

        # Convert all lat/lng to UTM at once
        lats = [g[1]['lat'] for g in gps_data]
        lngs = [g[1]['lng'] for g in gps_data]
        eastings, northings = transformer.transform(lngs, lats)
        
        utm_coords = np.array([eastings, northings]).T

        dx = np.diff(utm_coords[:, 0])
        dy = np.diff(utm_coords[:, 1])
        headings = np.arctan2(dx, dy)
        if len(headings) > 1:
            unwrapped = np.unwrap(headings)
            window = 5
            if len(unwrapped) < window:
                window = len(unwrapped)
            kernel = np.ones(window) / window
            smoothed = np.convolve(unwrapped, kernel, mode='same')
            headings = smoothed

        # Assign calculated headings
        for i in range(len(gps_data) - 1):
            gps_data[i][1]['stable_heading'] = headings[i]
        
        # For the last point, reuse the previous heading
        gps_data[-1][1]['stable_heading'] = headings[-1] if len(headings) > 0 else 0.0


    def transform_to_global(
        self,
        local_points: np.ndarray,
        gps: Dict[str, Any],
        offset_x: float,
        offset_y: float,
        heading: float
    ) -> Tuple[np.ndarray, str]:
        """
        Transform local LiDAR points to global UTM coordinates.

        Args:
            local_points: (N, 3+) array of XYZ(I) points in LiDAR frame
            gps: GPS fix {"lat", "lng", "alt"}
            offset_x: LiDAR to GPS antenna offset in X (forward)
            offset_y: LiDAR to GPS antenna offset in Y (left)
            heading: Vehicle heading in radians (from North, clockwise)

        Returns:
            Tuple of ((N, 3+) array of XYZ(I) points in UTM, utm_zone_string)
        """
        global_points = local_points.copy()

        cos_h = math.cos(heading)
        sin_h = math.sin(heading)

        # 1. Rotate points by heading
        x = local_points[:, 0]
        y = local_points[:, 1]
        
        rotated_x = x * sin_h - y * cos_h
        rotated_y = x * cos_h + y * sin_h

        # 2. Apply offset (after rotation)
        offset_x_rotated = offset_x * sin_h - offset_y * cos_h
        offset_y_rotated = offset_x * cos_h + offset_y * sin_h
        
        rotated_x += offset_x_rotated
        rotated_y += offset_y_rotated

        # 3. Convert GPS to UTM and add position
        zone_number = int(math.floor((gps['lng'] + 180) / 6) + 1)
        is_northern = gps['lat'] >= 0
        utm_zone_str = f"{zone_number}{'N' if is_northern else 'S'}"

        try:
            wgs84_crs = CRS.from_epsg(4326)
            utm_crs = CRS.from_dict({
                'proj': 'utm', 'zone': zone_number, 'south': not is_northern
            })
            transformer = self._get_transformer(wgs84_crs, utm_crs)
            utm_e, utm_n = transformer.transform(gps['lng'], gps['lat'])
        except CRSError:
            # Fallback on error
            return global_points, "0N"

        global_points[:, 0] = rotated_x + utm_e
        global_points[:, 1] = rotated_y + utm_n
        # Keep Z as is (relative to sensor)

        return global_points, utm_zone_str

    # ... (rest of the file remains the same until sample_frames_by_interval)

    # ==========================================
    # Frame-based Processing Methods
    # ==========================================

    def sample_frames_by_interval(
        self,
        lidar_data: List[Tuple[float, np.ndarray]],
        gps_data: List[Tuple[float, Dict[str, Any]]],
        interval_sec: float = 1.0,
        max_time_diff: float = 0.1,
        odom_data: Optional[List[Tuple[float, float]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Sample frames at regular time intervals (e.g., 1 frame per second).
        Uses a stable, forward-looking heading calculation.
        """
        if not lidar_data or not gps_data:
            return []

        lidar_data = sorted(lidar_data, key=lambda x: x[0])
        gps_data = sorted(gps_data, key=lambda x: x[0])
        if odom_data:
            odom_data = sorted(odom_data, key=lambda x: x[0])

        # Pre-calculate stable headings for all GPS points
        self._calculate_stable_headings(gps_data)

        start_time = lidar_data[0][0]
        end_time = lidar_data[-1][0]

        gps_timestamps = [g[0] for g in gps_data]
        lidar_timestamps = [l[0] for l in lidar_data]
        odom_timestamps = [o[0] for o in odom_data] if odom_data else []

        frames = []
        current_time = start_time

        while current_time <= end_time:
            # Find nearest LiDAR scan
            lidar_idx = bisect.bisect_left(lidar_timestamps, current_time)
            if lidar_idx >= len(lidar_data):
                lidar_idx = len(lidar_data) - 1

            best_lidar_idx = lidar_idx
            if lidar_idx > 0 and abs(lidar_data[lidar_idx - 1][0] - current_time) < abs(lidar_data[lidar_idx][0] - current_time):
                best_lidar_idx = lidar_idx - 1
            
            lidar_ts, lidar_points = lidar_data[best_lidar_idx]

            # Find nearest GPS fix for the selected LiDAR scan's timestamp
            gps_idx = bisect.bisect_left(gps_timestamps, lidar_ts)
            best_gps = None
            best_gps_diff = float('inf')

            for i in [gps_idx - 1, gps_idx]:
                if 0 <= i < len(gps_data):
                    diff = abs(gps_data[i][0] - lidar_ts)
                    if diff < best_gps_diff:
                        best_gps_diff = diff
                        best_gps = gps_data[i][1]
            
            # Ensure we found a synchronized GPS point within the threshold
            if best_gps is None or best_gps_diff > max_time_diff:
                current_time += interval_sec
                continue

            # Retrieve the pre-calculated stable heading
            heading = best_gps.get('stable_heading', 0.0)
            if odom_data:
                odom_idx = bisect.bisect_left(odom_timestamps, lidar_ts)
                best_odom = None
                best_odom_diff = float('inf')
                for i in [odom_idx - 1, odom_idx]:
                    if 0 <= i < len(odom_data):
                        diff = abs(odom_data[i][0] - lidar_ts)
                        if diff < best_odom_diff:
                            best_odom_diff = diff
                            best_odom = odom_data[i][1]
                if best_odom is not None and best_odom_diff <= max_time_diff:
                    heading = best_odom

            frames.append({
                "frame_id": len(frames),
                "timestamp": lidar_ts,
                "lidar_points": lidar_points,
                "gps": best_gps,
                "heading": heading,
                "point_count": len(lidar_points)
            })

            current_time += interval_sec

        return frames

    def save_frames(
        self,
        pc_id: str,
        frames: List[Dict[str, Any]],
        offset_x: float,
        offset_y: float,
        bag_id: str = "",
        voxel_size: float = 0.0
    ) -> str:
        """
        Save frame-based point cloud data.
        """
        pc_path = self.get_pc_path(pc_id)
        pc_path.mkdir(parents=True, exist_ok=True)
        frames_dir = pc_path / "frames"
        frames_dir.mkdir(exist_ok=True)

        if not frames:
            raise ValueError("Cannot save empty frames list.")

        # Get first GPS for origin
        first_gps = frames[0]["gps"]
        
        # Get origin UTM and zone
        zone_number = int(math.floor((first_gps['lng'] + 180) / 6) + 1)
        is_northern = first_gps['lat'] >= 0
        utm_zone_str = f"{zone_number}{'N' if is_northern else 'S'}"
        
        try:
            wgs84_crs = CRS.from_epsg(4326)
            utm_crs = CRS.from_dict({
                'proj': 'utm', 'zone': zone_number, 'south': not is_northern
            })
            transformer = self._get_transformer(wgs84_crs, utm_crs)
            origin_easting, origin_northing = transformer.transform(first_gps['lng'], first_gps['lat'])
        except CRSError:
            # Fallback on error
            origin_easting, origin_northing = 0, 0


        # Save each frame
        frame_infos = []
        for frame in frames:
            frame_id = frame["frame_id"]
            points = frame["lidar_points"]
            points = self._crop_local_points(points, 20.0, -1.0, 3.0)
            points = self._voxel_downsample(points, voxel_size)
            gps = frame["gps"]
            heading = frame["heading"]

            # Transform to global coordinates
            global_points, _ = self.transform_to_global(
                points, gps, offset_x, offset_y, heading
            )

            # Normalize to origin
            if len(points) == 0:
                normalized = np.empty((0, 3), dtype=np.float32)
            else:
                normalized = global_points[:, :3].copy()
                normalized[:, 0] -= origin_easting
                normalized[:, 1] -= origin_northing

            # Save frame points
            frame_file = frames_dir / f"frame_{frame_id:04d}.bin"
            normalized.astype(np.float32).tofile(frame_file)

            # Calculate bounds
            if len(normalized) == 0:
                bounds = {
                    "x_min": 0.0, "x_max": 0.0,
                    "y_min": 0.0, "y_max": 0.0,
                    "z_min": 0.0, "z_max": 0.0,
                }
            else:
                bounds = {
                    "x_min": float(normalized[:, 0].min()), "x_max": float(normalized[:, 0].max()),
                    "y_min": float(normalized[:, 1].min()), "y_max": float(normalized[:, 1].max()),
                    "z_min": float(normalized[:, 2].min()), "z_max": float(normalized[:, 2].max()),
                }

            frame_infos.append({
                "frame_id": frame_id, "timestamp": frame["timestamp"],
                "point_count": len(normalized), "gps": gps, "heading": heading,
                "bounds": bounds
            })

        # Calculate total bounds
        all_x_min = min(f["bounds"]["x_min"] for f in frame_infos)
        all_x_max = max(f["bounds"]["x_max"] for f in frame_infos)
        all_y_min = min(f["bounds"]["y_min"] for f in frame_infos)
        all_y_max = max(f["bounds"]["y_max"] for f in frame_infos)
        all_z_min = min(f["bounds"]["z_min"] for f in frame_infos)
        all_z_max = max(f["bounds"]["z_max"] for f in frame_infos)

        # Save metadata
        meta = {
            "pc_id": pc_id, "bag_id": bag_id, "mode": "frame_based",
            "total_frames": len(frames),
            "total_points": sum(f["point_count"] for f in frame_infos),
            "downsampled_points": sum(f["point_count"] for f in frame_infos),
            "voxel_size": voxel_size if voxel_size > 0 else None,
            "bounds": {
                "x_min": all_x_min, "x_max": all_x_max, "y_min": all_y_min,
                "y_max": all_y_max, "z_min": all_z_min, "z_max": all_z_max,
            },
            "gps_origin": {
                "lat": first_gps['lat'], "lng": first_gps['lng'],
                "utm_easting": origin_easting, "utm_northing": origin_northing,
                "utm_zone": utm_zone_str
            },
            "offset_x": offset_x, "offset_y": offset_y,
            "frames": frame_infos, "created_at": datetime.now().isoformat()
        }

        with open(pc_path / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)

        # Initialize frame labels
        frame_labels = {
            "pc_id": pc_id,
            "frame_labels": {str(f["frame_id"]): {
                "drivable": [], "crosswalk": [], "sidewalk": [],
                "no_entry": [], "plaza": []
            } for f in frame_infos},
            "last_modified": datetime.now().isoformat()
        }
        with open(pc_path / "labels.json", "w") as f:
            json.dump(frame_labels, f, indent=2)

        return str(pc_path)

    def load_pointcloud_meta(self, pc_id: str) -> Dict[str, Any]:
        """Load point cloud metadata"""
        meta_path = self.get_pc_path(pc_id) / "meta.json"
        if not meta_path.exists():
            raise FileNotFoundError(f"Point cloud {pc_id} not found")
        
        with open(meta_path) as f:
            return json.load(f)

    def load_pointcloud_for_web(self, pc_id: str) -> bytes:
        """Load point cloud for web"""
        pc_dir = self.get_pc_path(pc_id)
        merged_path = pc_dir / "merged.npy"
        if merged_path.exists():
            data = np.load(merged_path).astype(np.float32)
            return data.tobytes()
        pc_path = pc_dir / "pointcloud.bin"
        if not pc_path.exists():
            raise FileNotFoundError(f"Point cloud binary not found: {pc_id}")
        return pc_path.read_bytes()

    def delete_pointcloud(self, pc_id: str) -> bool:
        """Delete point cloud data"""
        pc_path = self.get_pc_path(pc_id)
        if pc_path.exists():
            shutil.rmtree(pc_path)
            return True
        return False

    def load_labels(self, pc_id: str) -> Dict[str, Any]:
        """Load labels (legacy or merged)"""
        pc_dir = self.get_pc_path(pc_id)
        merged_labels_path = pc_dir / "merged_labels.json"
        if merged_labels_path.exists():
            with open(merged_labels_path) as f:
                return json.load(f)
        labels_path = pc_dir / "labels.json"
        if not labels_path.exists():
            return {"pc_id": pc_id, "labels": {}, "last_modified": ""}
        with open(labels_path) as f:
            return json.load(f)

    def save_labels(self, pc_id: str, labels: Dict[str, List[int]]) -> Dict[str, Any]:
        """Save labels (legacy or merged)"""
        pc_path = self.get_pc_path(pc_id)
        labels_data = {
            "pc_id": pc_id,
            "labels": labels,
            "last_modified": datetime.now().isoformat()
        }
        merged_path = pc_path / "merged.npy"
        if merged_path.exists():
            with open(pc_path / "merged_labels.json", "w") as f:
                json.dump(labels_data, f, indent=2)
        else:
            with open(pc_path / "labels.json", "w") as f:
                json.dump(labels_data, f, indent=2)
        return labels_data

    def load_full_pointcloud(self, pc_id: str) -> np.ndarray:
        """Load full point cloud (legacy .bin or merged .npy)"""
        pc_path = self.get_pc_path(pc_id)
        
        # Try merged.npy first (for frame-based)
        merged_path = pc_path / "merged.npy"
        if merged_path.exists():
            return np.load(merged_path)
            
        # Try pointcloud.bin (legacy)
        bin_path = pc_path / "pointcloud.bin"
        if bin_path.exists():
            return np.fromfile(bin_path, dtype=np.float32).reshape(-1, 3)
            
        raise FileNotFoundError(f"No point cloud data found for {pc_id}")

    # ==========================================
    # Frame-based Access Methods
    # ==========================================

    def load_frame(self, pc_id: str, frame_id: int) -> bytes:
        """Load a single frame's binary data"""
        frame_path = self.get_pc_path(pc_id) / "frames" / f"frame_{frame_id:04d}.bin"
        if not frame_path.exists():
            raise FileNotFoundError(f"Frame {frame_id} not found in {pc_id}")
        return frame_path.read_bytes()

    def load_frame_labels(self, pc_id: str, frame_id: int) -> Dict[str, List[int]]:
        """Load labels for a specific frame"""
        labels_path = self.get_pc_path(pc_id) / "labels.json"
        if not labels_path.exists():
            return {}
            
        with open(labels_path) as f:
            data = json.load(f)
            
        # Check structure: data["frame_labels"][str(frame_id)]
        if "frame_labels" in data:
            return data["frame_labels"].get(str(frame_id), {
                "drivable": [], "crosswalk": [], "sidewalk": [],
                "no_entry": [], "plaza": []
            })
        return {}

    def save_frame_labels(self, pc_id: str, frame_id: int, labels: Dict[str, List[int]]) -> Dict[str, Any]:
        """Save labels for a specific frame"""
        pc_path = self.get_pc_path(pc_id)
        labels_path = pc_path / "labels.json"
        
        data = {}
        if labels_path.exists():
            with open(labels_path) as f:
                data = json.load(f)
        
        if "frame_labels" not in data:
            data["frame_labels"] = {}
            
        data["frame_labels"][str(frame_id)] = labels
        data["last_modified"] = datetime.now().isoformat()
        
        with open(labels_path, "w") as f:
            json.dump(data, f, indent=2)
            
        return data

    def merge_all_frames(self, pc_id: str) -> Tuple[np.ndarray, Dict[str, List[int]]]:
        """Merge all frames into a single point cloud and re-index labels"""
        pc_path = self.get_pc_path(pc_id)
        frames_dir = pc_path / "frames"
        
        with open(pc_path / "meta.json") as f:
            meta = json.load(f)
            
        with open(pc_path / "labels.json") as f:
            label_data = json.load(f)
            
        all_points = []
        merged_labels = {
            "drivable": [], "crosswalk": [], "sidewalk": [], 
            "no_entry": [], "plaza": []
        }
        
        current_offset = 0
        
        # Sort frames by ID to ensure correct order
        frames = sorted(meta["frames"], key=lambda x: x["frame_id"])
        
        for frame in frames:
            frame_id = frame["frame_id"]
            frame_file = frames_dir / f"frame_{frame_id:04d}.bin"
            
            # Read points
            points = np.fromfile(frame_file, dtype=np.float32).reshape(-1, 3)
            all_points.append(points)
            
            # Merge labels with offset
            frame_labels = label_data["frame_labels"].get(str(frame_id), {})
            for area_type, indices in frame_labels.items():
                if area_type in merged_labels:
                    # Add offset to indices
                    global_indices = [idx + current_offset for idx in indices]
                    merged_labels[area_type].extend(global_indices)
            
            current_offset += len(points)
            
        if not all_points:
            return np.array([]), merged_labels
            
        return np.vstack(all_points), merged_labels
