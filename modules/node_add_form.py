import json
from datetime import datetime
from PyQt5.QtWidgets import (
    QWidget, QLabel, QLineEdit, QFormLayout, QHBoxLayout,
    QPushButton, QMessageBox, QTableWidgetItem, QSpinBox, QTextEdit
)
from PyQt5.QtCore import Qt

class NodeAddForm(QWidget):
    def __init__(self, main_window, parent=None):
        super().__init__(parent)  # parent를 None으로 설정하여 별도 창으로 만들기
        self.main_window = main_window
        self.setWindowTitle("노드 추가")
        self.setGeometry(300, 300, 400, 600)  # 창 크기 설정
        # 별도 창으로 설정
        self.setWindowFlags(Qt.Window | Qt.WindowCloseButtonHint | Qt.WindowMinimizeButtonHint)
        self.main_layout = QFormLayout(self)
        
        # 클릭된 위치 좌표 저장
        self.clicked_lon = 0.0
        self.clicked_lat = 0.0
        
        # 기본 데이터 설정
        today = datetime.now().strftime("%Y%m%d")
        self.default_data = {
            "AdminCode": "110",
            "NodeType": 1,
            "Maker": "한국도로공사",
            "UpdateDate": today,
            "Version": "2021",
            "Remark": "새로 추가된 노드",
            "HistType": "01A",
            "HistRemark": "노드 신규 추가",
            "Alt": 0.0
        }
        
        # 폼 필드 생성
        self.field_editors = {}
        
        # ID 필드 (자동 생성, 읽기 전용)
        self.id_field = QLineEdit()
        self.id_field.setReadOnly(True)
        self.id_field.setPlaceholderText("자동 생성됩니다")
        self.main_layout.addRow(QLabel("ID"), self.id_field)
        
        # AdminCode
        self.admin_code_field = QLineEdit(self.default_data["AdminCode"])
        self.field_editors["AdminCode"] = self.admin_code_field
        self.main_layout.addRow(QLabel("AdminCode"), self.admin_code_field)
        
        # NodeType (SpinBox 사용)
        self.node_type_field = QSpinBox()
        self.node_type_field.setRange(1, 999)
        self.node_type_field.setValue(self.default_data["NodeType"])
        self.field_editors["NodeType"] = self.node_type_field
        self.main_layout.addRow(QLabel("NodeType"), self.node_type_field)
        
        # ITSNodeID
        self.its_node_id_field = QLineEdit()
        self.its_node_id_field.setPlaceholderText("자동 생성됩니다")
        self.field_editors["ITSNodeID"] = self.its_node_id_field
        self.main_layout.addRow(QLabel("ITSNodeID"), self.its_node_id_field)
        
        # 기본 정보 필드들
        for name, val in [("Maker", self.default_data["Maker"]),
                         ("UpdateDate", self.default_data["UpdateDate"]),
                         ("Version", self.default_data["Version"])]:
            le = QLineEdit(str(val))
            self.field_editors[name] = le
            self.main_layout.addRow(QLabel(name), le)
        
        # Remark (TextEdit 사용)
        self.remark_field = QTextEdit()
        self.remark_field.setMaximumHeight(60)
        self.remark_field.setPlainText(self.default_data["Remark"])
        self.field_editors["Remark"] = self.remark_field
        self.main_layout.addRow(QLabel("Remark"), self.remark_field)
        
        # HistType, HistRemark
        for name, val in [("HistType", self.default_data["HistType"]),
                         ("HistRemark", self.default_data["HistRemark"])]:
            le = QLineEdit(str(val))
            self.field_editors[name] = le
            self.main_layout.addRow(QLabel(name), le)
        
        # 좌표 정보 (읽기 전용)
        coord_layout = QHBoxLayout()
        self.lat_field = QLineEdit()
        self.lat_field.setReadOnly(True)
        self.lat_field.setPlaceholderText("위도")
        self.lon_field = QLineEdit()
        self.lon_field.setReadOnly(True)
        self.lon_field.setPlaceholderText("경도")
        coord_layout.addWidget(QLabel("위도:"))
        coord_layout.addWidget(self.lat_field)
        coord_layout.addWidget(QLabel("경도:"))
        coord_layout.addWidget(self.lon_field)
        self.main_layout.addRow(QLabel("GPS 좌표"), coord_layout)
        
        # 고도
        self.alt_field = QLineEdit(str(self.default_data["Alt"]))
        self.field_editors["Alt"] = self.alt_field
        self.main_layout.addRow(QLabel("고도 (Alt)"), self.alt_field)
        
        # 버튼 레이아웃
        button_layout = QHBoxLayout()
        
        # 추가 버튼
        self.add_button = QPushButton("Add Node")
        self.add_button.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                font-weight: bold;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
            QPushButton:pressed {
                background-color: #1565C0;
            }
        """)
        self.add_button.clicked.connect(self.on_add_clicked)
        button_layout.addWidget(self.add_button)
        
        # 취소 버튼
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.hide)
        button_layout.addWidget(self.cancel_button)
        
        self.main_layout.addRow(button_layout)
        self.setVisible(False)
    
    def set_coordinates(self, lon, lat):
        """클릭된 위치의 좌표 설정"""
        self.clicked_lon = lon
        self.clicked_lat = lat
        self.lat_field.setText(f"{lat:.8f}")
        self.lon_field.setText(f"{lon:.8f}")
        
        # 자동 ID 생성
        self.generate_node_id()
    
    def generate_node_id(self):
        """새로운 노드 ID 자동 생성"""
        existing_ids = {node.ID for node in self.main_window.nodes}
        
        # N + 숫자 형태로 ID 생성
        counter = 1
        while True:
            new_id = f"N{counter:03d}"  # N001, N002, ... 형태
            if new_id not in existing_ids:
                self.id_field.setText(new_id)
                # ITSNodeID도 자동 생성
                self.its_node_id_field.setText(f"ITS_{new_id}")
                break
            counter += 1
    
    def get_node_data(self):
        """폼에서 노드 데이터 수집"""
        data = {
            "ID": self.id_field.text(),
            "AdminCode": self.admin_code_field.text(),
            "NodeType": self.node_type_field.value(),
            "ITSNodeID": self.its_node_id_field.text(),
            "Maker": self.field_editors["Maker"].text(),
            "UpdateDate": self.field_editors["UpdateDate"].text(),
            "Version": self.field_editors["Version"].text(),
            "Remark": self.remark_field.toPlainText(),
            "HistType": self.field_editors["HistType"].text(),
            "HistRemark": self.field_editors["HistRemark"].text(),
            "GpsInfo": {
                "Lat": self.clicked_lat,
                "Long": self.clicked_lon,
                "Alt": float(self.alt_field.text()) if self.alt_field.text() else 0.0
            }
        }
        
        # UTM 좌표 계산
        try:
            import utm
            utm_x, utm_y, zone_num, zone_letter = utm.from_latlon(self.clicked_lat, self.clicked_lon)
            data["UtmInfo"] = {
                "Easting": utm_x,
                "Northing": utm_y,
                "Zone": f"{zone_num}{zone_letter}"
            }
        except Exception as e:
            print(f"UTM 변환 오류: {e}")
            data["UtmInfo"] = {
                "Easting": 0.0,
                "Northing": 0.0,
                "Zone": "52S"
            }
        
        return data
    
    def on_add_clicked(self):
        """노드 추가 버튼 클릭 처리"""
        try:
            # 필수 필드 검증
            if not self.id_field.text():
                QMessageBox.warning(self, "오류", "노드 ID가 생성되지 않았습니다.")
                return
            
            if self.clicked_lat == 0.0 and self.clicked_lon == 0.0:
                QMessageBox.warning(self, "오류", "지도에서 위치를 선택해주세요.")
                return
            
            # 노드 데이터 수집
            node_data = self.get_node_data()
            
            # 미리보기 메시지
            preview = f"""새 노드가 추가됩니다:

