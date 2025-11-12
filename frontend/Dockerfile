# 
# 1단계: 'builder'라는 이름의 빌드 전용 환경
#
FROM node:22-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_KAKAO_JS_KEY
ARG INTERNAL_API_URL
ARG NEXT_PUBLIC_AUTH_BYPASS
ARG NEXT_PUBLIC_KAKAO_REST_KEY

RUN printf "NEXT_PUBLIC_API_URL=%s\nNEXT_PUBLIC_KAKAO_JS_KEY=%s\n" \
  "${NEXT_PUBLIC_API_URL}" \
  "${NEXT_PUBLIC_KAKAO_JS_KEY}" \
  "${INTERNAL_API_URL}" \
  "${NEXT_PUBLIC_AUTH_BYPASS}" \
  "${NEXT_PUBLIC_KAKAO_REST_KEY}" \
  > .env.production

# 의존성 설치 (package.json이 변경되었을 때만 재설치)
COPY frontend/package*.json ./
RUN npm install

# 나머지 소스 코드 복사 및 빌드
COPY frontend/ ./
RUN npm run build

#
# 2단계: 'runner'라는 이름의 실제 실행 환경
#
FROM node:22-alpine AS runner
WORKDIR /app

# 빌드 환경('builder')에서 결과물만 복사
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 이 이미지를 실행하면 'npm start'가 실행됨
CMD ["npm", "start"]