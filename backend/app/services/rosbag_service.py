"""
ROS2 Bag Parsing Service using rosbags library (pure Python)
"""
import struct
import sqlite3
import shutil
import math
import numpy as np
from pathlib import Path
from typing import Iterator, Tuple, List, Dict, Any, Optional
from datetime import datetime
import yaml

from rosbags.serde import deserialize_cdr
from rosbags.typesys import Stores, get_typestore


class RosbagService:
    """Service for parsing ROS2 bag files"""

    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        # Initialize typestore for ROS2 humble
        self.typestore = get_typestore(Stores.ROS2_HUMBLE)

    def get_bag_path(self, bag_id: str) -> Path:
        return self.storage_dir / bag_id

    def list_bags(self) -> List[str]:
        bags = []
        for path in self.storage_dir.iterdir():
            if path.is_dir():
                if list(path.glob("*.db3")) or list(path.glob("metadata.yaml")):
                    bags.append(path.name)
        return sorted(bags)

    def _find_db3_file(self, bag_path: Path) -> Path:
        """Find the .db3 file in the bag directory"""
        db3_files = list(bag_path.glob("*.db3"))
        if not db3_files:
            raise FileNotFoundError(f"No .db3 file found in {bag_path}")
        return db3_files[0]

    def _get_topics_from_db3(self, db3_path: Path) -> List[Dict[str, Any]]:
        """Get topic info directly from sqlite database"""
        topics = []
        conn = sqlite3.connect(str(db3_path))
        cursor = conn.cursor()

        try:
            # Get topics from the topics table
            cursor.execute("SELECT name, type FROM topics")
            for row in cursor.fetchall():
                topic_name, msg_type = row

                # Count messages for this topic
                cursor.execute("""
                    SELECT COUNT(*) FROM messages
                    WHERE topic_id = (SELECT id FROM topics WHERE name = ?)
                """, (topic_name,))
                count = cursor.fetchone()[0]

                topics.append({
                    "name": topic_name,
                    "msg_type": msg_type,
                    "count": count
                })
        finally:
            conn.close()

        return topics

    def _get_time_range_from_db3(self, db3_path: Path) -> Tuple[Optional[int], Optional[int]]:
        """Get start and end timestamps from sqlite database"""
        conn = sqlite3.connect(str(db3_path))
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT MIN(timestamp), MAX(timestamp) FROM messages")
            row = cursor.fetchone()
            return row[0], row[1]
        except:
            return None, None
        finally:
            conn.close()

    def get_bag_info(self, bag_id: str) -> Dict[str, Any]:
        """Get metadata about a bag file."""
        bag_path = self.get_bag_path(bag_id)
        if not bag_path.exists():
            raise FileNotFoundError(f"Bag not found: {bag_id}")

        total_size = sum(f.stat().st_size for f in bag_path.rglob("*") if f.is_file())

        db3_path = self._find_db3_file(bag_path)
        topics = self._get_topics_from_db3(db3_path)

        start_ns, end_ns = self._get_time_range_from_db3(db3_path)

        duration_sec = 0.0
        start_time = None
        end_time = None

        if start_ns and end_ns:
            duration_sec = (end_ns - start_ns) / 1e9
            start_time = datetime.fromtimestamp(start_ns / 1e9).isoformat()
            end_time = datetime.fromtimestamp(end_ns / 1e9).isoformat()

        return {
            "bag_id": bag_id,
            "filename": bag_id,
            "size_bytes": total_size,
            "duration_sec": duration_sec,
            "topics": topics,
            "start_time": start_time,
            "end_time": end_time,
            "upload_time": datetime.now().isoformat()
        }

    def read_pointcloud2_messages(
        self,
        bag_id: str,
        topic: str = "/velodyne_points"
    ) -> Iterator[Tuple[float, np.ndarray]]:
        """Generator that yields PointCloud2 messages as numpy arrays."""
        bag_path = self.get_bag_path(bag_id)
        db3_path = self._find_db3_file(bag_path)

        conn = sqlite3.connect(str(db3_path))
        cursor = conn.cursor()

        try:
            # Get topic id and type
            cursor.execute("SELECT id, type FROM topics WHERE name = ?", (topic,))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Topic {topic} not found in bag")

            topic_id, msg_type = row

            # Register the message type if needed
            try:
                self.typestore.register(self.typestore.find_msgdef(msg_type))
            except:
                pass

            # Read messages
            cursor.execute("""
                SELECT timestamp, data FROM messages
                WHERE topic_id = ?
                ORDER BY timestamp
            """, (topic_id,))

            for timestamp, data in cursor:
                try:
                    msg = deserialize_cdr(data, msg_type, self.typestore)
                    points = self._parse_pointcloud2(msg)
                    timestamp_sec = timestamp / 1e9
                    yield timestamp_sec, points
                except Exception as e:
                    print(f"Error parsing pointcloud message: {e}")
                    continue
        finally:
            conn.close()

    def read_navsatfix_messages(
        self,
        bag_id: str,
        topic: str = "/ublox_gps_node/fix"
    ) -> Iterator[Tuple[float, Dict[str, Any]]]:
        """Generator that yields NavSatFix messages."""
        bag_path = self.get_bag_path(bag_id)
        db3_path = self._find_db3_file(bag_path)

        conn = sqlite3.connect(str(db3_path))
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT id, type FROM topics WHERE name = ?", (topic,))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Topic {topic} not found in bag")

            topic_id, msg_type = row

            cursor.execute("""
                SELECT timestamp, data FROM messages
                WHERE topic_id = ?
                ORDER BY timestamp
            """, (topic_id,))

            for timestamp, data in cursor:
                try:
                    msg = deserialize_cdr(data, msg_type, self.typestore)

                    gps_data = {
                        "lat": float(msg.latitude),
                        "lng": float(msg.longitude),
                        "alt": float(msg.altitude),
                        "status": int(msg.status.status) if hasattr(msg, 'status') and hasattr(msg.status, 'status') else 0
                    }

                    timestamp_sec = timestamp / 1e9
                    yield timestamp_sec, gps_data
                except Exception as e:
                    print(f"Error parsing GPS message: {e}")
                    continue
        finally:
            conn.close()

    def read_odometry_messages(
        self,
        bag_id: str,
        topic: str
    ) -> Iterator[Tuple[float, float]]:
        bag_path = self.get_bag_path(bag_id)
        db3_path = self._find_db3_file(bag_path)

        conn = sqlite3.connect(str(db3_path))
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT id, type FROM topics WHERE name = ?", (topic,))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Topic {topic} not found in bag")

            topic_id, msg_type = row

            cursor.execute("""
                SELECT timestamp, data FROM messages
                WHERE topic_id = ?
                ORDER BY timestamp
            """, (topic_id,))

            for timestamp, data in cursor:
                try:
                    msg = deserialize_cdr(data, msg_type, self.typestore)
                    q = msg.pose.pose.orientation
                    yaw = math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z))
                    timestamp_sec = timestamp / 1e9
                    yield timestamp_sec, float(yaw)
                except Exception as e:
                    print(f"Error parsing Odometry message: {e}")
                    continue
        finally:
            conn.close()

    def _parse_pointcloud2(self, msg) -> np.ndarray:
        """Parse a PointCloud2 message to numpy array (Optimized)."""
        type_map = {
            1: 'i1', 2: 'u1', 3: 'i2', 4: 'u2',
            5: 'i4', 6: 'u4', 7: 'f4', 8: 'f8'
        }

        dtype_list = []
        current_offset = 0
        
        sorted_fields = sorted(msg.fields, key=lambda f: f.offset)
        
        for f in sorted_fields:
            if f.offset > current_offset:
                dtype_list.append((f'pad_{current_offset}', f'V{f.offset - current_offset}'))
            
            np_type = type_map.get(f.datatype, 'f4')
            dtype_list.append((f.name, np_type))
            
            current_offset = f.offset + np.dtype(np_type).itemsize
            
        if msg.point_step > current_offset:
            dtype_list.append((f'pad_{current_offset}', f'V{msg.point_step - current_offset}'))
            
        try:
            points_struct = np.frombuffer(msg.data, dtype=dtype_list)
        except ValueError:
            return np.zeros((0, 4), dtype=np.float32)

        if len(points_struct) == 0:
            return np.zeros((0, 4), dtype=np.float32)

        result = np.zeros((len(points_struct), 4), dtype=np.float32)
        # Ensure names is a tuple
        names = points_struct.dtype.names or ()
        
        if 'x' in names:
            result[:, 0] = points_struct['x'].astype(np.float32)
        if 'y' in names:
            result[:, 1] = points_struct['y'].astype(np.float32)
        if 'z' in names:
            result[:, 2] = points_struct['z'].astype(np.float32)
            
        if 'intensity' in names:
            result[:, 3] = points_struct['intensity'].astype(np.float32)
        elif 'i' in names:
            result[:, 3] = points_struct['i'].astype(np.float32)
            
        valid_mask = np.isfinite(result[:, 0]) & np.isfinite(result[:, 1]) & np.isfinite(result[:, 2])
        return result[valid_mask]

    def _get_field_type(self, field) -> str:
        type_map = {
            1: 'b', 2: 'B', 3: 'h', 4: 'H',
            5: 'i', 6: 'I', 7: 'f', 8: 'd',
        }
        return type_map.get(field.datatype, 'f')

    def delete_bag(self, bag_id: str) -> bool:
        bag_path = self.get_bag_path(bag_id)
        if bag_path.exists():
            shutil.rmtree(bag_path)
            return True
        return False
