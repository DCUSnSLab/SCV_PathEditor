# 1. 기반 이미지 설정
FROM python:3.10-slim

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 프론트엔드 파일 복사
COPY ./frontend /app/frontend

# 4. 백엔드 파일 복사
COPY ./backend /app/backend

# 5. 백엔드 의존성 설치
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

# 6. 포트 노출
EXPOSE 8000

# 7. 애플리케이션 실행
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
