from PyQt5.QtWidgets import (
    QPushButton, QVBoxLayout, QWidget, QHBoxLayout, QTableWidget, QLabel, QLineEdit
)
from PyQt5.QtWebEngineWidgets import QWebEngineView
from modules.model import Node, Link
from modules.util import get_column_headers
from modules.link_add_form import LinkAddForm

def setup_ui(mw):
    mw.setWindowTitle("Path Editor")
    mw.setGeometry(100, 100, 1600, 1000)
    mw.central_widget = QWidget()
    mw.setCentralWidget(mw.central_widget)
    mw.main_layout = QHBoxLayout(mw.central_widget)
    
    mw.left_layout = QVBoxLayout()
    
    # Load/Save 버튼 레이아웃
    ls_layout = QHBoxLayout()
    mw.load_button = QPushButton("Load")
    mw.load_button.clicked.connect(mw.load_file)
    ls_layout.addWidget(mw.load_button)
    mw.save_button = QPushButton("Save")
    mw.save_button.clicked.connect(mw.save_file)
    ls_layout.addWidget(mw.save_button)
    mw.left_layout.addLayout(ls_layout)
    
    # Link Add Mode 버튼
    mw.link_add_mode_button = QPushButton("Link add mode")
    mw.link_add_mode_button.clicked.connect(mw.toggle_link_add_mode)
    mw.left_layout.addWidget(mw.link_add_mode_button)
    
    # Link Form (숨겨져 있음)
    mw.link_form = LinkAddForm(mw)
    mw.link_form.setVisible(False)
    mw.left_layout.addWidget(mw.link_form)
    mw.link_form.from_node_set_button.clicked.connect(mw.set_from_node)
    mw.link_form.to_node_set_button.clicked.connect(mw.set_to_node)
    
    # Node 테이블
    mw.node_label = QLabel("Node Table")
    mw.left_layout.addWidget(mw.node_label)
    mw.node_table = QTableWidget()
    mw.node_table.setSelectionBehavior(QTableWidget.SelectRows)
    mw.node_table.setEditTriggers(
        QTableWidget.DoubleClicked | QTableWidget.SelectedClicked
    )
    node_headers = get_column_headers(Node)
    mw.node_table.setColumnCount(len(node_headers))
    mw.node_table.setHorizontalHeaderLabels(node_headers)
    mw.left_layout.addWidget(mw.node_table)
    
    # Link 테이블
    mw.link_label = QLabel("Link Table")
    mw.left_layout.addWidget(mw.link_label)
    mw.link_table = QTableWidget()
    mw.link_table.setSelectionBehavior(QTableWidget.SelectRows)
    mw.link_table.setEditTriggers(
        QTableWidget.DoubleClicked | QTableWidget.SelectedClicked
    )
    link_headers = get_column_headers(Link)
    mw.link_table.setColumnCount(len(link_headers))
    mw.link_table.setHorizontalHeaderLabels(link_headers)
    mw.left_layout.addWidget(mw.link_table)
    
    # 왼쪽 레이아웃을 메인 레이아웃에 추가 (비율 2)
    mw.main_layout.addLayout(mw.left_layout, 2)
    
    # 오른쪽 (지도) 레이아웃
    mw.right_layout = QVBoxLayout()
    
    # 지도 조작 버튼들
    btn_layout = QHBoxLayout()
    
    # Node 선택 버튼
    mw.node_select_button = QPushButton("Node select")
    mw.node_select_button.clicked.connect(mw.enable_node_select_mode)
    btn_layout.addWidget(mw.node_select_button)
    
    # Link 선택 버튼
    mw.link_select_button = QPushButton("Link select")
    mw.link_select_button.clicked.connect(mw.enable_link_select_mode)
    btn_layout.addWidget(mw.link_select_button)
    
    # 새로 추가: Node 드래그 버튼
    mw.node_drag_button = QPushButton("Node drag")
    mw.node_drag_button.setStyleSheet("""
        QPushButton {
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
        }
        QPushButton:hover {
            background-color: #45a049;
        }
        QPushButton:pressed {
            background-color: #3d8b40;
        }
    """)
    mw.node_drag_button.clicked.connect(mw.enable_node_drag_mode)
    btn_layout.addWidget(mw.node_drag_button)
    
    # 더미 버튼들 (기존 코드 유지)
    for i in range(2):  # 3개에서 2개로 줄임 (드래그 버튼이 추가되었으므로)
        dummy_btn = QPushButton(f"Feature {i+1}")
        dummy_btn.setEnabled(False)  # 비활성화
        btn_layout.addWidget(dummy_btn)
    
    mw.right_layout.addLayout(btn_layout)
    
    # 텍스트 필드들
    txt_layout = QHBoxLayout()
    mw.text_field_1 = QLineEdit()
    mw.text_field_1.setReadOnly(True)
    mw.text_field_1.setPlaceholderText("Selected Node ID")
    
    mw.text_field_2 = QLineEdit()
    mw.text_field_2.setReadOnly(True)
    mw.text_field_2.setPlaceholderText("Coordinates")
    
    mw.text_field_3 = QLineEdit()
    mw.text_field_3.setReadOnly(True)
    mw.text_field_3.setPlaceholderText("Status")
    
    mw.text_field_4 = QLineEdit()
    mw.text_field_4.setReadOnly(True)
    mw.text_field_4.setPlaceholderText("Info 1")
    
    mw.text_field_5 = QLineEdit()
    mw.text_field_5.setReadOnly(True)
    mw.text_field_5.setPlaceholderText("Info 2")
    
    for tf in [mw.text_field_1, mw.text_field_2, mw.text_field_3, mw.text_field_4, mw.text_field_5]:
        txt_layout.addWidget(tf)
    
    mw.right_layout.addLayout(txt_layout)
    
    # 지도 뷰 (웹 엔진 뷰 - 실제로는 matplotlib 캔버스로 대체됨)
    mw.map_view = QWebEngineView()
    mw.right_layout.addWidget(mw.map_view)
    
    # 오른쪽 레이아웃을 메인 레이아웃에 추가 (비율 3)
    mw.main_layout.addLayout(mw.right_layout, 3)
