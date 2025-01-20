import sys
import os
import json
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QPushButton, QVBoxLayout,
    QWidget, QFileDialog, QLabel, QMessageBox, QHBoxLayout,
    QTableWidget, QTableWidgetItem, QLineEdit
)
from PyQt6.QtCore import QUrl
from modules.ui_setup import setup_ui
from modules.model import *
from modules.map_viewer import MapCanvas
from matplotlib.backends.backend_qt5agg import NavigationToolbar2QT as NavigationToolbar
from modules.util import json_to_links, json_to_nodes

class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.nodes = []
        self.links = []
        setup_ui(self)
    
    def load_file(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        default_path = os.path.join(base_dir, '..', 'data', 'path')

        if not os.path.exists(default_path):
            os.makedirs(default_path)

        file_name, _ = QFileDialog.getOpenFileName(
            self,
            "JSON 파일 열기",
            default_path,
            "JSON Files (*.json);;All Files (*)"
        )
        if file_name:
            with open(file_name, 'r', encoding='utf-8') as file:
                json_data = json.load(file)

            self.nodes = json_to_nodes(json_data)
            self.links = json_to_links(json_data)

            self.populate_node_table()
            self.populate_link_table()
            self.display_map()
            
    def save_file(self):
        print("save")

    def display_map(self):
        if not self.nodes:
            QMessageBox.warning(self, "경고", "표시할 Node 데이터가 없습니다.")
            return
    
        # 오른쪽 레이아웃 초기화 (기존 위젯 제거)
        for i in reversed(range(self.right_layout.count())):
            widget = self.right_layout.itemAt(i).widget()
            if widget:
                widget.setParent(None)
    
        # MapCanvas 생성 (nodes와 links 전달)
        map_canvas = MapCanvas(self.nodes, self.links)
    
        # NavigationToolbar 생성 및 추가
        toolbar = NavigationToolbar(map_canvas, self)
    
        # 오른쪽 레이아웃에 추가
        self.right_layout.addWidget(toolbar)
        self.right_layout.addWidget(map_canvas)

    def populate_node_table(self):
        self.node_table.setRowCount(len(self.nodes))
        for row, node in enumerate(self.nodes):
            self.node_table.setItem(row, 0, QTableWidgetItem(node.ID))
            self.node_table.setItem(row, 1, QTableWidgetItem(node.AdminCode))
            self.node_table.setItem(row, 2, QTableWidgetItem(str(node.NodeType)))
            self.node_table.setItem(row, 3, QTableWidgetItem(node.ITSNodeID))
            self.node_table.setItem(row, 4, QTableWidgetItem(node.Maker))
            self.node_table.setItem(row, 5, QTableWidgetItem(node.UpdateDate))
            self.node_table.setItem(row, 6, QTableWidgetItem(node.Version))
            self.node_table.setItem(row, 7, QTableWidgetItem(node.Remark))
            self.node_table.setItem(row, 8, QTableWidgetItem(node.HistType))
            self.node_table.setItem(row, 9, QTableWidgetItem(node.HistRemark))
            self.node_table.setItem(row, 10, QTableWidgetItem(str(node.GpsInfo.Lat)))
            self.node_table.setItem(row, 11, QTableWidgetItem(str(node.GpsInfo.Long)))
            self.node_table.setItem(row, 12, QTableWidgetItem(str(node.GpsInfo.Alt)))
            self.node_table.setItem(row, 13, QTableWidgetItem(str(node.UtmInfo.Easting)))
            self.node_table.setItem(row, 14, QTableWidgetItem(str(node.UtmInfo.Northing)))
            self.node_table.setItem(row, 15, QTableWidgetItem(node.UtmInfo.Zone))

    def populate_link_table(self):
        self.link_table.setRowCount(len(self.links))
        for row, link in enumerate(self.links):
            self.link_table.setItem(row, 0, QTableWidgetItem(link.ID))
            self.link_table.setItem(row, 1, QTableWidgetItem(link.AdminCode))
            self.link_table.setItem(row, 2, QTableWidgetItem(str(link.RoadRank)))
            self.link_table.setItem(row, 3, QTableWidgetItem(str(link.RoadType)))
            self.link_table.setItem(row, 4, QTableWidgetItem(link.RoadNo))
            self.link_table.setItem(row, 5, QTableWidgetItem(str(link.LinkType)))
            self.link_table.setItem(row, 6, QTableWidgetItem(str(link.LaneNo)))
            self.link_table.setItem(row, 7, QTableWidgetItem(link.R_LinkID))
            self.link_table.setItem(row, 8, QTableWidgetItem(link.L_LinkID))
            self.link_table.setItem(row, 9, QTableWidgetItem(link.FromNodeID))
            self.link_table.setItem(row, 10, QTableWidgetItem(link.ToNodeID))
            self.link_table.setItem(row, 11, QTableWidgetItem(link.SectionID))
            self.link_table.setItem(row, 12, QTableWidgetItem(str(link.Length)))
            self.link_table.setItem(row, 13, QTableWidgetItem(link.ITSLinkID))
            self.link_table.setItem(row, 14, QTableWidgetItem(link.Maker))
            self.link_table.setItem(row, 15, QTableWidgetItem(link.UpdateDate))
            self.link_table.setItem(row, 16, QTableWidgetItem(link.Version))
            self.link_table.setItem(row, 17, QTableWidgetItem(link.Remark))
            self.link_table.setItem(row, 18, QTableWidgetItem(link.HistType))
            self.link_table.setItem(row, 19, QTableWidgetItem(link.HistRemark))


def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())