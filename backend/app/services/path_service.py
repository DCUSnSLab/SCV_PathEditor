import json
import os
import math
import utm
from typing import List, Optional
from datetime import datetime
from ..models.path_models import Node, Link, PathData, NodeCreate, LinkCreate, GpsInfo, UtmInfo


class PathService:
    def __init__(self, data_dir: str = None):
        # 1. 환경 변수에서 데이터 디렉토리 경로를 우선적으로 확인합니다.
        #    이는 컨테이너화된 환경에서 경로를 설정하는 가장 표준적인 방법입니다.
        env_data_dir = os.environ.get('APP_DATA_DIR')

        if data_dir:
            # 2. 인자로 경로가 명시적으로 전달된 경우 (주로 테스트 코드용)
            self.data_dir = data_dir
        elif env_data_dir:
            # 3. 환경 변수가 설정된 경우 (Docker/K8s 컨테이너 환경용)
            self.data_dir = env_data_dir
        else:
            # 4. 위 두가지가 모두 없는 경우 (로컬 개발 환경용)
            #    프로젝트 루트를 기준으로 상대 경로를 계산합니다.
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.data_dir = os.path.join(base_dir, "data", "path")
        
        # 애플리케이션 시작 시 데이터 디렉토리가 항상 존재하도록 보장합니다.
        os.makedirs(self.data_dir, exist_ok=True)
        self.current_nodes: List[Node] = []
        self.current_links: List[Link] = []
    
    def load_path_data(self, filename: str) -> PathData:
        """JSON 파일에서 경로 데이터 로드"""
        file_path = os.path.join(self.data_dir, filename)
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {filename}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 노드 및 링크 파싱
        nodes = [Node(**node_data) for node_data in data.get("Node", [])]
        links = [Link(**link_data) for link_data in data.get("Link", [])]
        
        self.current_nodes = nodes
        self.current_links = links
        
        return PathData(Node=nodes, Link=links)
    
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

    def cut_nodes(self, node_ids: List[str]) -> tuple[List[Node], List[Link]]:
        """선택된 노드들과 연결된 링크들을 잘라내기"""
        if not node_ids:
            return [], []

        # 잘라낼 노드들 찾기
        cut_nodes = []
        for node_id in node_ids:
            node = self.get_node_by_id(node_id)
            if node:
                cut_nodes.append(node)

        # 잘라낼 링크들 찾기 (선택된 노드들과 연결된 모든 링크)
        cut_links = []
        for link in self.current_links:
            if link.FromNodeID in node_ids or link.ToNodeID in node_ids:
                cut_links.append(link)

        # 클립보드에 저장 (인스턴스 변수로 저장)
        self.clipboard_nodes = [node.copy() for node in cut_nodes]
        self.clipboard_links = [link.copy() for link in cut_links]

        # 원본에서 제거
        self.current_nodes = [node for node in self.current_nodes if node.ID not in node_ids]
        cut_link_ids = [link.ID for link in cut_links]
        self.current_links = [link for link in self.current_links if link.ID not in cut_link_ids]

        return cut_nodes, cut_links

    def paste_nodes(self, center_lat: float, center_lon: float) -> tuple[List[Node], List[Link]]:
        """클립보드의 노드들을 지정된 중심 좌표에 붙여넣기"""
        if not hasattr(self, 'clipboard_nodes') or not self.clipboard_nodes:
            return [], []

        # 잘라낸 노드들의 중심점 계산
        original_center_lat = sum(node.GpsInfo.Lat for node in self.clipboard_nodes) / len(self.clipboard_nodes)
        original_center_lon = sum(node.GpsInfo.Long for node in self.clipboard_nodes) / len(self.clipboard_nodes)

        # 이동 오프셋 계산
        lat_offset = center_lat - original_center_lat
        lon_offset = center_lon - original_center_lon

        # 새로운 노드 ID 매핑 (기존 ID -> 새 ID)
        node_id_mapping = {}
        pasted_nodes = []

        # 노드들 붙여넣기
        for original_node in self.clipboard_nodes:
            # 새 노드 ID 생성
            new_node_id = self._generate_node_id()
            node_id_mapping[original_node.ID] = new_node_id

            # 새 위치 계산
            new_lat = original_node.GpsInfo.Lat + lat_offset
            new_lon = original_node.GpsInfo.Long + lon_offset

            # UTM 좌표 변환
            try:
                utm_x, utm_y, zone_num, zone_letter = utm.from_latlon(new_lat, new_lon)
                new_utm_info = UtmInfo(
                    Easting=utm_x,
                    Northing=utm_y,
                    Zone=f"{zone_num}{zone_letter}"
                )
            except:
                new_utm_info = original_node.UtmInfo.copy()

            # 새 노드 생성
            new_node = Node(
                ID=new_node_id,
                AdminCode=original_node.AdminCode,
                NodeType=original_node.NodeType,
                ITSNodeID=original_node.ITSNodeID,
                Maker=original_node.Maker,
                UpdateDate=original_node.UpdateDate,
                Version=original_node.Version,
                Remark=original_node.Remark,
                HistType=original_node.HistType,
                HistRemark=original_node.HistRemark,
                Heading=original_node.Heading,
                GpsInfo=GpsInfo(Lat=new_lat, Long=new_lon, Alt=original_node.GpsInfo.Alt),
                UtmInfo=new_utm_info
            )

            pasted_nodes.append(new_node)
            self.current_nodes.append(new_node)

        # 링크들 붙여넣기
        pasted_links = []
        for original_link in self.clipboard_links:
            # 양쪽 노드가 모두 잘라낸 노드들인 경우만 링크 복원
            if (original_link.FromNodeID in node_id_mapping and
                original_link.ToNodeID in node_id_mapping):

                new_from_id = node_id_mapping[original_link.FromNodeID]
                new_to_id = node_id_mapping[original_link.ToNodeID]
                new_link_id = self._generate_link_id(new_from_id, new_to_id)

                # 새 링크 길이 계산
                new_length = self._calculate_link_length(new_from_id, new_to_id)

                new_link = Link(
                    ID=new_link_id,
                    AdminCode=original_link.AdminCode,
                    RoadRank=original_link.RoadRank,
                    RoadType=original_link.RoadType,
                    RoadNo=original_link.RoadNo,
                    LinkType=original_link.LinkType,
                    LaneNo=original_link.LaneNo,
                    R_LinkID=original_link.R_LinkID,
                    L_LinkID=original_link.L_LinkID,
                    FromNodeID=new_from_id,
                    ToNodeID=new_to_id,
                    SectionID=original_link.SectionID,
                    Length=new_length,
                    ITSLinkID=original_link.ITSLinkID,
                    Maker=original_link.Maker,
                    UpdateDate=original_link.UpdateDate,
                    Version=original_link.Version,
                    Remark=original_link.Remark,
                    HistType=original_link.HistType,
                    HistRemark=original_link.HistRemark
                )

                pasted_links.append(new_link)
                self.current_links.append(new_link)

        return pasted_nodes, pasted_links

    def clear_clipboard(self):
        """클립보드 내용 삭제"""
        if hasattr(self, 'clipboard_nodes'):
            del self.clipboard_nodes
        if hasattr(self, 'clipboard_links'):
            del self.clipboard_links

    def has_clipboard_content(self) -> bool:
        """클립보드에 내용이 있는지 확인"""
        return (hasattr(self, 'clipboard_nodes') and
                self.clipboard_nodes and
                len(self.clipboard_nodes) > 0)
    
    def list_available_files(self) -> List[str]:
        """사용 가능한 JSON 파일 목록 반환"""
        if not os.path.exists(self.data_dir):
            return []
        
        files = []
        for file in os.listdir(self.data_dir):
            if file.endswith('.json'):
                files.append(file)
        
        return sorted(files)