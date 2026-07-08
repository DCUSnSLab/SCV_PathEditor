import json
import os
import math
import logging
import utm
from typing import List, Optional
from ..models.path_models import Node, Link, PathData, NodeCreate, LinkCreate

logger = logging.getLogger(__name__)


class PathService:
    """경로(노드/링크) 데이터 서비스.

    상태 모델에 대한 주의:
        - current_nodes / current_links 는 단일 프로세스의 **인메모리** 상태이며,
          모듈 전역 싱글턴(path_api.py 의 path_service)으로 공유된다.
        - 따라서 서버 재시작 시 초기화되고, 여러 워커/인스턴스(K8s replicas>1,
          uvicorn --workers>1)로 확장하면 인스턴스별로 상태가 달라진다.
        - 영속적인 단일 진실 공급원(source of truth)은 data_dir 하위의 JSON 파일이며,
          프런트엔드도 자체적으로 currentData 를 보유한다. 인메모리 상태는 보조적이다.
        - 현재 배포는 K8s replicas:1 의 단일 사용자 도구를 전제로 하므로 이 한계가
          문제되지 않는다. 다중 인스턴스/동시 편집이 필요해지면 외부 저장소(DB 등)나
          요청별 파일 기반 처리로 전환해야 한다.
    """

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
            "Node": [node.model_dump() for node in path_data.Node],
            "Link": [link.model_dump() for link in path_data.Link]
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
            **node_data.model_dump()
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
        except Exception as e:
            # 변환 실패 시 기존 UTM 값을 유지하고 경고만 남긴다(좌표 오류 추적용)
            logger.warning("노드 %s UTM 변환 실패 (lat=%s, lon=%s): %s", node_id, lat, lon, e)
        
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