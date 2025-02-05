from modules.model import GpsInfo, UtmInfo, Node, Link
from dataclasses import fields

def get_node_by_id(nodes, node_id: str):
    for n in nodes:
        if n.ID == node_id:
            return n
    return None

def get_column_headers(model_class):
    hdrs = []
    for f in fields(model_class):
        if f.type in [GpsInfo, UtmInfo]:
            for nf in fields(f.type):
                hdrs.append(nf.name)
        else:
            hdrs.append(f.name)
    return hdrs

def json_to_links(data):
    links = []
    for ld in data["Link"]:
        links.append(Link(
            ID=ld["ID"],
            AdminCode=ld["AdminCode"],
            RoadRank=ld["RoadRank"],
            RoadType=ld["RoadType"],
            RoadNo=ld["RoadNo"],
            LinkType=ld["LinkType"],
            LaneNo=ld["LaneNo"],
            R_LinkID=ld["R_LinkID"],
            L_LinkID=ld["L_LinkID"],
            FromNodeID=ld["FromNodeID"],
            ToNodeID=ld["ToNodeID"],
            SectionID=ld["SectionID"],
            Length=ld["Length"],
            ITSLinkID=ld["ITSLinkID"],
            Maker=ld["Maker"],
            UpdateDate=ld["UpdateDate"],
            Version=ld["Version"],
            Remark=ld["Remark"],
            HistType=ld["HistType"],
            HistRemark=ld["HistRemark"]
        ))
    return links

def json_to_nodes(data):
    nodes = []
    for nd in data["Node"]:
        gps = GpsInfo(**nd["GpsInfo"])
        utm = UtmInfo(**nd["UtmInfo"])
        nodes.append(Node(
            ID=nd["ID"],
            AdminCode=nd["AdminCode"],
            NodeType=nd["NodeType"],
            ITSNodeID=nd["ITSNodeID"],
            Maker=nd["Maker"],
            UpdateDate=nd["UpdateDate"],
            Version=nd["Version"],
            Remark=nd["Remark"],
            HistType=nd["HistType"],
            HistRemark=nd["HistRemark"],
            GpsInfo=gps,
            UtmInfo=utm
        ))
    return nodes
