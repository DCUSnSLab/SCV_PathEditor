import sys, os, json, math
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QPushButton, QVBoxLayout, QWidget,
    QFileDialog, QLabel, QMessageBox, QHBoxLayout, QTableWidget, QTableWidgetItem, QLineEdit
)
from PyQt6.QtCore import QUrl
from matplotlib.backends.backend_qt5agg import NavigationToolbar2QT as NavigationToolbar
from modules.ui_setup import setup_ui
from modules.model import Node, Link
from modules.map_viewer import MapCanvas
from modules.util import json_to_links, json_to_nodes
from dataclasses import asdict

class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.nodes = []
        self.links = []
        self.node_select_mode = False
        self.link_select_mode = False
        self.selected_node = None
        setup_ui(self)
    
    def load_file(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        default_path = os.path.join(base_dir, '..', 'data', 'path')
        os.makedirs(default_path, exist_ok=True)
        file_name, _ = QFileDialog.getOpenFileName(
            self, "JSON 파일 열기", default_path, "JSON Files (*.json);;All Files (*)"
        )
        if file_name:
            with open(file_name, 'r', encoding='utf-8') as file:
                json_data = json.load(file)
            self.nodes = json_to_nodes(json_data)
            self.links = json_to_links(json_data)
            self.populate_node_table()
            self.populate_link_table()
            self.display_map()
        
    def save_file(self): # 아직 save 미구현
        # 기본 경로: data/path 폴더 (현재 main_window.py 기준 경로 설정)
        base_dir = os.path.dirname(os.path.abspath(__file__))
        default_path = os.path.join(base_dir, '..', 'data', 'path')
        os.makedirs(default_path, exist_ok=True)

        # 저장할 파일 경로 선택
        file_name, _ = QFileDialog.getSaveFileName(
            self,
            "JSON 파일 저장",
            os.path.join(default_path, "new_path.json"),
            "JSON Files (*.json);;All Files (*)"
        )
        if not file_name:
            return

        # Node와 Link 객체를 dict로 변환하여 JSON 구조에 맞게 구성
        data = {
            "Node": [asdict(node) for node in self.nodes],
            "Link": [asdict(link) for link in self.links]
        }

        try:
            with open(file_name, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            QMessageBox.information(self, "저장", "파일이 성공적으로 저장되었습니다.")
        except Exception as e:
            QMessageBox.warning(self, "저장 오류", f"파일 저장 중 오류가 발생하였습니다:\n{e}")

    def add_link_to_map(self, link):
        print("add_link")
        if not self.nodes:
            return
        node_dict = {node.ID: node for node in self.nodes}
        from_node = node_dict.get(link["FromNodeID"])
        to_node = node_dict.get(link["ToNodeID"])
        print(from_node, to_node)
        if not (from_node and to_node):
            return
        # GpsInfo 좌표를 사용하여 화살표 그리기
        ax, ay = from_node.GpsInfo.Long, from_node.GpsInfo.Lat
        bx, by = to_node.GpsInfo.Long, to_node.GpsInfo.Lat
        self.map_canvas.draw_arrow(ax, ay, bx, by)
        self.map_canvas.figure.canvas.draw_idle()
        
    def enable_node_select_mode(self):
        self.link_select_mode = False
        self.node_select_mode = not self.node_select_mode
        msg = "select mod start" if self.node_select_mode else "select mod end"
        QMessageBox.information(self, "Node Select", msg)

    def enable_link_select_mode(self):
        self.node_select_mode = False
        self.link_select_mode = not self.link_select_mode
        msg = "select mod start" if self.link_select_mode else "select mod end"
        QMessageBox.information(self, "Link Select", msg)
    
    def toggle_link_add_mode(self):
        visible = self.link_form.isVisible()
        self.link_form.setVisible(not visible)

    def display_map(self):
        if not self.nodes:
            QMessageBox.warning(self, "경고", "표시할 Node 데이터가 없습니다.")
            return
        for i in reversed(range(self.right_layout.count())):
            w = self.right_layout.itemAt(i).widget()
            if w:
                w.setParent(None)
        self.map_canvas = MapCanvas(self.nodes, self.links)
        self.map_canvas.connect_map_click_event(self.on_map_click)
        toolbar = NavigationToolbar(self.map_canvas, self)
        self.right_layout.addWidget(toolbar)
        self.right_layout.addWidget(self.map_canvas)

    def on_map_click(self, event):
        if not self.node_select_mode or event.xdata is None or event.ydata is None:
            return
        lon, lat = event.xdata, event.ydata
        closest = self.find_closest_node(lon, lat)
        if closest:
            self.selected_node = closest
            self.text_field_1.setText(closest.ID)
            self.node_select_mode = False

    def populate_node_table(self):
        self.node_table.setRowCount(len(self.nodes))
        for row, node in enumerate(self.nodes):
            vals = [
                node.ID, node.AdminCode, str(node.NodeType), node.ITSNodeID,
                node.Maker, node.UpdateDate, node.Version, node.Remark,
                node.HistType, node.HistRemark, str(node.GpsInfo.Lat),
                str(node.GpsInfo.Long), str(node.GpsInfo.Alt), str(node.UtmInfo.Easting),
                str(node.UtmInfo.Northing), node.UtmInfo.Zone
            ]
            for col, val in enumerate(vals):
                self.node_table.setItem(row, col, QTableWidgetItem(val))

    def populate_link_table(self):
        self.link_table.setRowCount(len(self.links))
        for row, link in enumerate(self.links):
            vals = [
                link.ID, link.AdminCode, str(link.RoadRank), str(link.RoadType),
                link.RoadNo, str(link.LinkType), str(link.LaneNo), link.R_LinkID,
                link.L_LinkID, link.FromNodeID, link.ToNodeID, link.SectionID,
                str(link.Length), link.ITSLinkID, link.Maker, link.UpdateDate,
                link.Version, link.Remark, link.HistType, link.HistRemark
            ]
            for col, val in enumerate(vals):
                self.link_table.setItem(row, col, QTableWidgetItem(val))

    def find_closest_node(self, lon, lat):
        closest, min_dist = None, float('inf')
        for node in self.nodes:
            d = math.sqrt((lon - node.GpsInfo.Long)**2 + (lat - node.GpsInfo.Lat)**2)
            if d < min_dist:
                min_dist, closest = d, node
        return closest
    
    def find_closest_link(self, px, py):
        if not self.links:
            return None
        node_dict = {node.ID: node for node in self.nodes}
        def pt_seg_dist(px, py, ax, ay, bx, by):
            ab_sq = (bx - ax)**2 + (by - ay)**2
            if ab_sq == 0:
                return math.sqrt((px - ax)**2 + (py - ay)**2)
            t = ((px - ax)*(bx - ax) + (py - ay)*(by - ay)) / ab_sq
            if t < 0:
                return math.sqrt((px - ax)**2 + (py - ay)**2)
            elif t > 1:
                return math.sqrt((px - bx)**2 + (py - by)**2)
            projx, projy = ax + t * (bx - ax), ay + t * (by - ay)
            return math.sqrt((px - projx)**2 + (py - projy)**2)
        closest, min_dist = None, float('inf')
        for link in self.links:
            a = node_dict.get(link.FromNodeID)
            b = node_dict.get(link.ToNodeID)
            if not (a and b):
                continue
            d = pt_seg_dist(px, py, a.GpsInfo.Long, a.GpsInfo.Lat, b.GpsInfo.Long, b.GpsInfo.Lat)
            if d < min_dist:
                min_dist, closest = d, link
        return closest
    
    def set_from_node(self):
        if not self.selected_node:
            QMessageBox.warning(self, "No Node Selected", "먼저 Node를 선택해주세요.")
            return
        self.link_form.from_node_id_field.setText(self.selected_node.ID)

    def set_to_node(self):
        if not self.selected_node:
            QMessageBox.warning(self, "No Node Selected", "먼저 Node를 선택해주세요.")
            return
        self.link_form.to_node_id_field.setText(self.selected_node.ID)

def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
    
if __name__ == "__main__":
    main()
