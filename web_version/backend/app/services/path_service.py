import json
import os
import math
import utm
from typing import List, Optional
from datetime import datetime
from ..models.path_models import Node, Link, PathData, NodeCreate, LinkCreate, GpsInfo, UtmInfo


class PathService:
    def __init__(self, data_dir: str = None):
        if data_dir is None:
            # 백엔드에서 상대 경로로 data 디렉토리 찾기
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.data_dir = os.path.join(base_dir, "data", "path")
        else:
            self.data_dir = data_dir
        self.current_nodes: List[Node] = []
        self.current_links: List[Link] = []
    
    def load_path_data(self, filename: str, merge_duplicates: bool = True) -> PathData:
        """JSON 파일에서 경로 데이터 로드"""
        file_path = os.path.join(self.data_dir, filename)
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {filename}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 새로운 노드 및 링크 파싱
        new_nodes = [Node(**node_data) for node_data in data.get("Node", [])]
        new_links = [Link(**link_data) for link_data in data.get("Link", [])]
        
        if merge_duplicates:
            # 기존 개수 저장 (업데이트 전에)
            original_node_count = len(self.current_nodes)
            original_link_count = len(self.current_links)
            
            # 중복 ID 처리하여 기존 데이터와 병합
            merged_nodes, duplicate_nodes = self._merge_nodes_with_duplicates(new_nodes)
            merged_links, duplicate_links = self._merge_links_with_duplicates(new_links, merged_nodes)
            
            # 추가된 개수 계산
            nodes_added = len(merged_nodes) - original_node_count
            links_added = len(merged_links) - original_link_count
            
            self.current_nodes = merged_nodes
            self.current_links = merged_links
            
            # PathData 객체와 중복 정보를 별도로 반환
            path_data = PathData(Node=merged_nodes, Link=merged_links)
            
            duplicate_info = {
                "duplicate_nodes": [node.ID for node in duplicate_nodes],
                "duplicate_links": [link.ID for link in duplicate_links],
                "total_nodes_processed": len(new_nodes),
                "total_links_processed": len(new_links),
                "nodes_added": nodes_added,
                "links_added": links_added
            }
            
            # 결과를 튜플로 반환
            return path_data, duplicate_info
        else:
            # 기존 데이터 완전 교체
            self.current_nodes = new_nodes
            self.current_links = new_links
            return PathData(Node=new_nodes, Link=new_links)
    
    def save_path_data(self, filename: str, path_data: PathData) -> str:
        """경로 데이터를 JSON 파일로 저장"""
        file_path = os.path.join(self.data_dir, filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Pydantic 모델을 dict로 변환
        data = {
            "Node": [node.dict() for node in path_data.Node],
            "Link": [link.dict() for link in path_data.Link]
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        
        self.current_nodes = path_data.Node
        self.current_links = path_data.Link
        
        return f"Data saved to {filename}"
    
    def get_current_data(self) -> PathData:
        """현재 로드된 경로 데이터 반환"""
        return PathData(Node=self.current_nodes, Link=self.current_links)
    
    def add_node(self, node_data: NodeCreate) -> Node:
        """새 노드 추가"""
        # 새 노드 ID 생성
        node_id = self._generate_node_id()
        
        new_node = Node(
            ID=node_id,
            **node_data.dict()
        )
        
        self.current_nodes.append(new_node)
        return new_node
    
    def update_node(self, node_id: str, lat: float, lon: float) -> Optional[Node]:
        """노드 위치 업데이트"""
        node = self.get_node_by_id(node_id)
        if not node:
            return None
        
        # GPS 좌표 업데이트
        node.GpsInfo.Lat = lat
        node.GpsInfo.Long = lon
        
        # UTM 좌표 변환 및 업데이트
        try:
            utm_x, utm_y, zone_num, zone_letter = utm.from_latlon(lat, lon)
            node.UtmInfo.Easting = utm_x
            node.UtmInfo.Northing = utm_y
            node.UtmInfo.Zone = f"{zone_num}{zone_letter}"
        except:
            pass
        
        # 연결된 링크들의 길이 재계산
        self._recalculate_link_lengths(node_id)
        
        return node
    
    def delete_node(self, node_id: str) -> bool:
        """노드 삭제"""
        node = self.get_node_by_id(node_id)
        if not node:
            return False
        
        # 연결된 링크들도 삭제
        self.current_links = [link for link in self.current_links 
                             if link.FromNodeID != node_id and link.ToNodeID != node_id]
        
        # 노드 삭제
        self.current_nodes = [n for n in self.current_nodes if n.ID != node_id]
        
        return True
    
    def add_link(self, link_data: LinkCreate) -> Link:
        """새 링크 추가"""
        # 링크 ID 생성
        link_id = self._generate_link_id(link_data.FromNodeID, link_data.ToNodeID)
        
        # Length가 0이거나 없으면 서버에서 계산, 그렇지 않으면 프론트엔드 값 사용
        if not hasattr(link_data, 'Length') or link_data.Length == 0:
            calculated_length = self._calculate_link_length(link_data.FromNodeID, link_data.ToNodeID)
        else:
            calculated_length = link_data.Length
        
        new_link = Link(
            ID=link_id,
            AdminCode=link_data.AdminCode,
            RoadRank=link_data.RoadRank,
            RoadType=link_data.RoadType,
            RoadNo=link_data.RoadNo,
            LinkType=link_data.LinkType,
            LaneNo=link_data.LaneNo,
            R_LinkID=link_data.R_LinkID,
            L_LinkID=link_data.L_LinkID,
            FromNodeID=link_data.FromNodeID,
            ToNodeID=link_data.ToNodeID,
            SectionID=link_data.SectionID,
            Length=calculated_length,
            ITSLinkID=link_data.ITSLinkID,
            Maker=link_data.Maker,
            UpdateDate=link_data.UpdateDate,
            Version=link_data.Version,
            Remark=link_data.Remark,
            HistType=link_data.HistType,
            HistRemark=link_data.HistRemark
        )
        
        self.current_links.append(new_link)
        return new_link
    
    def delete_link(self, link_id: str) -> bool:
        """링크 삭제"""
        initial_count = len(self.current_links)
        self.current_links = [link for link in self.current_links if link.ID != link_id]
        return len(self.current_links) < initial_count
    
    def get_node_by_id(self, node_id: str) -> Optional[Node]:
        """ID로 노드 찾기"""
        return next((node for node in self.current_nodes if node.ID == node_id), None)
    
    def get_link_by_id(self, link_id: str) -> Optional[Link]:
        """ID로 링크 찾기"""
        return next((link for link in self.current_links if link.ID == link_id), None)
    
    def _generate_node_id(self) -> str:
        """새 노드 ID 생성"""
        existing_ids = [int(node.ID[1:]) for node in self.current_nodes if node.ID.startswith('N') and node.ID[1:].isdigit()]
        next_id = max(existing_ids, default=-1) + 1
        return f"N{next_id:04d}"
    
    def _generate_link_id(self, from_node_id: str, to_node_id: str) -> str:
        """새 링크 ID 생성"""
        from_num = from_node_id[1:] if len(from_node_id) > 1 else from_node_id
        to_num = to_node_id[1:] if len(to_node_id) > 1 else to_node_id
        return f"L{from_num}{to_num}"
    
    def _calculate_link_length(self, from_node_id: str, to_node_id: str) -> float:
        """두 노드 간 거리 계산 (km 단위)"""
        from_node = self.get_node_by_id(from_node_id)
        to_node = self.get_node_by_id(to_node_id)
        
        if not from_node or not to_node:
            return 0.0
        
        # UTM 좌표를 사용하여 거리 계산
        ex1, ny1 = from_node.UtmInfo.Easting, from_node.UtmInfo.Northing
        ex2, ny2 = to_node.UtmInfo.Easting, to_node.UtmInfo.Northing
        dist_m = math.sqrt((ex1 - ex2) ** 2 + (ny1 - ny2) ** 2)
        
        return round(dist_m / 1000.0, 5)  # km 단위로 변환
    
    def _recalculate_link_lengths(self, node_id: str):
        """노드와 연결된 모든 링크의 길이 재계산"""
        for link in self.current_links:
            if link.FromNodeID == node_id or link.ToNodeID == node_id:
                link.Length = self._calculate_link_length(link.FromNodeID, link.ToNodeID)
    
    def list_available_files(self) -> List[str]:
        """사용 가능한 JSON 파일 목록 반환"""
        if not os.path.exists(self.data_dir):
            return []
        
        files = []
        for file in os.listdir(self.data_dir):
            if file.endswith('.json'):
                files.append(file)
        
        return sorted(files)
    
    def _merge_nodes_with_duplicates(self, new_nodes: List[Node]) -> tuple[List[Node], List[Node]]:
        """새로운 노드들을 기존 노드들과 병합하면서 중복 ID 처리"""
        existing_node_ids = {node.ID for node in self.current_nodes}
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
        merged_nodes = self.current_nodes + unique_new_nodes
        
        return merged_nodes, duplicate_nodes
    
    def _merge_links_with_duplicates(self, new_links: List[Link], all_nodes: List[Node]) -> tuple[List[Link], List[Link]]:
        """새로운 링크들을 기존 링크들과 병합하면서 중복 ID 처리"""
        existing_link_ids = {link.ID for link in self.current_links}
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
        merged_links = self.current_links + unique_new_links
        
        return merged_links, duplicate_links
    
    def validate_data_integrity(self) -> dict:
        """데이터 무결성 검사"""
        issues = {
            "duplicate_node_ids": [],
            "duplicate_link_ids": [],
            "orphaned_links": [],
            "invalid_references": []
        }
        
        # 노드 ID 중복 검사
        node_ids = [node.ID for node in self.current_nodes]
        seen_node_ids = set()
        for node_id in node_ids:
            if node_id in seen_node_ids:
                issues["duplicate_node_ids"].append(node_id)
            else:
                seen_node_ids.add(node_id)
        
        # 링크 ID 중복 검사
        link_ids = [link.ID for link in self.current_links]
        seen_link_ids = set()
        for link_id in link_ids:
            if link_id in seen_link_ids:
                issues["duplicate_link_ids"].append(link_id)
            else:
                seen_link_ids.add(link_id)
        
        # 고아 링크 검사 (참조하는 노드가 존재하지 않는 링크)
        node_id_set = set(node_ids)
        for link in self.current_links:
            if link.FromNodeID not in node_id_set:
                issues["orphaned_links"].append(f"Link {link.ID}: FromNode {link.FromNodeID} not found")
            if link.ToNodeID not in node_id_set:
                issues["orphaned_links"].append(f"Link {link.ID}: ToNode {link.ToNodeID} not found")
        
        return issues