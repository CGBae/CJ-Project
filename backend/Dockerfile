# 1. 'python:3.10-slim' 이미지를 기반으로 시작
FROM python:3.13-slim
WORKDIR /app

# 의존성 설치
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# 나머지 소스 코드 복사
COPY backend/ .

# 이 이미지를 실행하면 'gunicorn'이 실행됨 (예시)
# (실제 실행 명령어는 프로젝트에 맞게 수정하세요)
CMD ["uvicorn", "--bind", "0.0.0.0:8000", "main:app"]