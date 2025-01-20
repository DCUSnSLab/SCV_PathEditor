import sys
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QPushButton, QVBoxLayout,
    QWidget, QFileDialog, QLabel, QMessageBox, QHBoxLayout,
    QTableWidget, QTableWidgetItem, QLineEdit
)
from map_canvas import MapCanvas
from matplotlib.backends.backend_qt5agg import NavigationToolbar2QT as NavigationToolbar

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("GPS Points Visualizer")
        self.setGeometry(100, 100, 1200, 800)

        # 중앙 위젯 설정
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)

        # 메인 레이아웃 (수평)
        self.main_layout = QHBoxLayout()
        self.central_widget.setLayout(self.main_layout)

        # 왼쪽 레이아웃 (버튼 및 정보)
        self.left_layout = QVBoxLayout()

        # CSV 로드 버튼
        self.load_button = QPushButton("CSV 파일 로드")
        self.load_button.clicked.connect(self.load_csv)
        self.left_layout.addWidget(self.load_button)

        # 포인트 제거 버튼
        self.delete_button = QPushButton("선택된 포인트 제거")
        self.delete_button.clicked.connect(self.delete_points)
        self.left_layout.addWidget(self.delete_button)

        # 포인트 추가 버튼
        self.add_button = QPushButton("포인트 추가")
        self.add_button.clicked.connect(self.enable_add_point)
        self.left_layout.addWidget(self.add_button)

        # 포인트 추가 모드 종료 버튼
        self.cancel_add_button = QPushButton("포인트 추가 모드 종료")
        self.cancel_add_button.clicked.connect(self.disable_add_point)
        self.left_layout.addWidget(self.cancel_add_button)

        # 포인트 간격 채우기 버튼
        self.fill_button = QPushButton("포인트 간격 채우기")
        self.fill_button.clicked.connect(self.enable_fill_points)
        self.left_layout.addWidget(self.fill_button)

        # 변경된 데이터 저장 버튼
        self.save_button = QPushButton("변경된 데이터 저장")
        self.save_button.clicked.connect(self.save_csv)
        self.left_layout.addWidget(self.save_button)

        ### 변경됨: cm 입력창 및 방향 버튼 추가
        # 이동 거리 입력창
        self.distance_input = QLineEdit()
        self.distance_input.setPlaceholderText("이동 거리 (cm)")
        self.left_layout.addWidget(self.distance_input)

        # 방향 버튼 레이아웃
        self.direction_layout = QHBoxLayout()

        # 전체 선택 버튼 추가
        self.select_all_button = QPushButton("전체 선택")
        self.select_all_button.clicked.connect(self.select_all_points)
        self.direction_layout.addWidget(self.select_all_button)

        # 동쪽 이동 버튼
        self.east_button = QPushButton("동")
        self.east_button.clicked.connect(lambda: self.move_points('east'))
        self.direction_layout.addWidget(self.east_button)

        # 서쪽 이동 버튼
        self.west_button = QPushButton("서")
        self.west_button.clicked.connect(lambda: self.move_points('west'))
        self.direction_layout.addWidget(self.west_button)

        # 남쪽 이동 버튼
        self.south_button = QPushButton("남")
        self.south_button.clicked.connect(lambda: self.move_points('south'))
        self.direction_layout.addWidget(self.south_button)

        # 북쪽 이동 버튼
        self.north_button = QPushButton("북")
        self.north_button.clicked.connect(lambda: self.move_points('north'))
        self.direction_layout.addWidget(self.north_button)

        # 방향 버튼 레이아웃 추가
        self.left_layout.addLayout(self.direction_layout)
        ### 변경됨 끝

        # 정보 레이블
        self.info_label = QLabel("지도에서 클릭하면 해당 위치의 경도와 위도가 표시됩니다. 포인트를 추가하려면 '포인트 추가' 버튼을 누르세요.")
        self.info_label.setWordWrap(True)
        self.info_label.setStyleSheet("font-size: 14px;")
        self.left_layout.addWidget(self.info_label)

        # 클릭한 위치의 경도, 위도 표시 레이블
        self.coordinates_label = QLabel("경도: N/A, 위도: N/A")
        self.coordinates_label.setStyleSheet("font-size: 14px; font-weight: bold;")
        self.left_layout.addWidget(self.coordinates_label)

        # 포인트 인덱스 표시 레이블
        self.point_index_label = QLabel("포인트 인덱스: N/A")
        self.point_index_label.setStyleSheet("font-size: 14px; font-weight: bold;")
        self.left_layout.addWidget(self.point_index_label)

        # 포인트 테이블
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(['Longitude', 'Latitude', 'UTM Easting', 'UTM Northing', 'UTM Zone'])
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.selectionModel().selectionChanged.connect(self.on_table_selection)  # 테이블 선택 이벤트 연결
        self.left_layout.addWidget(self.table)

        # 왼쪽 레이아웃 추가
        self.main_layout.addLayout(self.left_layout, 1)

        # 오른쪽 레이아웃 (지도 및 툴바)
        self.right_layout = QVBoxLayout()

        # 지도 캔버스
        self.canvas = MapCanvas(self, self)  # self를 MapCanvas의 main_window로 전달

        # 네비게이션 툴바
        self.toolbar = NavigationToolbar(self.canvas, self)
        self.right_layout.addWidget(self.toolbar)

        # 캔버스 추가
        self.right_layout.addWidget(self.canvas)

        # 오른쪽 레이아웃 추가
        self.main_layout.addLayout(self.right_layout, 3)

        # 캔버스 클릭 이벤트 연결
        self.canvas.mpl_connect('button_press_event', self.canvas.on_click)

    ### 추가된 부분: 전체 선택 버튼의 슬롯 함수
    def select_all_points(self):
        """
        테이블의 모든 포인트를 선택합니다.
        """
        if self.table.rowCount() == 0:
            QMessageBox.warning(self, "경고", "선택할 포인트가 없습니다.")
            return

        # 모든 행 선택
        self.table.selectAll()

        # 선택된 포인트를 업데이트
        self.canvas.selected_points = list(range(self.table.rowCount()))
        self.canvas.highlight_selected_points()

        QMessageBox.information(self, "전체 선택", f"{self.table.rowCount()}개의 포인트가 선택되었습니다.")

    def load_csv(self):
        file_name, _ = QFileDialog.getOpenFileName(
            self, "JSON file", "", "json Files (*.json);;All Files (*)"
        )
        if file_name:
            self.canvas.load_data(file_name)

    def save_csv(self):
        # CSV 파일로 저장
        file_name, _ = QFileDialog.getSaveFileName(
            self, "CSV 파일로 저장", "", "CSV Files (*.csv);;All Files (*)"
        )
        if file_name:
            # canvas에 있는 데이터를 CSV 파일로 저장
            self.canvas.df.to_csv(file_name, index=False)
            QMessageBox.information(self, "저장 완료", "변경된 데이터를 저장했습니다.")

    def show_coordinates(self, latitude, longitude):
        # 경도와 위도를 레이블에 표시
        self.coordinates_label.setText(f"경도: {longitude:.6f}, 위도: {latitude:.6f}")

    def show_point_index(self, index):
        # 클릭한 포인트의 인덱스를 레이블에 표시
        self.point_index_label.setText(f"포인트 인덱스: {index}")

    def delete_points(self):
        # 선택된 포인트를 삭제
        selected_indices = self.canvas.selected_points.copy()
        if not selected_indices:
            QMessageBox.warning(self, "경고", "삭제할 포인트를 선택하세요.")
            return
        confirm = QMessageBox.question(
            self, "확인", f"{len(selected_indices)}개의 포인트를 제거하시겠습니까?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if confirm == QMessageBox.StandardButton.Yes:
            self.canvas.remove_selected_points()

    def update_table(self, df):
        # 테이블을 새로 고침하여 위도, 경도, UTM 좌표를 표시
        self.table.setRowCount(len(df))
        for i, row in df.iterrows():
            self.table.setItem(i, 0, QTableWidgetItem(str(row['longitude'])))
            self.table.setItem(i, 1, QTableWidgetItem(str(row['latitude'])))
            self.table.setItem(i, 2, QTableWidgetItem(str(row['utm_easting'])))
            self.table.setItem(i, 3, QTableWidgetItem(str(row['utm_northing'])))
            self.table.setItem(i, 4, QTableWidgetItem(str(row['utm_zone_number'])))
        self.table.resizeColumnsToContents()

    def on_table_selection(self):
        # 테이블에서 선택된 포인트를 지도에 강조
        selected_rows = self.table.selectionModel().selectedRows()
        selected_indices = [index.row() for index in selected_rows]
        self.canvas.selected_points = selected_indices  # 선택된 포인트를 업데이트
        self.canvas.highlight_selected_points()  # 선택된 포인트를 빨간색으로 강조

    def enable_add_point(self):
        # 포인트 추가 모드를 활성화
        self.canvas.is_adding_point = True
        QMessageBox.information(self, "포인트 추가", "지도에서 포인트를 추가하려면 클릭하세요.")
    
    def disable_add_point(self):
        # 포인트 추가 모드를 비활성화
        self.canvas.is_adding_point = False
        QMessageBox.information(self, "포인트 추가 모드 종료", "포인트 추가 모드가 종료되었습니다.")

    def enable_fill_points(self):
        # 포인트 간격 채우기 모드를 활성화
        self.canvas.fill_points_mode = True
        self.canvas.fill_points = []
        QMessageBox.information(self, "포인트 간격 채우기", "지도에서 두 점을 클릭하여 포인트를 채우세요.")

    def move_points(self, direction):
        # 이동 거리 가져오기
        distance_cm_text = self.distance_input.text()
        try:
            distance_cm = float(distance_cm_text)
        except ValueError:
            QMessageBox.warning(self, "경고", "유효한 이동 거리(cm)를 입력하세요.")
            return

        # 포인트 이동 함수 호출
        self.canvas.move_points(direction, distance_cm)
    ### 변경됨 끝

def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())