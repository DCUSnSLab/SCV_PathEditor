from pydantic import BaseModel
from typing import List


class GpsInfo(BaseModel):
    Lat: float
    Long: float
    Alt: float


class UtmInfo(BaseModel):
    Easting: float
    Northing: float
    Zone: str


class Node(BaseModel):
    ID: str
    AdminCode: str = ""
    NodeType: int = 1
    ITSNodeID: str = ""
    Maker: str = ""
    UpdateDate: str = ""
    Version: str = "2021"
    Remark: str = ""
    HistType: str = "02A"
    HistRemark: str = ""
    Heading: float = -1.0
    GpsInfo: GpsInfo
    UtmInfo: UtmInfo


class Link(BaseModel):
    ID: str
    AdminCode: str = ""
    RoadRank: int = 1
    RoadType: int = 1
    RoadNo: str = ""
    LinkType: int = 3
    LaneNo: int = 2
    R_LinkID: str = ""
    L_LinkID: str = ""
    FromNodeID: str
    ToNodeID: str
    SectionID: str = ""
    Length: float
    ITSLinkID: str = ""
    Maker: str = ""
    UpdateDate: str = ""
    Version: str = "2021"
    Remark: str = ""
    HistType: str = "02A"
    HistRemark: str = ""


class PathData(BaseModel):
    Node: List[Node]
    Link: List[Link]


class NodeCreate(BaseModel):
    AdminCode: str = ""
    NodeType: int = 1
    ITSNodeID: str = ""
    Maker: str = ""
    UpdateDate: str = ""
    Version: str = "2021"
    Remark: str = ""
    HistType: str = "02A"
    HistRemark: str = ""
    Heading: float = -1.0
    GpsInfo: GpsInfo
    UtmInfo: UtmInfo


class LinkCreate(BaseModel):
    AdminCode: str = ""
    RoadRank: int = 1
    RoadType: int = 1
    RoadNo: str = ""
    LinkType: int = 3
    LaneNo: int = 2
    R_LinkID: str = ""
    L_LinkID: str = ""
    FromNodeID: str
    ToNodeID: str
    SectionID: str = ""
    Length: float
    ITSLinkID: str = ""
    Maker: str = ""
    UpdateDate: str = ""
    Version: str = "2021"
    Remark: str = ""
    HistType: str = "02A"
    HistRemark: str = ""


# 참고:
# - 노드/링크 부분 수정(PATCH)용 NodeUpdate/LinkUpdate 모델은 해당 엔드포인트가 없어
#   미사용 상태였으므로 제거했다. (속성 편집은 프런트엔드에서 처리 후 파일 저장)
# - 잘라내기/붙여넣기 클립보드도 프런트엔드(localStorage)에서 처리하므로
#   서버측 Cut/Paste 요청·응답 모델은 제거되었다.