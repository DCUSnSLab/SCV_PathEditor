from pydantic import BaseModel
from typing import List, Optional


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


class NodeUpdate(BaseModel):
    AdminCode: Optional[str] = None
    NodeType: Optional[int] = None
    ITSNodeID: Optional[str] = None
    Maker: Optional[str] = None
    UpdateDate: Optional[str] = None
    Version: Optional[str] = None
    Remark: Optional[str] = None
    HistType: Optional[str] = None
    HistRemark: Optional[str] = None
    GpsInfo: Optional[GpsInfo] = None
    UtmInfo: Optional[UtmInfo] = None


class LinkUpdate(BaseModel):
    AdminCode: Optional[str] = None
    RoadRank: Optional[int] = None
    RoadType: Optional[int] = None
    RoadNo: Optional[str] = None
    LinkType: Optional[int] = None
    LaneNo: Optional[int] = None
    R_LinkID: Optional[str] = None
    L_LinkID: Optional[str] = None
    FromNodeID: Optional[str] = None
    ToNodeID: Optional[str] = None
    SectionID: Optional[str] = None
    Length: Optional[float] = None
    ITSLinkID: Optional[str] = None
    Maker: Optional[str] = None
    UpdateDate: Optional[str] = None
    Version: Optional[str] = None
    Remark: Optional[str] = None
    HistType: Optional[str] = None
    HistRemark: Optional[str] = None