"""
Polygon Generation Service
- Alpha Shape (Concave Hull)
- Douglas-Peucker simplification
- SemanticMapData export
"""
import math
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from scipy.spatial import Delaunay, ConvexHull, QhullError
from pyproj import CRS, Transformer
from pyproj.enums import PJType
from pyproj.exceptions import CRSError


class PolygonService:
    """Service for generating polygons from labeled points"""

    # Default area type configurations (matching existing semantic-map.js)
    AREA_TYPE_CONFIGS = {
        "drivable": {
            "color": "#4CAF50",
            "fillColor": "#4CAF50",
            "fillOpacity": 0.3,
            "weight": 2,
            "defaultSpeedLimit": 2.0,
            "traversable": True,
            "costWeight": 1.0
        },
        "crosswalk": {
            "color": "#FF9800",
            "fillColor": "#FF9800",
            "fillOpacity": 0.4,
            "weight": 2,
            "defaultSpeedLimit": 0.5,
            "traversable": True,
            "costWeight": 5.0
        },
        "sidewalk": {
            "color": "#9E9E9E",
            "fillColor": "#9E9E9E",
            "fillOpacity": 0.4,
            "weight": 2,
            "defaultSpeedLimit": 0.0,
            "traversable": False,
            "costWeight": 100.0
        },
        "no_entry": {
            "color": "#F44336",
            "fillColor": "#F44336",
            "fillOpacity": 0.5,
            "weight": 2,
            "defaultSpeedLimit": 0.0,
            "traversable": False,
            "costWeight": 1000.0
        },
        "plaza": {
            "color": "#2196F3",
            "fillColor": "#2196F3",
            "fillOpacity": 0.3,
            "weight": 2,
            "defaultSpeedLimit": 1.0,
            "traversable": True,
            "costWeight": 2.0
        }
    }

    def generate_polygon_from_points(
        self,
        points_2d: np.ndarray,
        origin: Dict[str, Any],
        alpha: float = 2.0,
        simplify_tolerance: float = 0.5
    ) -> Optional[List[List[float]]]:
        """
        Generate boundary polygon from labeled 2D points.

        Args:
            points_2d: (N, 2) array of XY points in local coordinates
            origin: GPS origin {"utm_easting", "utm_northing", "utm_zone"}
            alpha: Alpha shape parameter (larger = more convex)
            simplify_tolerance: Douglas-Peucker tolerance in meters

        Returns:
            List of [lng, lat] coordinates or None if failed
        """
        if len(points_2d) < 3:
            return None

        try:
            # Generate alpha shape
            boundary_points = self.alpha_shape(points_2d, alpha)

            if boundary_points is None or len(boundary_points) < 3:
                # Fall back to convex hull
                boundary_points = self.convex_hull(points_2d)

            if boundary_points is None or len(boundary_points) < 3:
                return None

            # Simplify polygon
            simplified = self.simplify_polygon(boundary_points, simplify_tolerance)

            # Convert local coordinates to WGS84
            wgs84_polygon = self.utm_to_wgs84(simplified, origin)

            return wgs84_polygon

        except Exception as e:
            print(f"Polygon generation error: {e}")
            return None

    def alpha_shape(
        self,
        points: np.ndarray,
        alpha: float
    ) -> Optional[np.ndarray]:
        """
        Compute alpha shape (concave hull) from 2D points.

        Args:
            points: (N, 2) array of XY points
            alpha: Alpha parameter (circumradius threshold)

        Returns:
            Ordered boundary points as (M, 2) array
        """
        if len(points) < 3:
            return None

        # Remove duplicate points
        points = np.unique(points, axis=0)
        if len(points) < 3:
            return None

        try:
            # Delaunay triangulation
            tri = Delaunay(points)
        except Exception:
            return None

        # Find boundary edges
        edge_count = {}

        for simplex in tri.simplices:
            # Get triangle vertices
            pts = points[simplex]

            # Calculate circumradius
            circumradius = self._circumradius(pts[0], pts[1], pts[2])

            # Keep triangle if circumradius < alpha
            if circumradius < alpha:
                for i in range(3):
                    edge = tuple(sorted([simplex[i], simplex[(i + 1) % 3]]))
                    edge_count[edge] = edge_count.get(edge, 0) + 1

        # Extract boundary edges (appear only once)
        boundary_edges = [e for e, count in edge_count.items() if count == 1]

        if not boundary_edges:
            return None

        # Order edges to form polygon
        ordered = self._order_edges(boundary_edges, points)

        return ordered

    def _circumradius(self, p1, p2, p3) -> float:
        """Calculate circumradius of a triangle"""
        a = np.linalg.norm(p1 - p2)
        b = np.linalg.norm(p2 - p3)
        c = np.linalg.norm(p3 - p1)

        s = (a + b + c) / 2
        area_sq = s * (s - a) * (s - b) * (s - c)

        if area_sq <= 0:
            return float('inf')

        area = math.sqrt(area_sq)
        if area == 0:
            return float('inf')

        return (a * b * c) / (4 * area)

    def _order_edges(
        self,
        edges: List[Tuple[int, int]],
        points: np.ndarray
    ) -> Optional[np.ndarray]:
        """Order boundary edges to form a closed polygon"""
        if not edges:
            return None

        # Build adjacency list
        adjacency = {}
        for e in edges:
            if e[0] not in adjacency:
                adjacency[e[0]] = []
            if e[1] not in adjacency:
                adjacency[e[1]] = []
            adjacency[e[0]].append(e[1])
            adjacency[e[1]].append(e[0])

        # Walk the boundary
        ordered_indices = []
        visited = set()

        # Start from first edge
        current = edges[0][0]
        ordered_indices.append(current)
        visited.add(current)

        while len(ordered_indices) < len(adjacency):
            neighbors = adjacency.get(current, [])
            next_node = None

            for n in neighbors:
                if n not in visited:
                    next_node = n
                    break

            if next_node is None:
                break

            ordered_indices.append(next_node)
            visited.add(next_node)
            current = next_node

        if len(ordered_indices) < 3:
            return None

        return points[ordered_indices]

    def convex_hull(self, points: np.ndarray) -> Optional[np.ndarray]:
        """Compute convex hull as fallback"""
        
        if len(points) < 3:
            return None

        try:
            hull = ConvexHull(points)
            return points[hull.vertices]
        except QhullError as e:
            print(f"ConvexHull failed (QhullError): {e}")
            return None
        except Exception as e:
            print(f"ConvexHull failed (Unknown): {e}")
            return None

    def simplify_polygon(
        self,
        polygon: np.ndarray,
        tolerance: float
    ) -> np.ndarray:
        """
        Douglas-Peucker polygon simplification.

        Args:
            polygon: (N, 2) array of polygon vertices
            tolerance: Maximum perpendicular distance

        Returns:
            Simplified polygon vertices
        """
        if len(polygon) <= 3:
            return polygon

        # Recursive Douglas-Peucker
        def rdp(points, epsilon):
            if len(points) < 3:
                return points

            # Find point with maximum distance from line
            start = points[0]
            end = points[-1]

            max_dist = 0
            max_idx = 0

            for i in range(1, len(points) - 1):
                dist = self._perpendicular_distance(points[i], start, end)
                if dist > max_dist:
                    max_dist = dist
                    max_idx = i

            # If max distance > epsilon, recursively simplify
            if max_dist > epsilon:
                left = rdp(points[:max_idx + 1], epsilon)
                right = rdp(points[max_idx:], epsilon)
                return np.vstack([left[:-1], right])
            else:
                return np.array([start, end])

        simplified = rdp(polygon, tolerance)

        # Ensure polygon is closed
        if not np.allclose(simplified[0], simplified[-1]):
            simplified = np.vstack([simplified, simplified[0]])

        return simplified

    def _perpendicular_distance(self, point, line_start, line_end) -> float:
        """Calculate perpendicular distance from point to line"""
        if np.allclose(line_start, line_end):
            return np.linalg.norm(point - line_start)

        line_vec = line_end - line_start
        point_vec = point - line_start

        line_len = np.linalg.norm(line_vec)
        line_unit = line_vec / line_len

        proj_length = np.dot(point_vec, line_unit)
        proj = line_start + proj_length * line_unit

        return np.linalg.norm(point - proj)

    def utm_to_wgs84(
        self,
        polygon_local: np.ndarray,
        origin: Dict[str, Any]
    ) -> List[List[float]]:
        """
        Convert local coordinate polygon to WGS84 [lng, lat] format using pyproj.

        Args:
            polygon_local: (N, 2) array of local XY coordinates (relative to origin)
            origin: Origin info with utm_zone, utm_easting, utm_northing

        Returns:
            List of [lng, lat] coordinates
        """
        utm_zone_str = origin.get("utm_zone")
        if not utm_zone_str:
            raise ValueError("utm_zone is missing from origin data")

        zone_number = int(utm_zone_str[:-1])
        is_northern = utm_zone_str[-1].upper() == 'N'
        
        # Get origin offset
        origin_easting = origin.get("utm_easting", 0)
        origin_northing = origin.get("utm_northing", 0)

        try:
            # Create UTM CRS object
            utm_crs = CRS.from_dict({
                'proj': 'utm',
                'zone': zone_number,
                'south': not is_northern
            })
            wgs84_crs = CRS.from_epsg(4326)  # WGS84

            # Create transformer
            transformer = Transformer.from_crs(utm_crs, wgs84_crs, always_xy=True)

        except CRSError as e:
            raise ValueError(f"Invalid UTM zone '{utm_zone_str}': {e}") from e

        # Add origin offset to get absolute UTM coordinates
        abs_utm_coords = polygon_local + np.array([origin_easting, origin_northing])

        # Separate eastings and northings for transformation
        eastings = abs_utm_coords[:, 0].tolist()
        northings = abs_utm_coords[:, 1].tolist()
        
        # Transform points in one go
        longitudes, latitudes = transformer.transform(eastings, northings)

        # Combine into [lng, lat] format for GeoJSON
        wgs84_coords = [[lng, lat] for lng, lat in zip(longitudes, latitudes)]

        return wgs84_coords

    def calculate_area(
        self,
        polygon_wgs84: List[List[float]],
        origin: Dict[str, Any]
    ) -> float:
        """
        Calculate polygon area in square meters using pyproj.
        Uses Shoelace formula on UTM coordinates for accuracy.
        """
        utm_zone_str = origin.get("utm_zone")
        if not utm_zone_str:
            return 0.0

        zone_number = int(utm_zone_str[:-1])
        is_northern = utm_zone_str[-1].upper() == 'N'

        try:
            # Create transformer from WGS84 to the specific UTM zone
            wgs84_crs = CRS.from_epsg(4326)
            utm_crs = CRS.from_dict({
                'proj': 'utm',
                'zone': zone_number,
                'south': not is_northern
            })
            transformer = Transformer.from_crs(wgs84_crs, utm_crs, always_xy=True)
        except CRSError:
            return 0.0

        # Separate lng/lat for transformation
        longitudes = [pt[0] for pt in polygon_wgs84]
        latitudes = [pt[1] for pt in polygon_wgs84]

        # Transform points
        eastings, northings = transformer.transform(longitudes, latitudes)
        utm_points = np.array(list(zip(eastings, northings)))
        
        # Shoelace formula for area
        n = len(utm_points)
        area = 0.5 * abs(
            np.dot(utm_points[:, 0], np.roll(utm_points[:, 1], 1)) -
            np.dot(utm_points[:, 1], np.roll(utm_points[:, 0], 1))
        )
        return area

    def create_semantic_map_data(
        self,
        map_name: str,
        polygons: List[Dict[str, Any]],
        origin: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create SemanticMapData structure compatible with existing semantic-editor.

        Args:
            map_name: Name of the map
            polygons: List of {"type": str, "polygon": [[lng,lat],...], "point_count": int}
            origin: GPS origin

        Returns:
            SemanticMapData dict
        """
        areas = []
        type_counters = {}

        for poly_data in polygons:
            area_type = poly_data["type"]

            # Generate ID
            if area_type not in type_counters:
                type_counters[area_type] = 0
            type_counters[area_type] += 1
            area_id = f"{area_type}_{type_counters[area_type]:03d}"

            # Get config for this type
            config = self.AREA_TYPE_CONFIGS.get(area_type, self.AREA_TYPE_CONFIGS["drivable"])

            area = {
                "id": area_id,
                "type": area_type,
                "polygon": poly_data["polygon"],
                "properties": {
                    "speed_limit": config["defaultSpeedLimit"],
                    "priority": 1,
                    "traversable": config["traversable"],
                    "cost_weight": config["costWeight"],
                    "remark": f"Generated from {poly_data['point_count']} LiDAR points"
                }
            }
            areas.append(area)

        semantic_map = {
            "version": "1.0",
            "name": map_name,
            "coordinate_system": {
                "type": "WGS84",
                "zone": origin.get("utm_zone"),
                "origin": [origin.get("lng"), origin.get("lat")],
                "note": "Generated from LiDAR point cloud labeling"
            },
            "areas": areas,
            "area_types": self.AREA_TYPE_CONFIGS
        }

        return semantic_map
