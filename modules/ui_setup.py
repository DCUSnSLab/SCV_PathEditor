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
    ls_layout = QHBoxLayout()
    mw.load_button = QPushButton("Load")
    mw.load_button.clicked.connect(mw.load_file)
    ls_layout.addWidget(mw.load_button)
    mw.save_button = QPushButton("Save")
    mw.save_button.clicked.connect(mw.save_file)
    ls_layout.addWidget(mw.save_button)
    mw.left_layout.addLayout(ls_layout)
    
    mw.link_add_mode_button = QPushButton("Link add mode")
    mw.link_add_mode_button.clicked.connect(mw.toggle_link_add_mode)
    mw.left_layout.addWidget(mw.link_add_mode_button)
    
    mw.link_form = LinkAddForm(mw)
    mw.link_form.setVisible(False)
    mw.left_layout.addWidget(mw.link_form)
    mw.link_form.from_node_set_button.clicked.connect(mw.set_from_node)
    mw.link_form.to_node_set_button.clicked.connect(mw.set_to_node)
    
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
    
    mw.main_layout.addLayout(mw.left_layout, 2)
    
    mw.right_layout = QVBoxLayout()
    btn_layout = QHBoxLayout()
    mw.node_select_button = QPushButton("Node select")
    mw.node_select_button.clicked.connect(mw.enable_node_select_mode)
    mw.link_select_button = QPushButton("Link select")
    mw.link_select_button.clicked.connect(mw.enable_link_select_mode)
    btn_layout.addWidget(mw.node_select_button)
    btn_layout.addWidget(mw.link_select_button)
    for _ in range(3):
        btn_layout.addWidget(QPushButton("dump"))
    mw.right_layout.addLayout(btn_layout)
    
    txt_layout = QHBoxLayout()
    mw.text_field_1 = QLineEdit(); mw.text_field_1.setReadOnly(True)
    mw.text_field_2 = QLineEdit(); mw.text_field_2.setReadOnly(True)
    mw.text_field_3 = QLineEdit(); mw.text_field_3.setReadOnly(True)
    mw.text_field_4 = QLineEdit(); mw.text_field_4.setReadOnly(True)
    mw.text_field_5 = QLineEdit(); mw.text_field_5.setReadOnly(True)
    for tf in [mw.text_field_1, mw.text_field_2, mw.text_field_3, mw.text_field_4, mw.text_field_5]:
        txt_layout.addWidget(tf)
    mw.right_layout.addLayout(txt_layout)
    
    mw.map_view = QWebEngineView()
    mw.right_layout.addWidget(mw.map_view)
    mw.main_layout.addLayout(mw.right_layout, 3)
