<div align="center">

<img src="frontend/src/assets/images/logo.png" alt="ONAIR Logo" width="200"/>

# ONAIR 🎙️

**출근길을 위한 개인 맞춤형 AI 라디오**

[![Made with Cursor](https://img.shields.io/badge/Made%20with-Cursor%20AI-blueviolet?style=for-the-badge)](https://cursor.sh)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)

날씨, 뉴스, 음악을 제공하며, 실시간 교통 정보와 함께 출근길을 더 즐겁게 만들어드립니다.

</div>

---

## ✨ 주요 기능

### 🎙️ **AI 라디오**
- 💬 **개인 맞춤 인사말** - Azure OpenAI 기반 자연스러운 인사
- 🌤️ **실시간 날씨 안내** - Open-Meteo API
- 📰 **관심 뉴스 브리핑** - 선택한 카테고리 최신 뉴스 3건
- 🔊 **TTS 음성** - 네이버 클로바 TTS Premium

### 🎵 **스마트 음악**
- 🌦️ **날씨/시간대별 추천** - 비오는 날엔 재즈, 아침엔 경쾌한 음악
- 🎼 **무드별 플레이리스트** - 10가지 음악 분위기
- ▶️ **자동 재생** - YouTube 음악 스트리밍

### 🚇 **실시간 교통**
- 🗺️ **경로 안내** - 집에서 회사까지 최적 경로 (ODsay API)
- ⏱️ **지하철 도착 시간** - "3분 후 도착" 실시간 정보
- 💰 **요금 정보** - 소요시간, 환승 횟수, 교통비

### ⚙️ **개인화**
- 🎤 **DJ 선택** - 커돌이(남성) / 커순이(여성)
- 📑 **뉴스 카테고리** - 정치, 경제, 사회, 문화, 세계, 기술, 엔터, 예술
- 🎚️ **라디오:음악 비율** - 1:1 ~ 5:1 자유 조절

---

## 🏗️ 기술 스택

**Frontend**
- React 18 + TypeScript
- Vite + Tailwind CSS

**Backend**
- Python 3.10+ + FastAPI
- Azure OpenAI (GPT-4o)
- 네이버 클로바 TTS Premium

**APIs**
- YouTube Data API v3
- 딥서치 뉴스 API
- Open-Meteo (날씨)
- Kakao 로컬 API
- ODsay API (대중교통)
- 서울시 공공데이터 (지하철)

---

## 🚀 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/chanbyeong0/hiradio.git
cd hiradio
```

### 2. 환경 변수 설정

```bash
cp .env.template .env
# .env 파일에 API 키 입력
```

**필수 API 키**
- Azure OpenAI (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY)
- 네이버 클로바 TTS (NCP_TTS_CLIENT_ID, NCP_TTS_CLIENT_SECRET)

**선택 API 키** (없어도 기본 기능 사용 가능)
- YOUTUBE_API_KEY, DEEPSEARCH_NEWS_API_KEY
- KAKAO_REST_KEY, ODSAY_API_KEY, SEOUL_SUBWAY_API_KEY

### 3. 백엔드 실행

```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 9100
```

### 4. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

**🎉 완료!** `http://localhost:5173` 접속

---

## 📱 사용 흐름

1. **온보딩** → 이름, 출발지, 도착지, DJ, 관심 뉴스 설정
2. **미리보기** → 첫 곡 선택
3. **로딩** → AI 스크립트 생성
4. **재생** → 인사말 → 음악 → 뉴스 → 음악 (반복)
5. **도착** → 마무리 인사

---

## 📂 프로젝트 구조

```
hiradio/
├── backend/
│   ├── main.py              # FastAPI 서버
│   └── core/config.py       # 환경 변수
├── frontend/
│   └── src/
│       ├── components/      # React 컴포넌트
│       ├── api.ts           # API 클라이언트
│       └── types.ts         # TypeScript 타입
├── .env.template
├── requirements.txt
└── README.md
```

---

## 🐛 문제 해결

**YouTube API 403 에러**
- Google Cloud Console → YouTube Data API v3 활성화
- API 할당량 확인 (일일 10,000 units)

**TTS 재생 안 됨**
- 네이버 클로바 TTS API 키 확인
- 브라우저 자동 재생 정책 확인

**경로 검색 실패**
- ODsay, Kakao API 키 확인
- 정확한 장소명 입력 (예: "강남역", "서울역")

---

## 🔒 보안

⚠️ **`.env` 파일을 절대 Git에 커밋하지 마세요!**

---

## 📄 라이선스

MIT License

---

<div align="center">

### 💝 Made with Love

**Cursor Hackathon 2025**

[![GitHub](https://img.shields.io/badge/GitHub-chanbyeong0-181717?style=flat-square&logo=github)](https://github.com/chanbyeong0)
[![Cursor](https://img.shields.io/badge/Built%20with-Cursor%20AI-blueviolet?style=flat-square)](https://cursor.sh)

*출근길이 즐거워지는 순간, ONAIR와 함께* ✨

</div>
