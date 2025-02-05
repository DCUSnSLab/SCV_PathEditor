from matplotlib.patches import FancyArrowPatch
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import cartopy.crs as ccrs
import contextily as ctx

class MapCanvas(FigureCanvas):
    def __init__(self, nodes, links, parent=None):
        self.fig, self.ax = plt.subplots(
            figsize=(20, 20), subplot_kw={"projection": ccrs.PlateCarree()}
        )
        super().__init__(self.fig)
        self.setParent(parent)
        self.nodes_list = nodes
        self.links = links
        self.nodes_dict = {node.ID: node for node in nodes}
        self.plot_map()

    def plot_map(self):
        if not self.nodes_list:
            raise ValueError("Node 데이터 없음")
        lats = [n.GpsInfo.Lat for n in self.nodes_list]
        lons = [n.GpsInfo.Long for n in self.nodes_list]
        self.ax.set_title("Node and Link Visualization")
        self.ax.set_extent([min(lons)-0.001, max(lons)+0.001, min(lats)-0.001, max(lats)+0.001])
        url = "http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        try:
            ctx.add_basemap(self.ax, crs="EPSG:4326", source=url, zoom=15)
        except Exception as e:
            print(f"타일 로드 오류: {e}")
        for node in self.nodes_list:
            self.ax.scatter(node.GpsInfo.Long, node.GpsInfo.Lat, color="red", s=50, alpha=0.7,
                            transform=ccrs.PlateCarree())
            self.ax.text(node.GpsInfo.Long, node.GpsInfo.Lat, node.ID, fontsize=10,
                         transform=ccrs.PlateCarree())
        for link in self.links:
            a = self.nodes_dict.get(link.FromNodeID)
            b = self.nodes_dict.get(link.ToNodeID)
            if a and b:
                self.draw_arrow(a.GpsInfo.Long, a.GpsInfo.Lat, b.GpsInfo.Long, b.GpsInfo.Lat)
        self.ax.set_axis_off()

    def draw_arrow(self, from_lon, from_lat, to_lon, to_lat):
        arrow = FancyArrowPatch(
            (from_lon, from_lat), (to_lon, to_lat), color="blue",
            arrowstyle="->", mutation_scale=15, transform=ccrs.PlateCarree()
        )
        self.ax.add_patch(arrow)
        
    def add_link_to_map(self, link):
        if not self.nodes_list:
            return
        node_dict = {n.ID: n for n in self.nodes_list}
        a = node_dict.get(link["FromNodeID"])
        b = node_dict.get(link["ToNodeID"])
        if not (a and b):
            return
        ax, ay = a.UtmInfo.Easting, a.UtmInfo.Northing
        bx, by = b.UtmInfo.Easting, b.UtmInfo.Northing
        self.ax.plot([ax, bx], [ay, by], 'r-', linewidth=2)
        self.figure.canvas.draw_idle()

    def connect_map_click_event(self, callback):
        self.mpl_connect("button_press_event", callback)