ID: {node_data['ID']}
위치: ({node_data['GpsInfo']['Lat']:.6f}, {node_data['GpsInfo']['Long']:.6f})
타입: {node_data['NodeType']}
비고: {node_data['Remark']}

추가하시겠습니까?"""
            
            reply = QMessageBox.question(self, "노드 추가 확인", preview,
                                       QMessageBox.Yes | QMessageBox.No,
                                       QMessageBox.Yes)
            
            if reply == QMessageBox.Yes:
                # 메인 윈도우에 노드 추가 요청
                self.main_window.add_new_node(node_data)
                self.hide()
                QMessageBox.information(self, "성공", f"노드 {node_data['ID']}가 성공적으로 추가되었습니다!")
        
        except Exception as e:
            QMessageBox.critical(self, "오류", f"노드 추가 중 오류가 발생했습니다:\n{str(e)}")
    
    def reset_form(self):
        """폼 초기화"""
        self.clicked_lon = 0.0
        self.clicked_lat = 0.0
        self.lat_field.clear()
        self.lon_field.clear()
        self.id_field.clear()
        self.its_node_id_field.clear()
        
        # 기본값으로 재설정
        self.admin_code_field.setText(self.default_data["AdminCode"])
        self.node_type_field.setValue(self.default_data["NodeType"])
        self.field_editors["Maker"].setText(self.default_data["Maker"])
        today = datetime.now().strftime("%Y%m%d")
        self.field_editors["UpdateDate"].setText(today)
        self.field_editors["Version"].setText(self.default_data["Version"])
        self.remark_field.setPlainText(self.default_data["Remark"])
        self.field_editors["HistType"].setText(self.default_data["HistType"])
        self.field_editors["HistRemark"].setText(self.default_data["HistRemark"])
        self.alt_field.setText(str(self.default_data["Alt"]))
