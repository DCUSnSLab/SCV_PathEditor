from matplotlib.patches import FancyArrowPatch
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
import cartopy.crs as ccrs
import contextily as ctx
import math

class MapCanvas(FigureCanvas):
    def __init__(self, nodes, links, parent=None):
        self.fig, self.ax = plt.subplots(
            figsize=(20, 20), subplot_kw={"projection": ccrs.PlateCarree()}
        )
        super().__init__(self.fig)
        self.setParent(parent)
        self.nodes_list = nodes
        self.links = links
        self.nodes_dict = {node.ID: node for node in nodes}
        
        # 드래그 관련 변수들
        self.dragging = False
        self.selected_node = None
        self.drag_mode = False
        self.node_artists = {}  # 노드 ID와 matplotlib artist 매핑
        self.link_artists = []  # 링크 artist들 저장
        
        # QuickLink 관련 변수들
        self.quick_link_mode = False
        self.first_selected_node = None
        self.highlighted_artist = None  # 하이라이트된 노드 저장
        
        # 콜백들
        self.drag_callback = None
        self.quick_link_callback = None
        
        self.plot_map()

    def plot_map(self):
        if not self.nodes_list:
            raise ValueError("Node 데이터 없음")
        
        # 기존 artist들 초기화
        self.node_artists.clear()
        self.link_artists.clear()
        self.ax.clear()
        
        lats = [n.GpsInfo.Lat for n in self.nodes_list]
        lons = [n.GpsInfo.Long for n in self.nodes_list]
        self.ax.set_title("Node and Link Visualization")
        self.ax.set_extent([min(lons)-0.001, max(lons)+0.001, min(lats)-0.001, max(lats)+0.001])
        
        # 위성지도 타일 로드
        url = "http://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        try:
            ctx.add_basemap(self.ax, crs="EPSG:4326", source=url, zoom=15)
        except Exception as e:
            print(f"타일 로드 오류: {e}")
        
        # 노드 그리기 (각 노드의 artist 저장)
        for node in self.nodes_list:
            scatter = self.ax.scatter(node.GpsInfo.Long, node.GpsInfo.Lat, 
                                    color="red", s=50, alpha=0.7,
                                    transform=ccrs.PlateCarree(), picker=True)
            text = self.ax.text(node.GpsInfo.Long, node.GpsInfo.Lat, node.ID, 
                              fontsize=10, transform=ccrs.PlateCarree())
            
            # 노드 ID와 artist 매핑 저장
            self.node_artists[node.ID] = {
                'scatter': scatter,
                'text': text,
                'node': node
            }
        
        # 링크 그리기
        for link in self.links:
            a = self.nodes_dict.get(link.FromNodeID)
            b = self.nodes_dict.get(link.ToNodeID)
            if a and b:
                arrow = self.draw_arrow(a.GpsInfo.Long, a.GpsInfo.Lat, 
                                      b.GpsInfo.Long, b.GpsInfo.Lat)
                self.link_artists.append({
                    'arrow': arrow,
                    'link': link
                })
        
        self.ax.set_axis_off()
        self.draw()

    def draw_arrow(self, from_lon, from_lat, to_lon, to_lat):
        arrow = FancyArrowPatch(
            (from_lon, from_lat), (to_lon, to_lat), color="blue",
            arrowstyle="->", mutation_scale=15, transform=ccrs.PlateCarree()
        )
        self.ax.add_patch(arrow)
        return arrow
    
    def enable_drag_mode(self, enabled=True):
        """드래그 모드 활성화/비활성화"""
        self.drag_mode = enabled
        if enabled:
            print("드래그 모드 활성화: 노드를 클릭하고 드래그하여 위치를 변경할 수 있습니다.")
        else:
            print("드래그 모드 비활성화")
    
    def enable_quick_link_mode(self, enabled=True):
        """QuickLink 모드 활성화/비활성화"""
        self.quick_link_mode = enabled
        if enabled:
            # 다른 모드들 비활성화
            self.drag_mode = False
            print("QuickLink 모드 활성화: 첫 번째 노드를 클릭하세요.")
        else:
            print("QuickLink 모드 비활성화")
            self.reset_quick_link_selection()
    
    def reset_quick_link_selection(self):
        """QuickLink 선택 상태 초기화"""
        # 하이라이트 제거
        if self.highlighted_artist:
            self.highlighted_artist.set_color('red')  # 원래 색상으로 복원
            self.highlighted_artist = None
        
        self.first_selected_node = None
        self.draw_idle()
    
    def handle_quick_link_click(self, clicked_node):
        """QuickLink 모드에서 노드 클릭 처리"""
        if not self.first_selected_node:
            # 첫 번째 노드 선택
            self.first_selected_node = clicked_node
            
            # 선택된 노드를 노란색으로 하이라이트
            if clicked_node.ID in self.node_artists:
                artist_info = self.node_artists[clicked_node.ID]
                scatter = artist_info['scatter']
                scatter.set_color('yellow')
                self.highlighted_artist = scatter
                self.draw_idle()
            
            print(f"첫 번째 노드 선택: {clicked_node.ID}. 두 번째 노드를 선택하세요.")
            
        else:
            # 두 번째 노드 선택 - 링크 생성
            if clicked_node.ID == self.first_selected_node.ID:
                print("동일한 노드입니다. 다른 노드를 선택해주세요.")
                return
            
            second_node = clicked_node
            print(f"두 번째 노드 선택: {second_node.ID}. 링크를 생성합니다.")
            
            # 링크 데이터 생성
            link_data = self.create_quick_link_data(self.first_selected_node, second_node)
            
            # 메인 윈도우에 링크 추가 요청
            if hasattr(self, 'quick_link_callback') and self.quick_link_callback:
                self.quick_link_callback(link_data)
            
            # 선택 상태 초기화 (다음 링크를 위해)
            self.reset_quick_link_selection()
    
    def create_quick_link_data(self, from_node, to_node):
        """QuickLink용 링크 데이터 생성"""
        from datetime import datetime
        import random
        
        # 기본 링크 정보
        today = datetime.now().strftime("%Y%m%d")
        
        # 거리 계산 (UTM 좌표 사용)
        ex1, ny1 = from_node.UtmInfo.Easting, from_node.UtmInfo.Northing
        ex2, ny2 = to_node.UtmInfo.Easting, to_node.UtmInfo.Northing
        dist_m = math.sqrt((ex1 - ex2) ** 2 + (ny1 - ny2) ** 2)
        length_km = round(dist_m / 1000.0, 5)
        
        # ID 생성
        from_num = from_node.ID[1:] if len(from_node.ID) > 1 else from_node.ID
        to_num = to_node.ID[1:] if len(to_node.ID) > 1 else to_node.ID
        link_id = f"L{from_num}{to_num}"
        
        # 링크 데이터 구조
        link_data = {
            "ID": link_id,
            "AdminCode": "110",
            "RoadRank": 1,
            "RoadType": 1, 
            "RoadNo": "20",
            "LinkType": 3,
            "LaneNo": 2,
            "R_LinkID": f"R_{from_num}",
            "L_LinkID": f"L_{to_num}",
            "FromNodeID": from_node.ID,
            "ToNodeID": to_node.ID,
            "SectionID": "QUICKLINK_SECTION",
            "Length": length_km,
            "ITSLinkID": f"ITS_{random.getrandbits(32):08x}",
            "Maker": "QuickLink 자동생성",
            "UpdateDate": today,
            "Version": "2021",
            "Remark": "QuickLink로 자동 생성된 링크",
            "HistType": "02A",
            "HistRemark": "QuickLink 기능으로 생성"
        }
        
        return link_data
    
    def find_closest_node(self, lon, lat, threshold=0.0001):
        """클릭 위치에서 가장 가까운 노드 찾기"""
        closest_node = None
        min_distance = float('inf')
        
        for node in self.nodes_list:
            distance = math.sqrt((lon - node.GpsInfo.Long)**2 + (lat - node.GpsInfo.Lat)**2)
            if distance < min_distance and distance < threshold:
                min_distance = distance
                closest_node = node
        
        return closest_node
    
    def update_node_position(self, node, new_lon, new_lat):
        """노드 위치 업데이트"""
        # 노드 데이터 업데이트
        node.GpsInfo.Long = new_lon
        node.GpsInfo.Lat = new_lat
        
        # UTM 좌표도 업데이트 (필요한 경우)
        try:
            import utm
            utm_x, utm_y, zone_num, zone_letter = utm.from_latlon(new_lat, new_lon)
            node.UtmInfo.Easting = utm_x
            node.UtmInfo.Northing = utm_y
            node.UtmInfo.Zone = f"{zone_num}{zone_letter}"
        except:
            pass
        
        # 시각적 업데이트
        self.update_node_visual(node)
        self.update_related_links(node)
        
        # 콜백 호출 (메인 윈도우에 변경사항 알림)
        if self.drag_callback:
            self.drag_callback(node)
    
    def update_node_visual(self, node):
        """노드의 시각적 표현 업데이트"""
        if node.ID in self.node_artists:
            artist_info = self.node_artists[node.ID]
            
            # scatter plot 위치 업데이트
            scatter = artist_info['scatter']
            scatter.set_offsets([[node.GpsInfo.Long, node.GpsInfo.Lat]])
            
            # 텍스트 위치 업데이트
            text = artist_info['text']
            text.set_position((node.GpsInfo.Long, node.GpsInfo.Lat))
    
    def update_related_links(self, node):
        """노드와 연결된 링크들 업데이트"""
        # 기존 화살표들 제거
        for link_info in self.link_artists:
            link_info['arrow'].remove()
        
        # 링크 아티스트 목록 초기화
        self.link_artists.clear()
        
        # 모든 링크를 다시 그리기
        for link in self.links:
            from_node = self.nodes_dict.get(link.FromNodeID)
            to_node = self.nodes_dict.get(link.ToNodeID)
            if from_node and to_node:
                arrow = self.draw_arrow(from_node.GpsInfo.Long, from_node.GpsInfo.Lat,
                                      to_node.GpsInfo.Long, to_node.GpsInfo.Lat)
                self.link_artists.append({
                    'arrow': arrow,
                    'link': link
                })
    
    def connect_map_click_event(self, callback):
        """지도 클릭 이벤트 연결"""
        self.click_callback = callback
        self.mpl_connect("button_press_event", self.on_mouse_press)
        self.mpl_connect("motion_notify_event", self.on_mouse_move)
        self.mpl_connect("button_release_event", self.on_mouse_release)
    
    def connect_drag_callback(self, callback):
        """드래그 완료 콜백 연결"""
        self.drag_callback = callback
    
    def connect_quick_link_callback(self, callback):
        """QuickLink 콜백 연결"""
        self.quick_link_callback = callback
    
    def on_mouse_press(self, event):
        """마우스 누름 이벤트"""
        if event.xdata is None or event.ydata is None:
            return
        
        lon, lat = event.xdata, event.ydata
        
        # QuickLink 모드 처리
        if self.quick_link_mode:
            closest_node = self.find_closest_node(lon, lat)
            if closest_node:
                self.handle_quick_link_click(closest_node)
            return
        
        # 드래그 모드 처리
        if self.drag_mode:
            # 드래그 모드에서는 노드 선택 및 드래그 시작
            closest_node = self.find_closest_node(lon, lat)
            if closest_node:
                self.selected_node = closest_node
                self.dragging = True
                print(f"노드 {closest_node.ID} 드래그 시작")
            else:
                self.selected_node = None
                self.dragging = False
        else:
            # 일반 클릭 모드
            if hasattr(self, 'click_callback') and self.click_callback:
                self.click_callback(event)
    
    def on_mouse_move(self, event):
        """마우스 이동 이벤트"""
        if not self.dragging or not self.selected_node or event.xdata is None or event.ydata is None:
            return
        
        # 실시간으로 노드 위치 업데이트
        new_lon, new_lat = event.xdata, event.ydata
        self.update_node_position(self.selected_node, new_lon, new_lat)
        self.draw_idle()
    
    def on_mouse_release(self, event):
        """마우스 떼기 이벤트"""
        if self.dragging and self.selected_node:
            print(f"노드 {self.selected_node.ID} 드래그 완료")
            self.dragging = False
            self.selected_node = None
    
    def add_single_node_to_map(self, node):
        """기존 지도에 단일 노드만 추가 (줌 레벨 유지)"""
        # 노드 리스트에 추가
        self.nodes_list.append(node)
        
        # 새 노드를 scatter plot으로 추가
        scatter = self.ax.scatter(node.GpsInfo.Long, node.GpsInfo.Lat, 
                                color="red", s=50, alpha=0.7,
                                transform=ccrs.PlateCarree(), picker=True)
        text = self.ax.text(node.GpsInfo.Long, node.GpsInfo.Lat, node.ID, 
                          fontsize=10, transform=ccrs.PlateCarree())
        
        # 노드 ID와 artist 매핑 저장
        self.node_artists[node.ID] = {
            'scatter': scatter,
            'text': text,
            'node': node
        }
        
        # nodes_dict 업데이트
        self.nodes_dict[node.ID] = node
        
        # 화면 새로고침 (줌 레벨 유지)
        self.draw_idle()
    
    def add_link_to_map(self, link):
        """새로운 링크를 지도에 추가"""
        if not self.nodes_list:
            return
        node_dict = {n.ID: n for n in self.nodes_list}
        a = node_dict.get(link["FromNodeID"])
        b = node_dict.get(link["ToNodeID"])
        if not (a and b):
            return
        
        arrow = self.draw_arrow(a.GpsInfo.Long, a.GpsInfo.Lat, 
                               b.GpsInfo.Long, b.GpsInfo.Lat)
        self.link_artists.append({
            'arrow': arrow,
            'link': link
        })
        self.figure.canvas.draw_idle()
