import sys, os, json, math
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QPushButton, QVBoxLayout, QWidget,
    QFileDialog, QLabel, QMessageBox, QHBoxLayout, QTableWidget, QTableWidgetItem, QLineEdit
)
from PyQt5.QtCore import QUrl
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
        self.node_drag_mode = False  # 드래그 모드 상태
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
        
    def update_nodes_from_table(self):
        # 테이블에서 수정된 Node 데이터를 self.nodes에 반영
        for row in range(self.node_table.rowCount()):
            # 해당 행의 노드 ID 찾기
            node_id = self.node_table.item(row, 0).text()
            # 해당 ID를 가진 노드 찾기
            node = next((n for n in self.nodes if n.ID == node_id), None)
            if not node:
                continue
            
            # 노드 속성 업데이트
            node.AdminCode = self.node_table.item(row, 1).text()
            node.NodeType = int(self.node_table.item(row, 2).text())
            node.ITSNodeID = self.node_table.item(row, 3).text()
            node.Maker = self.node_table.item(row, 4).text()
            node.UpdateDate = self.node_table.item(row, 5).text()
            node.Version = self.node_table.item(row, 6).text()
            node.Remark = self.node_table.item(row, 7).text()
            node.HistType = self.node_table.item(row, 8).text()
            node.HistRemark = self.node_table.item(row, 9).text()
            
            # GpsInfo 업데이트
            node.GpsInfo.Lat = float(self.node_table.item(row, 10).text())
            node.GpsInfo.Long = float(self.node_table.item(row, 11).text())
            node.GpsInfo.Alt = float(self.node_table.item(row, 12).text())
            
            # UtmInfo 업데이트
            node.UtmInfo.Easting = float(self.node_table.item(row, 13).text())
            node.UtmInfo.Northing = float(self.node_table.item(row, 14).text())
            node.UtmInfo.Zone = self.node_table.item(row, 15).text()
    
    def update_links_from_table(self):
        # 테이블에서 수정된 Link 데이터를 self.links에 반영
        for row in range(self.link_table.rowCount()):
            # 해당 행의 링크 ID 찾기
            link_id = self.link_table.item(row, 0).text()
            # 해당 ID를 가진 링크 찾기
            link = next((l for l in self.links if l.ID == link_id), None)
            if not link:
                continue
            
            # 링크 속성 업데이트
            link.AdminCode = self.link_table.item(row, 1).text()
            link.RoadRank = int(self.link_table.item(row, 2).text())
            link.RoadType = int(self.link_table.item(row, 3).text())
            link.RoadNo = self.link_table.item(row, 4).text()
            link.LinkType = int(self.link_table.item(row, 5).text())
            link.LaneNo = int(self.link_table.item(row, 6).text())
            link.R_LinkID = self.link_table.item(row, 7).text()
            link.L_LinkID = self.link_table.item(row, 8).text()
            link.FromNodeID = self.link_table.item(row, 9).text()
            link.ToNodeID = self.link_table.item(row, 10).text()
            link.SectionID = self.link_table.item(row, 11).text()
            link.Length = float(self.link_table.item(row, 12).text())
            link.ITSLinkID = self.link_table.item(row, 13).text()
            link.Maker = self.link_table.item(row, 14).text()
            link.UpdateDate = self.link_table.item(row, 15).text()
            link.Version = self.link_table.item(row, 16).text()
            link.Remark = self.link_table.item(row, 17).text()
            link.HistType = self.link_table.item(row, 18).text()
            link.HistRemark = self.link_table.item(row, 19).text()
    
    def save_file(self):
        # 테이블에서 수정된 데이터를 업데이트
        try:
            self.update_nodes_from_table()
            self.update_links_from_table()
        except Exception as e:
            QMessageBox.warning(self, "데이터 업데이트 오류", f"테이블 데이터를 업데이트하는 중 오류가 발생했습니다:\n{e}")
            return
            
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
        """노드 선택 모드 토글"""
        self.link_select_mode = False
        self.node_drag_mode = False
        self.node_select_mode = not self.node_select_mode
        
        # 지도 캔버스의 드래그 모드 비활성화
        if hasattr(self, 'map_canvas'):
            self.map_canvas.enable_drag_mode(False)
        
        msg = "Node 선택 모드 시작" if self.node_select_mode else "Node 선택 모드 종료"
        QMessageBox.information(self, "Node Select", msg)

    def enable_link_select_mode(self):
        """링크 선택 모드 토글"""
        self.node_select_mode = False
        self.node_drag_mode = False
        self.link_select_mode = not self.link_select_mode
        
        # 지도 캔버스의 드래그 모드 비활성화
        if hasattr(self, 'map_canvas'):
            self.map_canvas.enable_drag_mode(False)
            
        msg = "Link 선택 모드 시작" if self.link_select_mode else "Link 선택 모드 종료"
        QMessageBox.information(self, "Link Select", msg)
    
    def enable_node_drag_mode(self):
        """노드 드래그 모드 토글"""
        self.node_select_mode = False
        self.link_select_mode = False
        self.node_drag_mode = not self.node_drag_mode
        
        # 지도 캔버스의 드래그 모드 설정
        if hasattr(self, 'map_canvas'):
            self.map_canvas.enable_drag_mode(self.node_drag_mode)
        
        if self.node_drag_mode:
            msg = "노드 드래그 모드 시작\n노드를 클릭하고 드래그하여 위치를 변경할 수 있습니다."
        else:
            msg = "노드 드래그 모드 종료"
        
        QMessageBox.information(self, "Node Drag", msg)
    
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
        
        # 지도 캔버스 생성
        self.map_canvas = MapCanvas(self.nodes, self.links)
        self.map_canvas.connect_map_click_event(self.on_map_click)
        self.map_canvas.connect_drag_callback(self.on_node_dragged)
        
        toolbar = NavigationToolbar(self.map_canvas, self)
        self.right_layout.addWidget(toolbar)
        self.right_layout.addWidget(self.map_canvas)

    def on_map_click(self, event):
        """지도 클릭 이벤트 처리"""
        if not self.node_select_mode or event.xdata is None or event.ydata is None:
            return
        lon, lat = event.xdata, event.ydata
        closest = self.find_closest_node(lon, lat)
        if closest:
            self.selected_node = closest
            self.text_field_1.setText(closest.ID)
            self.node_select_mode = False
    
    def on_node_dragged(self, node):
        """노드 드래그 완료 시 호출되는 콜백"""
        print(f"노드 {node.ID} 위치 변경됨: ({node.GpsInfo.Lat}, {node.GpsInfo.Long})")
        
        # 테이블 업데이트
        self.update_node_in_table(node)
        
        # 연결된 링크들의 길이 재계산
        self.recalculate_link_lengths(node)
    
    def update_node_in_table(self, node):
        """특정 노드의 테이블 데이터 업데이트"""
        for row in range(self.node_table.rowCount()):
            if self.node_table.item(row, 0).text() == node.ID:
                # GPS 좌표 업데이트
                self.node_table.setItem(row, 10, QTableWidgetItem(str(node.GpsInfo.Lat)))
                self.node_table.setItem(row, 11, QTableWidgetItem(str(node.GpsInfo.Long)))
                self.node_table.setItem(row, 12, QTableWidgetItem(str(node.GpsInfo.Alt)))
                
                # UTM 좌표 업데이트
                self.node_table.setItem(row, 13, QTableWidgetItem(str(node.UtmInfo.Easting)))
                self.node_table.setItem(row, 14, QTableWidgetItem(str(node.UtmInfo.Northing)))
                self.node_table.setItem(row, 15, QTableWidgetItem(node.UtmInfo.Zone))
                break
    
    def recalculate_link_lengths(self, node):
        """노드 위치 변경 시 연결된 링크들의 길이 재계산"""
        updated_links = []
        
        for i, link in enumerate(self.links):
            if link.FromNodeID == node.ID or link.ToNodeID == node.ID:
                # 연결된 노드들 찾기
                from_node = next((n for n in self.nodes if n.ID == link.FromNodeID), None)
                to_node = next((n for n in self.nodes if n.ID == link.ToNodeID), None)
                
                if from_node and to_node:
                    # UTM 좌표를 사용하여 거리 계산
                    ex1, ny1 = from_node.UtmInfo.Easting, from_node.UtmInfo.Northing
                    ex2, ny2 = to_node.UtmInfo.Easting, to_node.UtmInfo.Northing
                    dist_m = math.sqrt((ex1 - ex2) ** 2 + (ny1 - ny2) ** 2)
                    new_length = round(dist_m / 1000.0, 5)  # km 단위
                    
                    # 링크 길이 업데이트
                    link.Length = new_length
                    updated_links.append((i, link))
        
        # 링크 테이블 업데이트
        for link_index, link in updated_links:
            for row in range(self.link_table.rowCount()):
                if self.link_table.item(row, 0).text() == link.ID:
                    self.link_table.setItem(row, 12, QTableWidgetItem(str(link.Length)))
                    break
        
        if updated_links:
            print(f"노드 {node.ID}와 연결된 {len(updated_links)}개 링크의 길이가 재계산되었습니다.")

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
    sys.exit(app.exec_())
    
if __name__ == "__main__":
    main()
