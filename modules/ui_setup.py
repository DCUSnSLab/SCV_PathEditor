from PyQt6.QtWidgets import (
    QPushButton, QVBoxLayout, QWidget, QHBoxLayout, QTableWidget, QLabel
)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from modules.model import *
from modules.util import get_column_headers

def setup_ui(main_window):
    main_window.setWindowTitle("Path Editor")
    main_window.setGeometry(100, 100, 1600, 1000)

    # 중앙 위젯 및 레이아웃 설정
    main_window.central_widget = QWidget()
    main_window.setCentralWidget(main_window.central_widget)

    # 메인 레이아웃
    main_window.main_layout = QHBoxLayout()
    main_window.central_widget.setLayout(main_window.main_layout)

    # 왼쪽 레이아웃
    main_window.left_layout = QVBoxLayout()

    # 버튼 레이아웃
    load_save_layout = QHBoxLayout()
    main_window.load_button = QPushButton("Load")
    main_window.load_button.clicked.connect(main_window.load_file)
    load_save_layout.addWidget(main_window.load_button)

    main_window.save_button = QPushButton("Save")
    main_window.save_button.clicked.connect(main_window.save_file)
    load_save_layout.addWidget(main_window.save_button)

    # 버튼 레이아웃 추가
    main_window.left_layout.addLayout(load_save_layout)

    # Node 테이블 추가
    main_window.node_label = QLabel("Node Table")
    main_window.left_layout.addWidget(main_window.node_label)

    main_window.node_table = QTableWidget()
    main_window.node_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
    main_window.node_table.setEditTriggers(
        QTableWidget.EditTrigger.DoubleClicked | QTableWidget.EditTrigger.SelectedClicked
    )
    node_headers = get_column_headers(Node)
    main_window.node_table.setColumnCount(len(node_headers))
    main_window.node_table.setHorizontalHeaderLabels(node_headers)
    main_window.left_layout.addWidget(main_window.node_table)

    # Link 테이블 추가
    main_window.link_label = QLabel("Link Table")
    main_window.left_layout.addWidget(main_window.link_label)

    main_window.link_table = QTableWidget()
    main_window.link_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
    main_window.link_table.setEditTriggers(
        QTableWidget.EditTrigger.DoubleClicked | QTableWidget.EditTrigger.SelectedClicked
    )
    link_headers = get_column_headers(Link)
    main_window.link_table.setColumnCount(len(link_headers))
    main_window.link_table.setHorizontalHeaderLabels(link_headers)
    main_window.left_layout.addWidget(main_window.link_table)

    # 왼쪽 레이아웃을 메인 레이아웃에 추가
    main_window.main_layout.addLayout(main_window.left_layout, 2)

    # 오른쪽 레이아웃
    main_window.right_layout = QVBoxLayout()
    main_window.map_view = QWebEngineView()
    main_window.right_layout.addWidget(main_window.map_view)
    main_window.main_layout.addLayout(main_window.right_layout, 3)