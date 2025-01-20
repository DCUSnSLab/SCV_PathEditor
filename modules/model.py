from dataclasses import dataclass

@dataclass
class GpsInfo:
    Lat: float
    Long: float
    Alt: float

@dataclass
class UtmInfo:
    Easting: float
    Northing: float
    Zone: str

@dataclass
class Node:
    ID: str
    AdminCode: str
    NodeType: int
    ITSNodeID: str
    Maker: str
    UpdateDate: str
    Version: str
    Remark: str
    HistType: str
    HistRemark: str
    GpsInfo: GpsInfo
    UtmInfo: UtmInfo

@dataclass
class Link:
    ID: str
    AdminCode: str
    RoadRank: int
    RoadType: int
    RoadNo: str
    LinkType: int
    LaneNo: int
    R_LinkID: str
    L_LinkID: str
    FromNodeID: str
    ToNodeID: str
    SectionID: str
    Length: float
    ITSLinkID: str
    Maker: str
    UpdateDate: str
    Version: str
    Remark: str
    HistType: str
    HistRemark: str