# SCV Path Editor Web

PyQt5 기반의 데스크톱 애플리케이션을 웹 브라우저 기반으로 전환한 자율주행 경로 편집 도구입니다.

## 기술 스택

### 백엔드
- **FastAPI**: 고성능 REST API 서버
- **Pydantic**: 데이터 검증 및 직렬화
- **Python**: 기존 로직 재활용

### 프론트엔드
- **Leaflet**: 인터랙티브 지도 라이브러리
- **Vanilla JavaScript**: 프레임워크 없는 순수 JavaScript
- **HTML5/CSS3**: 반응형 UI

## 주요 기능

### 🗺️ 지도 기반 편집
- Leaflet을 활용한 인터랙티브 지도
- 실시간 노드/링크 시각화
- 다양한 편집 모드 지원

### 📍 노드 관리
- **Select Mode**: 노드 선택 및 정보 확인
- **Drag Mode**: 드래그 앤 드롭으로 노드 위치 변경
- **Add Mode**: 지도 클릭으로 새 노드 추가
- 실시간 GPS ↔ UTM 좌표 변환

### 🔗 링크 관리
- **QuickLink Mode**: 두 노드 클릭으로 빠른 링크 생성
- 자동 거리 계산 및 화살표 시각화
- 노드 이동 시 연결된 링크 길이 자동 재계산

### 📊 데이터 테이블
- 노드/링크 정보를 테이블 형태로 표시
- 실시간 데이터 동기화 (지도 ↔ 테이블)
- 테이블에서 직접 삭제 가능

### 📁 파일 관리
- JSON 파일 업로드/다운로드
- 서버에 파일 저장/로드
- 기존 PyQt 버전과 호환되는 데이터 포맷

## 설치 및 실행

### 1. 의존성 설치
```bash
cd web_version/backend
pip install -r requirements.txt
```

### 2. 서버 실행
```bash
cd web_version/backend
python main.py
```

### 3. 웹 애플리케이션 접속
브라우저에서 `http://localhost:8000` 접속

## 프로젝트 구조

```
web_version/
├── backend/
│   ├── app/
│   │   ├── models/          # 데이터 모델 (Pydantic)
│   │   ├── api/             # REST API 엔드포인트
│   │   ├── services/        # 비즈니스 로직
│   │   └── utils/           # 유틸리티 함수
│   ├── main.py              # FastAPI 서버 진입점
│   └── requirements.txt     # Python 의존성
├── frontend/
│   ├── index.html           # 메인 HTML
│   ├── css/styles.css       # 스타일시트
│   └── js/
│       ├── api.js           # API 클라이언트
│       ├── map.js           # 지도 관리 (Leaflet)
│       ├── ui.js            # UI 관리 및 테이블
│       └── app.js           # 메인 애플리케이션
└── data/                    # JSON 데이터 파일
```

## API 엔드포인트

### 파일 관리
- `GET /api/path/files`: 파일 목록 조회
- `POST /api/path/load/{filename}`: 파일 로드
- `POST /api/path/save/{filename}`: 파일 저장
- `POST /api/path/upload`: 파일 업로드
- `GET /api/path/download/{filename}`: 파일 다운로드

### 노드 관리
- `GET /api/path/nodes`: 모든 노드 조회
- `POST /api/path/nodes`: 새 노드 생성
- `PUT /api/path/nodes/{node_id}/position`: 노드 위치 업데이트
- `DELETE /api/path/nodes/{node_id}`: 노드 삭제

### 링크 관리
- `GET /api/path/links`: 모든 링크 조회
- `POST /api/path/links`: 새 링크 생성
- `DELETE /api/path/links/{link_id}`: 링크 삭제

## 사용법

### 기본 작업 흐름
1. **파일 로드**: 좌측 패널에서 기존 JSON 파일 선택
2. **편집 모드 선택**: 상단 모드 버튼으로 원하는 작업 선택
3. **지도에서 편집**: 노드 추가, 이동, 링크 생성 등
4. **데이터 확인**: 우측 테이블에서 실시간 데이터 확인
5. **저장**: Save 버튼으로 편집된 데이터 저장

### 키보드 단축키
- `1-4`: 편집 모드 변경 (Select/Drag/Add/QuickLink)
- `Q`: QuickLink 모드
- `D`: Drag 모드  
- `A`: Add Node 모드
- `Ctrl+S`: 파일 저장
- `Ctrl+O`: 파일 열기
- `ESC`: 취소/모달 닫기

### 편집 모드별 사용법

#### Select Mode (노드 선택)
- 노드 클릭으로 선택
- 선택된 노드 정보가 좌측 패널에 표시

#### Drag Mode (노드 드래그)
- 노드를 클릭하고 드래그하여 위치 변경
- 연결된 링크의 길이 자동 재계산

#### Add Node Mode (노드 추가)
- 지도의 원하는 위치 클릭
- 노드 정보 입력 모달에서 세부사항 설정

#### QuickLink Mode (빠른 링크 생성)
- 첫 번째 노드 클릭 (노란색으로 하이라이트)
- 두 번째 노드 클릭하여 링크 자동 생성

## 기존 PyQt 버전과의 차이점

### 개선된 점
✅ **웹 기반**: 브라우저에서 실행, 설치 불필요  
✅ **반응형 UI**: 다양한 화면 크기 지원  
✅ **실시간 동기화**: 지도와 테이블 간 즉시 반영  
✅ **키보드 단축키**: 빠른 작업을 위한 단축키 지원  
✅ **REST API**: 다른 시스템과의 연동 가능  

### 유지된 기능
✅ 모든 기존 편집 기능 (노드/링크 추가, 수정, 삭제)  
✅ GPS ↔ UTM 좌표 변환  
✅ JSON 파일 포맷 호환성  
✅ 드래그 앤 드롭 노드 이동  
✅ QuickLink 기능  

## 개발자 도구

### 브라우저 콘솔에서 사용 가능한 디버그 명령어
```javascript
// 현재 데이터 확인
window.debug.getCurrentData()

// 지도 정보 확인  
window.debug.getMapInfo()

// 특정 노드로 이동
window.debug.goToNode('N0001')

// API 상태 확인
await window.debug.healthCheck()

// 앱 재시작
await window.debug.restart()
```

## 주의사항

1. **서버 실행 필요**: 백엔드 서버가 실행되어야 함
2. **데이터 백업**: 중요한 데이터는 주기적으로 저장
3. **브라우저 호환성**: 모던 브라우저 권장 (Chrome, Firefox, Safari, Edge)

## 향후 개선 계획

- [ ] 사용자 인증 및 권한 관리
- [ ] 실시간 다중 사용자 편집
- [ ] 더 많은 지도 타일 서비스 지원
- [ ] 데이터 내보내기 형식 확장
- [ ] 모바일 터치 최적화