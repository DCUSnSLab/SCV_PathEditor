# SCV_PathEditor

## 개요
SCV_PathEditor는 교내환경에서 자율주행 차량의 global_path를 생성하고 수정하기 위한 그래픽 기반 편집 도구입니다. 노드와 링크를 기반으로 자율주행 경로를 쉽게 생성, 편집할 수 있도록 설계되었습니다.

## 주요 기능
- 노드와 링크 데이터 로드 및 저장 (JSON 형식)
- 위성지도 기반 경로 시각화
- 노드 선택 및 링크 생성 기능
- 경로 데이터 테이블 뷰 지원 (속성 편집 가능)
- GPS 좌표와 UTM 좌표 지원

## 설치 방법
1. 저장소 복제:
```bash
git clone https://github.com/your-username/SCV_PathEditor.git
cd SCV_PathEditor
```

2. 의존성 패키지 설치:
```bash
pip install -r requirements.txt
```

3. 실행:
```bash
python main.py
```

## 사용 방법
1. 'Load' 버튼을 클릭하여 기존 path 파일 열기
2. 노드 선택 모드(Node select)를 사용하여 지도에서 노드 선택
3. 링크 추가 모드(Link add mode)를 사용하여 노드 간 연결 생성
4. 'Save' 버튼을 클릭하여 편집된 경로 저장

## 요구사항
- Python 3.9 이상
- 필요 패키지: PyQt5, pandas, geopandas, matplotlib, contextily, shapely, scipy, geopy, utm, cartopy

## 프로젝트 구조
- `main.py`: 애플리케이션 진입점
- `modules/`: 핵심 기능 모듈 
  - `main_window.py`: 메인 UI 및 로직
  - `map_viewer.py`: 지도 시각화 모듈
  - `model.py`: 데이터 모델 정의
  - `link_add_form.py`: 링크 추가 폼
  - `ui_setup.py`: UI 설정
  - `util.py`: 유틸리티 함수
- `data/path/`: 경로 데이터 JSON 파일

## 라이센스
이 프로젝트는 교내 자율주행 시스템 개발 목적으로 제작되었습니다.
