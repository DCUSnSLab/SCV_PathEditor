import json  # JSON 파일 파싱을 위해 추가
import pandas as pd
import geopandas as gpd
from PyQt6.QtWidgets import QMessageBox
import contextily as ctx
from shapely.geometry import Point
from scipy.spatial import KDTree
from geopy.distance import geodesic
from shapely.affinity import translate
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
from modules.util import convert_to_utm

class MapCanvas(FigureCanvas):
    def __init__(self, main_window, parent=None):
        self.fig = Figure(figsize=(10, 10))
        self.ax = self.fig.add_subplot(111)
        super().__init__(self.fig)
        self.setParent(parent)
        self.gdf = None
        self.main_window = main_window  # MainWindow 참조를 저장
        self.selected_points = []  # 테이블에서 선택된 포인트 저장
        self.is_adding_point = False  # 포인트 추가 모드 상태
        self.fill_points_mode = False  # 포인트 간격 채우기 모드 상태
        self.fill_points = []  # 채울 포인트의 두 점 저장

    def load_data(self, file_path):
        """
        JSON 파일을 열어 "Node" 항목에서 데이터를 읽어온 뒤,
        latitude, longitude, utm_easting, utm_northing, utm_zone_number 컬럼을 가진 DataFrame을 만든다.
        """
        try:
            # === JSON 파일 로드 부분 (변경됨) ===
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # JSON 내 "Node" 키가 존재하는지 확인
            if "Node" not in data:
                raise ValueError("JSON에 'Node' 키가 없습니다.")

            nodes = data["Node"]
            if not isinstance(nodes, list):
                raise ValueError("'Node' 키에 대한 값이 리스트가 아닙니다.")

            # Node 리스트에서 필요한 값 추출
            records = []
            for node in nodes:
                gps_info = node.get("GpsInfo", {})
                utm_info = node.get("UtmInfo", {})

                lat = gps_info.get("Lat")
                lon = gps_info.get("Long")
                easting = utm_info.get("Easting")
                northing = utm_info.get("Northing")
                zone = utm_info.get("Zone")

                # 필요한 정보가 None인 경우 기본 예외 처리를 할 수도 있음
                # 여기서는 간단히 None 허용 (필요 시 예외 처리)
                records.append({
                    "latitude": lat,
                    "longitude": lon,
                    "utm_easting": easting,
                    "utm_northing": northing,
                    "utm_zone_number": zone
                })

            # 추출한 records 리스트를 DataFrame으로 변환
            self.df = pd.DataFrame(records)
            if self.df.empty:
                raise ValueError("JSON 파일에서 'Node' 정보가 비어있습니다.")

            # CSV가 아니므로 아래 컬럼 검사 로직만 재활용
            if not {'latitude', 'longitude', 'utm_easting', 'utm_northing', 'utm_zone_number'}.issubset(self.df.columns):
                raise ValueError("JSON에는 'latitude', 'longitude', 'utm_easting', 'utm_northing', 'utm_zone_number' 컬럼이 포함되어 있어야 합니다.")
            # === 변경 끝 ===

            # === 이하 기존 로직 유지 ===
            # GeoDataFrame으로 변환 (WGS84 -> Web Mercator)
            geometry = [Point(xy) for xy in zip(self.df['longitude'], self.df['latitude'])]
            self.gdf = gpd.GeoDataFrame(self.df, geometry=geometry)
            self.gdf.set_crs(epsg=4326, inplace=True)
            self.gdf = self.gdf.to_crs(epsg=3857)

            # KDTree 구축
            coords = list(zip(self.gdf.geometry.x, self.gdf.geometry.y))
            self.tree = KDTree(coords)

            # 지도 그리기
            self.plot_map()

            # 테이블 업데이트
            self.main_window.update_table(self.df)

        except Exception as e:
            QMessageBox.critical(self, "오류", f"데이터 로드 실패:\n{e}")

    def plot_map(self):
        # 현재 축의 xlim과 ylim을 저장 (없을 경우 None 처리)
        xlim, ylim = None, None
        if self.ax.has_data():
            xlim = self.ax.get_xlim()
            ylim = self.ax.get_ylim()

        self.ax.clear()

        # 좌표계가 Web Mercator (EPSG:3857)로 변환된 상태에서 포인트 플롯
        if self.gdf is not None and not self.gdf.empty:
            self.gdf.plot(ax=self.ax, marker='o', color='blue', markersize=5, alpha=0.7)

        # Google Satellite 타일 URL
        google_tiles_url = "http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"

        # 베이스맵 추가
        try:
            # 구글 타일을 우선 시도
            ctx.add_basemap(self.ax, crs=self.gdf.crs.to_string(), source=google_tiles_url, zoom=21)
        except Exception as e:
            print(f"Google 타일 추가 중 오류 발생: {e}")
            print("대체 맵 Esri.WorldImagery로 전환합니다.")
            try:
                # Esri 타일로 대체
                ctx.add_basemap(self.ax, crs=self.gdf.crs.to_string(), source=ctx.providers.Esri.WorldImagery, zoom=18)
            except Exception as esri_error:
                print(f"Esri.WorldImagery 타일 추가 중 오류 발생: {esri_error}")

        # 확대/축소 상태가 저장된 경우 해당 상태를 복구
        if xlim and ylim:
            self.ax.set_xlim(xlim)
            self.ax.set_ylim(ylim)
        else:
            # 데이터가 처음 그려질 때 한 번만 지도의 전체 영역을 설정
            if self.gdf is not None and not self.gdf.empty:
                self.ax.set_xlim(self.gdf.total_bounds[[0, 2]])
                self.ax.set_ylim(self.gdf.total_bounds[[1, 3]])

        self.ax.set_axis_off()
        self.fig.tight_layout()
        self.draw()

    def highlight_selected_points(self):
        self.plot_map()
        for i in self.selected_points:
            self.ax.plot(
                self.gdf.geometry.x.iloc[i],
                self.gdf.geometry.y.iloc[i],
                'ro', markersize=10
            )
        self.draw()

    def on_click(self, event):
        if event.inaxes != self.ax:
            return
        click_x, click_y = event.xdata, event.ydata
        point = gpd.GeoSeries([Point(click_x, click_y)], crs="EPSG:3857")
        point_wgs84 = point.to_crs(epsg=4326)

        longitude, latitude = point_wgs84.geometry.x[0], point_wgs84.geometry.y[0]

        if self.is_adding_point:
            self.add_point(latitude, longitude)
        elif self.fill_points_mode:
            self.fill_points.append((latitude, longitude))
            if len(self.fill_points) == 2:
                self.fill_between_points(self.fill_points[0], self.fill_points[1])
                self.fill_points = []
                self.fill_points_mode = False
                QMessageBox.information(self.main_window, "포인트 채우기 완료", "두 점 사이에 포인트를 채웠습니다.")
            else:
                QMessageBox.information(self.main_window, "포인트 선택", "두 번째 포인트를 선택하세요.")
        else:
            self.main_window.show_coordinates(latitude, longitude)
            if self.gdf is not None and not self.gdf.empty:
                distance, index = self.tree.query([click_x, click_y])
                self.main_window.show_point_index(index)

    def add_point(self, latitude, longitude):
        new_row = pd.DataFrame([[latitude, longitude]], columns=['latitude', 'longitude'])

        # UTM 변환
        utm_easting, utm_northing, utm_zone_number, utm_zone_letter = convert_to_utm(latitude, longitude)
        new_row['utm_easting'] = utm_easting
        new_row['utm_northing'] = utm_northing
        new_row['utm_zone_number'] = f"{utm_zone_number}{utm_zone_letter}"

        self.df = pd.concat([self.df, new_row], ignore_index=True)

        new_geometry = Point(longitude, latitude)
        new_gdf_row = gpd.GeoDataFrame([[new_geometry]], columns=['geometry'], crs="EPSG:4326")
        new_gdf_row = new_gdf_row.to_crs(epsg=3857)
        self.gdf = pd.concat([self.gdf, new_gdf_row], ignore_index=True)

        coords = list(zip(self.gdf.geometry.x, self.gdf.geometry.y))
        self.tree = KDTree(coords)

        self.plot_map()
        self.main_window.update_table(self.df)

    def fill_between_points(self, point1, point2, interval_km=0.0002):
        lat1, lon1 = point1
        lat2, lon2 = point2
        total_distance = geodesic((lat1, lon1), (lat2, lon2)).kilometers
        if total_distance == 0:
            QMessageBox.warning(self.main_window, "경고", "두 점이 동일한 위치에 있습니다.")
            return
        num_points = max(int(total_distance / interval_km), 1)
        lats = [lat1 + (lat2 - lat1) * i / (num_points + 1) for i in range(1, num_points + 1)]
        lons = [lon1 + (lon2 - lon1) * i / (num_points + 1) for i in range(1, num_points + 1)]

        for lat, lon in zip(lats, lons):
            self.add_point(lat, lon)

        self.plot_map()
        QMessageBox.information(self.main_window, "포인트 채우기 완료", f"두 점 사이에 {num_points}개의 포인트를 채웠습니다.")

    def remove_selected_points(self):
        if not self.selected_points:
            QMessageBox.warning(self.main_window, "경고", "삭제할 포인트가 선택되지 않았습니다.")
            return
        for index in sorted(self.selected_points, reverse=True):
            self.df.drop(index, inplace=True)
            self.gdf.drop(index, inplace=True)
        self.df.reset_index(drop=True, inplace=True)
        self.gdf.reset_index(drop=True, inplace=True)

        if not self.gdf.empty:
            coords = list(zip(self.gdf.geometry.x, self.gdf.geometry.y))
            self.tree = KDTree(coords)
        else:
            self.tree = None

        self.selected_points = []
        self.plot_map()
        self.main_window.update_table(self.df)

    def move_points(self, direction, distance_cm):
        if not self.selected_points:
            QMessageBox.warning(self.main_window, "경고", "이동할 포인트가 선택되지 않았습니다.")
            return
        distance_m = distance_cm / 100.0

        if direction == 'east':
            delta_x, delta_y = distance_m, 0
        elif direction == 'west':
            delta_x, delta_y = -distance_m, 0
        elif direction == 'north':
            delta_x, delta_y = 0, distance_m
        elif direction == 'south':
            delta_x, delta_y = 0, -distance_m
        else:
            QMessageBox.warning(self.main_window, "경고", "올바른 방향을 지정하세요.")
            return

        for idx in self.selected_points:
            original_geometry = self.gdf.at[idx, 'geometry']
            translated_geometry = translate(original_geometry, xoff=delta_x, yoff=delta_y)
            self.gdf.at[idx, 'geometry'] = translated_geometry

        gdf_wgs84 = self.gdf.to_crs(epsg=4326)
        for idx in self.selected_points:
            longitude = gdf_wgs84.at[idx, 'geometry'].x
            latitude = gdf_wgs84.at[idx, 'geometry'].y
            self.df.at[idx, 'longitude'] = longitude
            self.df.at[idx, 'latitude'] = latitude

            utm_easting, utm_northing, utm_zone_number, utm_zone_letter = convert_to_utm(latitude, longitude)
            self.df.at[idx, 'utm_easting'] = utm_easting
            self.df.at[idx, 'utm_northing'] = utm_northing
            self.df.at[idx, 'utm_zone_number'] = f"{utm_zone_number}{utm_zone_letter}"

        coords = list(zip(self.gdf.geometry.x, self.gdf.geometry.y))
        self.tree = KDTree(coords) if coords else None

        self.plot_map()
        self.main_window.update_table(self.df)
        QMessageBox.information(
            self.main_window, 
            "포인트 이동 완료", 
            f"{len(self.selected_points)}개의 선택된 포인트가 {direction}으로 {distance_cm}cm 이동되었습니다."
        )
