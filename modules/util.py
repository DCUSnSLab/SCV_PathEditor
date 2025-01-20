from modules.model import *
from dataclasses import fields

def get_column_headers(model_class):
    model_fields = fields(model_class)
    column_headers = []
    for field in model_fields:
        if field.type in [GpsInfo, UtmInfo]:
            nested_fields = fields(field.type)
            for nested_field in nested_fields:
                column_headers.append(nested_field.name)
        else:
            column_headers.append(field.name)
    return column_headers

def json_to_links(json_data):
    """JSON 데이터를 Link 객체 리스트로 변환."""
    links = []
    for link_data in json_data["Link"]:
        link = Link(
            ID=link_data["ID"],
            AdminCode=link_data["AdminCode"],
            RoadRank=link_data["RoadRank"],
            RoadType=link_data["RoadType"],
            RoadNo=link_data["RoadNo"],
            LinkType=link_data["LinkType"],
            LaneNo=link_data["LaneNo"],
            R_LinkID=link_data["R_LinkID"],
            L_LinkID=link_data["L_LinkID"],
            FromNodeID=link_data["FromNodeID"],
            ToNodeID=link_data["ToNodeID"],
            SectionID=link_data["SectionID"],
            Length=link_data["Length"],
            ITSLinkID=link_data["ITSLinkID"],
            Maker=link_data["Maker"],
            UpdateDate=link_data["UpdateDate"],
            Version=link_data["Version"],
            Remark=link_data["Remark"],
            HistType=link_data["HistType"],
            HistRemark=link_data["HistRemark"]
        )
        links.append(link)
    return links

def json_to_nodes(json_data):
    """JSON 데이터를 Node 객체 리스트로 변환."""
    nodes = []
    for node_data in json_data["Node"]:
        gps_info = GpsInfo(**node_data["GpsInfo"])
        utm_info = UtmInfo(**node_data["UtmInfo"])
        node = Node(
            ID=node_data["ID"],
            AdminCode=node_data["AdminCode"],
            NodeType=node_data["NodeType"],
            ITSNodeID=node_data["ITSNodeID"],
            Maker=node_data["Maker"],
            UpdateDate=node_data["UpdateDate"],
            Version=node_data["Version"],
            Remark=node_data["Remark"],
            HistType=node_data["HistType"],
            HistRemark=node_data["HistRemark"],
            GpsInfo=gps_info,
            UtmInfo=utm_info,
        )
        nodes.append(node)
    return nodes
