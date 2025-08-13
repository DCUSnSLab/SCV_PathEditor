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

def merge_nodes_with_duplicates(existing_nodes, new_nodes):
    """새로운 노드들을 기존 노드들과 병합하면서 중복 ID 처리"""
    existing_node_ids = {node.ID for node in existing_nodes}
    duplicate_nodes = []
    unique_new_nodes = []
    
    for new_node in new_nodes:
        if new_node.ID in existing_node_ids:
            duplicate_nodes.append(new_node)
            print(f"중복 노드 ID 발견, 무시됨: {new_node.ID}")
        else:
            unique_new_nodes.append(new_node)
            existing_node_ids.add(new_node.ID)
    
    # 기존 노드들과 새로운 고유 노드들을 병합
    merged_nodes = existing_nodes + unique_new_nodes
    
    return merged_nodes, duplicate_nodes

def merge_links_with_duplicates(existing_links, new_links, all_nodes):
    """새로운 링크들을 기존 링크들과 병합하면서 중복 ID 처리"""
    existing_link_ids = {link.ID for link in existing_links}
    node_id_set = {node.ID for node in all_nodes}
    duplicate_links = []
    unique_new_links = []
    
    for new_link in new_links:
        if new_link.ID in existing_link_ids:
            duplicate_links.append(new_link)
            print(f"중복 링크 ID 발견, 무시됨: {new_link.ID}")
        else:
            # FromNodeID와 ToNodeID가 존재하는지 확인
            if new_link.FromNodeID in node_id_set and new_link.ToNodeID in node_id_set:
                unique_new_links.append(new_link)
                existing_link_ids.add(new_link.ID)
            else:
                print(f"링크 {new_link.ID}의 참조 노드가 존재하지 않아 무시됨: {new_link.FromNodeID} -> {new_link.ToNodeID}")
                duplicate_links.append(new_link)  # 참조 에러도 중복으로 처리
    
    # 기존 링크들과 새로운 고유 링크들을 병합
    merged_links = existing_links + unique_new_links
    
    return merged_links, duplicate_links

def validate_data_integrity(nodes, links):
    """데이터 무결성 검사"""
    issues = {
        "duplicate_node_ids": [],
        "duplicate_link_ids": [],
        "orphaned_links": [],
        "invalid_references": []
    }
    
    # 노드 ID 중복 검사
    node_ids = [node.ID for node in nodes]
    seen_node_ids = set()
    for node_id in node_ids:
        if node_id in seen_node_ids:
            issues["duplicate_node_ids"].append(node_id)
        else:
            seen_node_ids.add(node_id)
    
    # 링크 ID 중복 검사
    link_ids = [link.ID for link in links]
    seen_link_ids = set()
    for link_id in link_ids:
        if link_id in seen_link_ids:
            issues["duplicate_link_ids"].append(link_id)
        else:
            seen_link_ids.add(link_id)
    
    # 고아 링크 검사 (참조하는 노드가 존재하지 않는 링크)
    node_id_set = set(node_ids)
    for link in links:
        if link.FromNodeID not in node_id_set:
            issues["orphaned_links"].append(f"Link {link.ID}: FromNode {link.FromNodeID} not found")
        if link.ToNodeID not in node_id_set:
            issues["orphaned_links"].append(f"Link {link.ID}: ToNode {link.ToNodeID} not found")
    
    return issues

def json_to_data_with_merge(data, existing_nodes=None, existing_links=None):
    """JSON 데이터를 파싱하면서 기존 데이터와 병합 (중복 처리 포함)"""
    if existing_nodes is None:
        existing_nodes = []
    if existing_links is None:
        existing_links = []
    
    # 새 데이터 파싱
    new_nodes = json_to_nodes(data)
    new_links = json_to_links(data)
    
    # 중복 처리하여 병합
    merged_nodes, duplicate_nodes = merge_nodes_with_duplicates(existing_nodes, new_nodes)
    merged_links, duplicate_links = merge_links_with_duplicates(existing_links, new_links, merged_nodes)
    
    duplicate_info = {
        "duplicate_nodes": [node.ID for node in duplicate_nodes],
        "duplicate_links": [link.ID for link in duplicate_links],
        "total_nodes_processed": len(new_nodes),
        "total_links_processed": len(new_links),
        "nodes_added": len(merged_nodes) - len(existing_nodes),
        "links_added": len(merged_links) - len(existing_links)
    }
    
    return merged_nodes, merged_links, duplicate_info
