from matplotlib.patches import FancyArrowPatch
from matplotlib.lines import Line2D
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import cartopy.crs as ccrs
import contextily as ctx

class MapCanvas(FigureCanvas):
    def __init__(self, nodes, links, parent=None):
        """
        지도 캔버스 초기화.
        :param nodes: Node 객체 리스트
        :param links: Link 객체 리스트
        :param parent: PyQt 위젯
        """
        self.fig, self.ax = plt.subplots(
            figsize=(20, 20),
            subplot_kw={"projection": ccrs.PlateCarree()}
        )
        super().__init__(self.fig)
        self.setParent(parent)

        self.nodes = {node.ID: node for node in nodes}  # Node ID로 빠르게 검색 가능하도록 dict로 변환
        self.links = links

        self.plot_map()

    def plot_map(self):
        """노드와 링크 데이터를 지도에 시각화."""
        if not self.nodes:
            raise ValueError("Node 데이터가 비어 있습니다.")

        # Node 좌표 추출
        latitudes = [node.GpsInfo.Lat for node in self.nodes.values()]
        longitudes = [node.GpsInfo.Long for node in self.nodes.values()]

        # 지도 배경 설정
        self.ax.set_title("Node and Link Visualization")
        self.ax.set_extent([
            min(longitudes) - 0.1, max(longitudes) + 0.1,
            min(latitudes) - 0.1, max(latitudes) + 0.1
        ])
        print("map load start")
        # Google Maps 타일 추가
        google_tiles_url = "http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        try:
            ctx.add_basemap(self.ax, crs="EPSG:4326", source=google_tiles_url, zoom=15)
        except Exception as e:
            print(f"Google Maps 타일 로드 오류: {e}")
        print("map load end")
        # Node 시각화
        for node in self.nodes.values():
            self.ax.scatter(
                node.GpsInfo.Long,
                node.GpsInfo.Lat,
                color="red",
                s=50,
                alpha=0.7,
                transform=ccrs.PlateCarree()
            )
            self.ax.text(
                node.GpsInfo.Long,
                node.GpsInfo.Lat,
                node.ID,
                fontsize=8,
                transform=ccrs.PlateCarree()
            )
        # Link 시각화
        for link in self.links:
            from_node = self.nodes.get(link.FromNodeID)
            to_node = self.nodes.get(link.ToNodeID)

            if from_node and to_node:
                self.draw_arrow(
                    from_lon=from_node.GpsInfo.Long,
                    from_lat=from_node.GpsInfo.Lat,
                    to_lon=to_node.GpsInfo.Long,
                    to_lat=to_node.GpsInfo.Lat
                )

        self.ax.set_axis_off()

    def draw_arrow(self, from_lon, from_lat, to_lon, to_lat):
        """노드 간 화살표 그리기."""
        arrow = FancyArrowPatch(
            (from_lon, from_lat),
            (to_lon, to_lat),
            color="blue",
            arrowstyle="->",
            mutation_scale=15,
            transform=ccrs.PlateCarree()
        )
        self.ax.add_patch(arrow)
