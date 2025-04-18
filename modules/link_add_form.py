import json, random
from math import sqrt
from datetime import datetime
from PyQt5.QtWidgets import (
    QWidget, QLabel, QLineEdit, QFormLayout, QHBoxLayout,
    QPushButton, QMessageBox, QTableWidgetItem
)

class LinkAddForm(QWidget):
    def __init__(self, main_window, parent=None):
        super().__init__(main_window)
        self.main_window = main_window
        self.setWindowTitle("Link Add Form")
        self.main_layout = QFormLayout(self)
        
        today = datetime.now().strftime("%Y%m%d")
        self.default_data = {
            "AdminCode": "110", "RoadRank": "1", "RoadType": "1",
            "RoadNo": "20", "LinkType": "3", "LaneNo": "2",
            "SectionID": "A3_DRIVEWAYSECTION", "Maker": "한국도로공사",
            "UpdateDate": today, "Version": "2021", "Remark": "특이사항 없음",
            "HistType": "02A", "HistRemark": "진출입 도로 변경"
        }
        self.field_editors = {}
        for name, val in self.default_data.items():
            le = QLineEdit(val)
            self.field_editors[name] = le
            self.main_layout.addRow(QLabel(name), le)
        
        self.bottom_layout = QHBoxLayout()
        self.from_node_set_button = QPushButton("From node set")
        self.from_node_id_field = QLineEdit(); self.from_node_id_field.setReadOnly(True)
        self.to_node_set_button = QPushButton("To node set")
        self.to_node_id_field = QLineEdit(); self.to_node_id_field.setReadOnly(True)
        self.bottom_layout.addWidget(self.from_node_set_button)
        self.bottom_layout.addWidget(self.from_node_id_field)
        self.bottom_layout.addWidget(self.to_node_set_button)
        self.bottom_layout.addWidget(self.to_node_id_field)
        self.main_layout.addRow(self.bottom_layout)
        
        self.add_button = QPushButton("Add")
        self.add_button.clicked.connect(self.on_add_clicked)
        self.main_layout.addRow(self.add_button)
        self.setVisible(True)

    def get_link_data(self):
        data = {name: le.text() for name, le in self.field_editors.items()}
        data["FromNodeID"] = self.from_node_id_field.text()
        data["ToNodeID"] = self.to_node_id_field.text()
        return data

    def set_link_data(self, data: dict):
        for name, val in data.items():
            if name in self.field_editors:
                self.field_editors[name].setText(str(val))
        if "FromNodeID" in data:
            self.from_node_id_field.setText(str(data["FromNodeID"]))
        if "ToNodeID" in data:
            self.to_node_id_field.setText(str(data["ToNodeID"]))

    def on_add_clicked(self):
        form_data = self.get_link_data()
        from_node_id = form_data.get("FromNodeID", "")
        to_node_id = form_data.get("ToNodeID", "")
        if not from_node_id or not to_node_id:
            QMessageBox.warning(self, "Error", "From/To NodeID가 없습니다.")
            return

        latest_nodes = self.main_window.nodes
        from_node = next((n for n in latest_nodes if n.ID == from_node_id), None)
        to_node = next((n for n in latest_nodes if n.ID == to_node_id), None)
        if not (from_node and to_node):
            QMessageBox.warning(self, "Error", "해당 From/To Node 객체를 찾을 수 없습니다.")
            return

        ex1, ny1 = from_node.UtmInfo.Easting, from_node.UtmInfo.Northing
        ex2, ny2 = to_node.UtmInfo.Easting, to_node.UtmInfo.Northing
        dist_m = sqrt((ex1 - ex2) ** 2 + (ny1 - ny2) ** 2)
        length_val = round(dist_m / 1000.0, 5)

        from_num = from_node_id[1:] if len(from_node_id) > 1 else from_node_id
        to_num = to_node_id[1:] if len(to_node_id) > 1 else to_node_id
        new_id = "L" + from_num + to_num
        r_link_id = "R_" + from_num
        l_link_id = "L_" + to_num
        its_link_id = "ITS_" + f"{random.getrandbits(32):08x}"

        final_dict = {
            "ID": new_id, "AdminCode": form_data["AdminCode"],
            "RoadRank": int(form_data["RoadRank"]),
            "RoadType": int(form_data["RoadType"]),
            "RoadNo": form_data["RoadNo"],
            "LinkType": int(form_data["LinkType"]),
            "LaneNo": int(form_data["LaneNo"]),
            "R_LinkID": r_link_id, "L_LinkID": l_link_id,
            "FromNodeID": from_node_id, "ToNodeID": to_node_id,
            "SectionID": form_data["SectionID"],
            "Length": length_val, "ITSLinkID": its_link_id,
            "Maker": form_data["Maker"], "UpdateDate": form_data["UpdateDate"],
            "Version": form_data["Version"],
            "Remark": form_data["Remark"],
            "HistType": form_data["HistType"],
            "HistRemark": form_data["HistRemark"]
        }
        QMessageBox.information(self, "New Link Data", json.dumps(final_dict, indent=4, ensure_ascii=False))
        mw = self.main_window
        
        # Link 객체 생성 및 self.links에 추가
        from modules.model import Link
        new_link = Link(
            ID=final_dict["ID"],
            AdminCode=final_dict["AdminCode"],
            RoadRank=final_dict["RoadRank"],
            RoadType=final_dict["RoadType"],
            RoadNo=final_dict["RoadNo"],
            LinkType=final_dict["LinkType"],
            LaneNo=final_dict["LaneNo"],
            R_LinkID=final_dict["R_LinkID"],
            L_LinkID=final_dict["L_LinkID"],
            FromNodeID=final_dict["FromNodeID"],
            ToNodeID=final_dict["ToNodeID"],
            SectionID=final_dict["SectionID"],
            Length=final_dict["Length"],
            ITSLinkID=final_dict["ITSLinkID"],
            Maker=final_dict["Maker"],
            UpdateDate=final_dict["UpdateDate"],
            Version=final_dict["Version"],
            Remark=final_dict["Remark"],
            HistType=final_dict["HistType"],
            HistRemark=final_dict["HistRemark"]
        )
        mw.links.append(new_link)
        
        # 테이블에 추가
        row = mw.link_table.rowCount()
        mw.link_table.insertRow(row)
        cols = [
            final_dict["ID"], final_dict["AdminCode"], str(final_dict["RoadRank"]),
            str(final_dict["RoadType"]), final_dict["RoadNo"], str(final_dict["LinkType"]),
            str(final_dict["LaneNo"]), final_dict["R_LinkID"], final_dict["L_LinkID"],
            final_dict["FromNodeID"], final_dict["ToNodeID"], final_dict["SectionID"],
            str(final_dict["Length"]), final_dict["ITSLinkID"], final_dict["Maker"],
            final_dict["UpdateDate"], final_dict["Version"], final_dict["Remark"],
            final_dict["HistType"], final_dict["HistRemark"]
        ]
        for col, value in enumerate(cols):
            mw.link_table.setItem(row, col, QTableWidgetItem(value))
        
        # 지도에 표시
        mw.add_link_to_map(final_dict)
