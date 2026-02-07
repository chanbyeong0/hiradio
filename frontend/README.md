# 바쫀코 프론트엔드

React + TypeScript + Vite + TailwindCSS로 구현된 출근길 라디오 웹앱입니다.

## 설치 및 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드는 `http://localhost:3000`에서 실행됩니다.

백엔드 API는 `http://localhost:9100`에서 실행되어야 합니다.

## 환경 변수

`.env` 파일에 다음을 추가할 수 있습니다:

```
VITE_API_BASE=http://localhost:9100
```

## 프로젝트 구조

```
src/
  components/     # 화면 컴포넌트
  utils/         # 유틸리티 함수
  api.ts         # 백엔드 API 호출
  types.ts       # TypeScript 타입 정의
  App.tsx        # 메인 앱 컴포넌트
  main.tsx       # 진입점
  index.css      # 글로벌 스타일
```
