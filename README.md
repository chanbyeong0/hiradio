# ONAIR 🎙️
> 출근길을 위한 개인 맞춤형 AI 라디오

날씨, 뉴스, 음악을 제공하며, 실시간 교통 정보와 함께 출근길을 더 즐겁게 만들어드립니다.

## 주요 기능

- 🎙️ **AI 라디오** - Azure OpenAI 기반 개인 맞춤 인사말 및 뉴스 브리핑
- 🎵 **음악 추천** - 날씨/시간대별 맞춤 음악 (YouTube)
- 🚇 **실시간 교통** - 대중교통 경로 및 지하철 도착 시간
- 🔊 **TTS 음성** - 네이버 클로바 TTS 자연스러운 음성 재생
- ⚙️ **개인화** - DJ 선택, 뉴스 카테고리, 라디오:음악 비율 조절

## 기술 스택

**백엔드**
- Python 3.10+ / FastAPI / Azure OpenAI (GPT-4o)

**프론트엔드**
- React 18 + TypeScript / Vite / Tailwind CSS

**외부 API**
- Azure OpenAI, 네이버 클로바 TTS, YouTube Data API v3
- 딥서치 뉴스, Open-Meteo, Kakao 로컬, ODsay, 서울시 공공데이터

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.template .env
# .env 파일에 API 키 입력
```

**필수 API 키**
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`
- `NCP_TTS_CLIENT_ID`, `NCP_TTS_CLIENT_SECRET`

**선택 API 키** (미입력 시 일부 기능 제한)
- `YOUTUBE_API_KEY`, `DEEPSEARCH_NEWS_API_KEY`
- `KAKAO_REST_KEY`, `ODSAY_API_KEY`, `SEOUL_SUBWAY_API_KEY`

### 2. 백엔드 실행

```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 9100
```

### 3. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

앱이 `http://localhost:5173`에서 실행됩니다.

## 사용 흐름

1. **온보딩** - 이름, 출발지, 도착지, DJ, 관심 뉴스 설정
2. **미리보기** - 음악 선택
3. **재생** - 인사말 → 음악 → 뉴스 → 음악 (반복)
4. **도착** - 마무리 인사

## 프로젝트 구조

```
cursor_hackathon/
├── backend/
│   ├── main.py           # API 서버
│   └── core/config.py    # 설정
├── frontend/
│   └── src/
│       ├── components/   # React 컴포넌트
│       ├── types.ts      # 타입 정의
│       └── api.ts        # API 클라이언트
├── .env.template
├── requirements.txt
└── README.md
```

## 문제 해결

**YouTube API 403 에러**
- Google Cloud Console에서 YouTube Data API v3 활성화
- API 할당량 확인 (일일 10,000 units)

**TTS 재생 안 됨**
- 네이버 클로바 TTS API 키 확인
- 브라우저 자동 재생 정책 확인

**경로 검색 실패**
- ODsay, Kakao REST API 키 확인

## 보안

⚠️ **절대로 `.env` 파일을 Git에 커밋하지 마세요!**

## 라이선스

MIT License

---

**Made with ❤️ using Cursor AI** | Cursor Hackathon 2025
