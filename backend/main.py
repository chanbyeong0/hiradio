"""
Azure OpenAI 연동 FastAPI 서버 (kyobo2 구조 참고)
- 프론트에서 API 키를 노출하지 않고 채팅/완성 요청 가능
- GET /weather: 날씨 API (Open-Meteo, 재사용 가능)
"""
import logging
import xml.etree.ElementTree as ET
from urllib.parse import quote

import httpx
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, Response
from fastapi import Request
from pydantic import BaseModel
from typing import Optional
from openai import AzureOpenAI

# 프로젝트 루트(cursor_hackathon)에서 실행 시 .env 로드
import os
import sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
os.chdir(ROOT)

from backend.core import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cursor Hackathon API",
    description="Azure OpenAI 연동 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """모든 미처리 예외 → JSON 응답 (CORS 헤더 포함)"""
    logger.exception("미처리 예외: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "error": "internal_error"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


def get_azure_client():
    if not settings.azure_openai_api_key or not settings.azure_openai_endpoint:
        return None
    return AzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        timeout=60.0,
    )


# --- 날씨 API (Open-Meteo, 재사용) ---
WEATHER_CODE_KO = {
    0: "맑음", 1: "대체로 맑음", 2: "약간 흐림", 3: "흐림",
    45: "안개", 48: "서리 안개",
    51: "이슬비", 53: "이슬비", 55: "이슬비",
    61: "비", 63: "비", 65: "폭우",
    66: "진눈깨비", 67: "진눈깨비",
    71: "눈", 73: "눈", 75: "눈", 77: "눈알",
    80: "소나기", 81: "소나기", 82: "폭우",
    85: "눈 소나기", 86: "눈 소나기",
    95: "뇌우", 96: "뇌우+우박", 99: "뇌우+우박",
}
RAIN_CODES = {51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 85, 86, 95, 96, 99, 71, 73, 75, 77}


def _weather_code_ko(code: int) -> str:
    return WEATHER_CODE_KO.get(code, "알 수 없음")


def _get_today_rain_by_slot(hourly: dict) -> dict | None:
    if not hourly or not hourly.get("time"):
        return None
    times = hourly["time"]
    codes = hourly.get("weather_code") or []
    precip = hourly.get("precipitation") or []
    morning = {"rain": False, "max_precip": 0}
    afternoon = {"rain": False, "max_precip": 0}
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    for i, t in enumerate(times):
        if not isinstance(t, str) or not t.startswith(today):
            continue
        hour = int(t[11:13]) if len(t) >= 13 else 0
        p = precip[i] if i < len(precip) else 0
        is_rain = (p and float(p) > 0) or (codes[i] if i < len(codes) else 0) in RAIN_CODES
        if 6 <= hour < 12:
            if is_rain:
                morning["rain"] = True
            morning["max_precip"] = max(morning["max_precip"], float(p) if p else 0)
        elif 12 <= hour < 18:
            if is_rain:
                afternoon["rain"] = True
            afternoon["max_precip"] = max(afternoon["max_precip"], float(p) if p else 0)
    return {"morning": morning, "afternoon": afternoon}


def _format_slot_rain(label: str, slot: dict) -> str:
    if not slot.get("rain"):
        return f"{label} 비 예보 없음"
    mm = f" (최대 {slot['max_precip']:.0f}mm)" if slot.get("max_precip") else ""
    return f"☔ {label} 비/눈 예보 있음{mm}"


async def fetch_weather_text(lat: float = 37.5665, lon: float = 126.9780, location_name: str = "서울") -> str:
    """날씨 정보 가져오기 (타임아웃 및 예외 처리 개선)"""
    try:
        lat5 = round(lat * 1e5) / 1e5
        lon5 = round(lon * 1e5) / 1e5
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat5}&longitude={lon5}&current=temperature_2m,weather_code&hourly=weather_code,precipitation&timezone=Asia/Seoul"
        # 타임아웃을 30초로 증가 (연결 10초 + 읽기 20초)
        timeout = httpx.Timeout(10.0, connect=10.0, read=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        cur = data.get("current") or {}
        temp = cur.get("temperature_2m")
        code = cur.get("weather_code")
        if temp is None or code is None:
            logger.warning("날씨 API 응답에 온도 또는 날씨 코드가 없습니다.")
            return f"오늘 {location_name} 날씨 정보를 확인할 수 없습니다."
        main_line = f"오늘 {location_name} {round(float(temp))}°C {_weather_code_ko(int(code))}"
        rain_slot = _get_today_rain_by_slot(data.get("hourly") or {})
        if not rain_slot:
            return main_line
        m = _format_slot_rain("오전(출근길)", rain_slot["morning"])
        a = _format_slot_rain("오후", rain_slot["afternoon"])
        return f"{main_line}\n{m}\n{a}"
    except httpx.TimeoutException as e:
        logger.warning(f"날씨 API 타임아웃: {e}")
        return f"오늘 {location_name} 날씨 정보를 가져오는 중 시간이 초과되었습니다."
    except httpx.ConnectTimeout as e:
        logger.warning(f"날씨 API 연결 타임아웃: {e}")
        return f"오늘 {location_name} 날씨 정보를 가져오는 중 연결 시간이 초과되었습니다."
    except httpx.RequestError as e:
        logger.warning(f"날씨 API 요청 오류: {e}")
        return f"오늘 {location_name} 날씨 정보를 가져오는 중 오류가 발생했습니다."
    except Exception as e:
        logger.exception(f"날씨 정보 수집 중 예외 발생: {e}")
        return f"오늘 {location_name} 날씨 정보를 가져올 수 없습니다."


# --- 음악 API (Deezer / YouTube, 재사용) ---
DEEZER_BASE = "https://api.deezer.com"
YOUTUBE_SEARCH = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS = "https://www.googleapis.com/youtube/v3/videos"


def _parse_iso_duration(iso: str) -> int:
    """PT1H2M30S -> 초"""
    import re
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    h, m_, s = int(m.group(1) or 0), int(m.group(2) or 0), int(m.group(3) or 0)
    return h * 3600 + m_ * 60 + s


def _normalize_deezer_tracks(raw: list) -> list:
    return [
        {
            "id": t.get("id"),
            "name": t.get("title") or t.get("title_short") or "-",
            "artists": [{"name": (t.get("artist") or {}).get("name") or "Unknown"}],
            "preview_url": t.get("preview") or t.get("preview_url"),
        }
        for t in (raw or [])
        if t and (t.get("preview") or t.get("preview_url"))
    ]


async def fetch_deezer_chart() -> list:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{DEEZER_BASE}/chart/0/tracks", params={"limit": 50})
        r.raise_for_status()
        data = r.json()
    tracks_obj = data.get("tracks")
    if isinstance(tracks_obj, list):
        raw = tracks_obj
    elif isinstance(tracks_obj, dict):
        raw = tracks_obj.get("data", [])
    else:
        raw = data.get("data", [])
    return _normalize_deezer_tracks(raw if isinstance(raw, list) else [])


async def fetch_deezer_search(q: str, limit: int = 30) -> list:
    if not (q or q.strip()):
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{DEEZER_BASE}/search", params={"q": q.strip()[:200], "limit": limit})
        r.raise_for_status()
        data = r.json()
    raw = data.get("data") or []
    return _normalize_deezer_tracks(raw)


async def fetch_youtube_search(q: str, min_duration_sec: int = 120, max_results: int = 15) -> list:
    """YouTube 음악 검색. 2분 이상인 영상 우선, 없으면 전체 반환. API 키 필요."""
    if not (settings.youtube_api_key and q and q.strip()):
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        # videoCategoryId만 제거 (한글 검색 시 결과 나오도록). short = 4분 미만으로 짧은 곡만
        r = await client.get(
            YOUTUBE_SEARCH,
            params={
                "part": "snippet",
                "type": "video",
                "videoDuration": "short",
                "maxResults": max_results,
                "q": (q.strip()[:200] + " 음악"),
                "key": settings.youtube_api_key,
            },
        )
        r.raise_for_status()
        data = r.json()
        items = data.get("items") or []
        candidates = [
            {"videoId": it.get("id", {}).get("videoId"), "title": (it.get("snippet") or {}).get("title", "-"), "channelTitle": (it.get("snippet") or {}).get("channelTitle", "-")}
            for it in items
            if it.get("id", {}).get("videoId")
        ]
        if not candidates:
            return []
        ids = [c["videoId"] for c in candidates[:50]]
        r2 = await client.get(
            YOUTUBE_VIDEOS,
            params={"part": "contentDetails", "id": ",".join(ids), "key": settings.youtube_api_key},
        )
        if r2.status_code != 200:
            return [{"videoId": c["videoId"], "title": c["title"], "channelTitle": c["channelTitle"], "duration_seconds": 0} for c in candidates]
        detail = r2.json()
        id_to_dur = {}
        for v in detail.get("items") or []:
            dur_iso = (v.get("contentDetails") or {}).get("duration")
            if v.get("id"):
                id_to_dur[v["id"]] = _parse_iso_duration(dur_iso)
        out = [{"videoId": c["videoId"], "title": c["title"], "channelTitle": c["channelTitle"], "duration_seconds": id_to_dur.get(c["videoId"], 0)} for c in candidates if id_to_dur.get(c["videoId"], 0) >= min_duration_sec]
        return out if out else [{**c, "duration_seconds": id_to_dur.get(c["videoId"], 0)} for c in candidates]


# --- 뉴스 API (딥서치 국내 뉴스, 재사용) ---
NEWS_BASE = "https://api-v2.deepsearch.com"
NEWS_SECTIONS_ALL = "economy,society,politics,tech,culture,world,entertainment,opinion"


def _normalize_article(a: dict) -> dict:
    return {
        "title": (a.get("title") or a.get("subject") or a.get("headline") or "").strip(),
        "url": a.get("content_url") or a.get("url") or a.get("link") or a.get("article_url") or a.get("web_url") or "",
        "publishedAt": a.get("published_at") or a.get("publishedAt") or a.get("date") or a.get("created_at"),
        "source": a.get("publisher") or a.get("author") or (a.get("source") or {}).get("name") or (a.get("source") or {}).get("name_kr") or a.get("source_name") or "",
        "summary": (a.get("summary") or "").strip(),
    }


async def fetch_news(section: str = "all", page_size: int = 15) -> list:
    if not settings.deepsearch_news_api_key:
        logger.warning("DEEPSEARCH_NEWS_API_KEY가 설정되지 않았습니다. 뉴스 API를 사용할 수 없습니다.")
        return []
    sections = NEWS_SECTIONS_ALL if section == "all" or not section else section.strip()
    from datetime import datetime, timedelta
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{NEWS_BASE}/v1/articles/{sections}"
            params = {"date_from": today, "date_to": today, "page": 1, "page_size": page_size, "api_key": settings.deepsearch_news_api_key}
            r = await client.get(url, params=params)
            if r.status_code != 200:
                logger.warning(f"뉴스 API 호출 실패: HTTP {r.status_code} (section={section})")
                return []
            data = r.json()
            arr = data.get("data") if isinstance(data.get("data"), list) else []
            if not arr:
                params["date_from"] = yesterday
                r2 = await client.get(url, params=params)
                if r2.status_code != 200:
                    logger.warning(f"뉴스 API 호출 실패 (어제 포함): HTTP {r2.status_code}")
                    return []
                data = r2.json()
                arr = data.get("data") if isinstance(data.get("data"), list) else []
            out = []
            for a in arr or []:
                row = _normalize_article(a)
                if row["title"] and row["url"]:
                    out.append(row)
            logger.info(f"뉴스 수집 성공: {len(out)}건 (section={section})")
            return out
    except Exception as e:
        logger.exception(f"뉴스 API 호출 중 예외 발생: {e}")
        return []


class NewsItemForScript(BaseModel):
    title: str
    summary: str = ""


class RadioScriptRequest(BaseModel):
    weather_text: Optional[str] = None  # 없으면 백엔드에서 가져옴
    news_items: Optional[list[NewsItemForScript]] = None  # 없으면 백엔드에서 가져옴 (최대 3개)
    news_section: str = "all"  # 뉴스 섹션 (all, politics, economy, ...)


class GreetingScriptRequest(BaseModel):
    weather_text: Optional[str] = None  # 없으면 백엔드에서 가져옴
    user_name: Optional[str] = None  # 사용자 이름 (선택)
    dj_name: Optional[str] = None  # DJ 이름 (예: 커돌이, 커순이) — 인사말 맨 앞 "DJ OO입니다~" 소개용


class NewsScriptRequest(BaseModel):
    news_items: Optional[list[NewsItemForScript]] = None  # 없으면 백엔드에서 가져옴 (최대 3개)
    news_section: str = "all"
    previous_greeting: Optional[str] = None  # 이전 인사말 (톤 유지용)


class ClosingScriptRequest(BaseModel):
    previous_script: Optional[str] = None  # 이전 스크립트 전체 (인사말 + 뉴스)


class NavRouteRequest(BaseModel):
    """대중교통 경로 검색: 출발지(집) → 도착지(회사)"""
    start: str  # 출발지 장소명/주소 (집 주소)
    end: str    # 도착지 장소명/주소 (회사 위치)
    opt: int = 0  # 0=추천, 1=최소시간, 2=최소환승


class TTSRequest(BaseModel):
    """TTS 요청: 텍스트를 음성(MP3)으로 변환 (네이버 클로바 TTS Premium)"""
    text: str
    speaker: Optional[str] = "vhyeri"  # vhyeri(여), nes_c_kihyo(남)
    speed: Optional[str] = "0"
    volume: Optional[str] = "0"
    pitch: Optional[str] = "0"
    format: Optional[str] = "mp3"


class RadioScriptResponse(BaseModel):
    script: str


def _build_greeting_prompt(
    weather_text: str, user_name: Optional[str] = None, dj_name: Optional[str] = None
) -> tuple[str, str]:
    """인사말 프롬프트 (날씨 포함). dj_name이 있으면 맨 앞에 'DJ OO입니다~' 소개 포함."""
    system = """당신은 아침 라디오 DJ입니다. 청취자에게 친근하고 유쾌하게 말하는 스타일로,
**아침 출근길 인사말과 날씨 안내**를 작성해 주세요.

## 작성 요령
1. **DJ 소개 (필수)**: 대본 **맨 첫 문장**은 반드시 "안녕하세요, DJ [DJ이름]입니다~" 또는 "좋은 아침입니다, DJ [DJ이름]이에요~" 형태로, 청취자에게 DJ 이름을 소개하는 한 문장으로 시작하세요. DJ이름은 아래에 따로 적어 드립니다.
2. 밝고 친근한 인사: 그 다음 "좋은 아침입니다", "오늘도 출근길" 같은 인사로 이어가세요.
3. 출근길 응원: 오늘도 출근길 힘내시라는 한 마디를 자연스럽게 넣어 주세요.
3. 날씨 안내: **아래 "오늘 날씨"에 적힌 내용만** DJ가 말하듯 한 문단으로 소개하세요.
   - "오늘 날씨는 ~~~" 형태로 자연스럽게 풀어서 말하세요.
   - 제공된 날씨 문구를 정확히 반영하세요. 없는 내용을 지어내지 마세요.
   - "오전(출근길) 비 예보 없음"이면 비·우산 언급하지 마세요.
   - "비 예보 있음"이 있을 때만 우산·우비 안내를 넣으세요.

## 형식
- 말하는 대본 형식 (따옴표 없이, DJ가 읽을 문장만).
- 적당한 길이 (200~400자 내외).
- 이모지나 마크다운 없이 순수 텍스트만.
   - **마무리 시 "뉴스를 전해드릴게요", "이제 뉴스" 등 뉴스 언급 금지.** 인사말 다음에는 추천 곡 소개가 나오므로, 날씨 안내만 하고 자연스럽게 끝내세요. (예: "오늘도 좋은 하루 되세요" 또는 "그럼 출근길 조심하세요" 같은 한 마디로 마무리.)"""

    name_part = f" (청취자 이름: {user_name})" if user_name else ""
    dj_part = f"\n## DJ 이름 (맨 첫 문장에서 반드시 소개)\n{dj_name}" if dj_name else ""
    user = f"""## 오늘 날씨 (아래 문구만 사용하고, 없는 내용은 추가하지 마세요)
{weather_text or '(날씨 정보 없음)'}
{dj_part}

위 날씨 정보만 반영해서 아침 라디오 인사말과 날씨 안내를 작성해 주세요. 마지막에 뉴스 얘기하지 마세요. 첫 문장은 반드시 DJ 이름을 소개하는 문장으로 시작하세요.{name_part}"""
    return system, user


def _build_news_prompt(news_items: list[dict], previous_greeting: Optional[str] = None) -> tuple[str, str]:
    """뉴스 멘트 프롬프트 (이전 인사말 톤 유지) — 단일 대본용 레거시"""
    system = """당신은 아침 라디오 DJ입니다. 청취자에게 친근하고 유쾌하게 말하는 스타일로,
**주요 뉴스 3건을 중립적이고 객관적으로** 소개하는 멘트를 작성해 주세요.

## 작성 요령
1. 톤 유지: 이전 인사말의 톤과 스타일을 자연스럽게 유지하세요.
2. 뉴스 소개: 각 뉴스를 **최소 3~4문장 이상**으로 상세히 소개하세요.
   - 제목만 읽지 말고, 제공된 요약 내용을 바탕으로 **배경, 상황, 의미, 영향** 등을 자연스럽게 풀어서 설명하세요.
   - **중립적이고 객관적인 톤**을 유지하세요. 특정 의견이나 편향을 드러내지 마세요.
   - 재밌고 이해하기 쉽게, 마치 친구에게 설명하듯이 말하세요.
   - 뉴스 내용을 그대로 전달하되, 부정적이거나 선정적인 표현은 피하세요.
3. 뉴스 간 전환: "다음 뉴스는요~", "이번엔 ~~~ 소식입니다" 같은 자연스러운 연결 문구를 사용하세요.
4. 마무리: 뉴스 소개 후 자연스럽게 마무리로 이어질 수 있도록 끝내세요.

## 형식
- 말하는 대본 형식 (따옴표 없이, DJ가 읽을 문장만).
- 적당한 길이 (600~1000자 내외, 뉴스 3건 기준).
- 이모지나 마크다운 없이 순수 텍스트만.
- 중립적이고 긍정적인 톤을 유지하세요."""

    if previous_greeting:
        context = f"""## 이전 인사말 (톤과 스타일 참고)
{previous_greeting[:500]}

위 인사말의 톤과 스타일을 유지하면서 뉴스를 소개해 주세요.

"""
    else:
        context = ""

    if news_items:
        news_block = "\n\n".join(
            f"[뉴스 {i+1}]\n제목: {it.get('title', '')}\n요약: {it.get('summary', '') or '(요약 없음)'}"
            for i, it in enumerate(news_items[:3])
        )
    else:
        news_block = "(뉴스 없음 - 오늘 수집된 뉴스가 없습니다)"

    user = f"""{context}## 주요 뉴스 (제목 + 요약)
{news_block}

위 뉴스들을 상세하고 길게 소개하는 멘트를 작성해 주세요. 뉴스가 없으면 "오늘은 특별한 뉴스가 없네요" 정도로 짧게 마무리하세요."""
    return system, user


def _build_news_segments_prompt(
    news_items: list[dict], dj_name: Optional[str] = None
) -> tuple[str, str]:
    """뉴스 N건을 각각 짧은 멘트 N개로 생성. 인사말 없음. DJ가 진행하듯 멘트 사이 자연스럽게 연결."""
    dj_intro = (
        f' 첫 문장은 "DJ {dj_name}이 전해드리는 오늘의 뉴스입니다." 또는 비슷한 한 줄로 시작하세요.'
        if dj_name
        else ""
    )
    system = """당신은 아침 라디오 DJ입니다. **인사말은 이미 끝난 뒤**이므로 인사말을 쓰지 마세요.
뉴스 항목들을 **멘트 N개**로 나눠서, 실제 DJ가 진행하듯 **한 건씩** 짧고 자연스럽게 소개해 주세요.

## 필수 규칙
- 인사말·날씨·"안녕하세요" 등 넣지 마세요. 곧바로 뉴스 진행만 하세요.
- 출력은 반드시 **멘트 개수만큼**만 내보내세요. 멘트와 멘트 사이에는 정확히 한 줄만 쓰세요: ---NEXT---

## 멘트별 작성 요령
1. **첫 번째 멘트**: 뉴스 코너 오프닝 한 줄 + 1번 뉴스만 소개.""" + dj_intro + """ (예: "이제 오늘의 뉴스를 전해드립니다. 첫 소식은 ~입니다. ...") — 2~4문장, 150~250자 내외.
2. **두 번째 멘트**: 이전 멘트에서 이어지듯 한 줄 브릿지 + 2번 뉴스만 (예: "다음 뉴스입니다." / "이번엔 ~ 쪽 소식인데요." 그다음 2번 뉴스 내용) — 2~4문장, 150~250자.
3. **세 번째 멘트**: 이전에서 이어지는 한 줄 + 3번 뉴스 + 코너 마무리 한 줄 (예: "마지막으로 ~ 소식입니다. ... 이상 오늘의 뉴스였습니다.") — 2~4문장, 150~250자.

## 톤
- 중립·객관, 친근하고 말걸듯한 DJ 톤. 선정·부정 표현 금지.
- 말하는 대본만 (따옴표·이모지·마크다운 없음).

## 출력 형식 (반드시 준수)
[첫 번째 멘트 전체 텍스트]
---NEXT---
[두 번째 멘트 전체 텍스트]
---NEXT---
[세 번째 멘트 전체 텍스트]"""

    if news_items:
        news_block = "\n\n".join(
            f"[뉴스 {i+1}]\n제목: {it.get('title', '')}\n요약: {it.get('summary', '') or '(요약 없음)'}"
            for i, it in enumerate(news_items[:3])
        )
    else:
        news_block = "(뉴스 없음)"

    user = f"""## 뉴스 3건 (각각 한 멘트씩만 사용)
{news_block}

위 뉴스만 사용해서, 위 규칙대로 ---NEXT--- 로 구분된 멘트 3개만 출력하세요. 인사말·날씨 말하지 마세요."""
    return system, user


def _build_closing_prompt(previous_script: Optional[str] = None) -> tuple[str, str]:
    """마무리말 프롬프트 (도착 시)"""
    system = """당신은 아침 라디오 DJ입니다. 청취자에게 친근하고 유쾌하게 말하는 스타일로,
**도착했을 때의 마무리 인사말**을 작성해 주세요.

## 작성 요령
1. 톤 유지: 이전 스크립트(인사말, 뉴스)의 톤과 스타일을 자연스럽게 유지하세요.
2. 도착 축하: "도착하셨네요!", "목적지에 도착하셨습니다" 같은 축하 메시지를 넣어 주세요.
3. 오늘 하루 응원: 짧고 따뜻한 응원 메시지로 마무리하세요.
   - "오늘 하루도 힘내세요", "좋은 하루 되세요" 같은 밝은 메시지.
4. 자연스러운 마무리: "그럼 오늘 하루도 파이팅!", "다음에 또 만나요" 같은 친근한 마무리.

## 형식
- 말하는 대본 형식 (따옴표 없이, DJ가 읽을 문장만).
- 적당한 길이 (100~200자 내외).
- 이모지나 마크다운 없이 순수 텍스트만."""

    if previous_script:
        context = f"""## 이전 스크립트 (톤과 스타일 참고)
{previous_script[:800]}

위 스크립트의 톤과 스타일을 유지하면서 도착 마무리 인사말을 작성해 주세요.

"""
    else:
        context = ""

    user = f"""{context}도착했을 때의 마무리 인사말을 작성해 주세요."""
    return system, user


def _build_radio_script_prompt(weather_text: str, news_items: list[dict]) -> tuple[str, str]:
    """시스템 프롬프트와 사용자 메시지 반환 (DJ 아침 라디오 스크립트용)"""
    system = """당신은 아침 라디오 DJ입니다. 청취자에게 친근하고 유쾌하게 말하는 스타일로,
아래에 제공되는 '오늘 날씨'와 '주요 뉴스 3건(제목+요약)'**만** 활용해 **아침 출근길 라디오 스크립트**를 작성해 주세요.

## ⚠️ 날씨 규칙 (필수)
- **제공된 날씨 문구를 정확히 반영하세요.** 제공된 텍스트에 없는 내용을 지어내지 마세요.
- "오전(출근길) 비 예보 없음", "오후 비 예보 없음"이면 **비가 온다고 말하지 마세요.** 우산/퇴근길 비 안내도 하지 마세요.
- "비 예보 있음"이 있을 때만 우산·우비 안내를 넣으세요.
- 기온·날씨 상태(맑음, 흐림 등)는 제공된 문구를 DJ 말투로만 풀어서 쓰세요.

## 작성 요령
1. 인사: "안녕하세요~", "좋은 아침입니다" 같은 밝은 인사로 시작하세요.
2. 출근길 응원: 오늘도 출근길 힘내시라는 한 마디를 자연스럽게 넣어 주세요.
3. 날씨: **아래 "오늘 날씨"에 적힌 내용만** DJ가 말하듯 한 문단으로 소개하세요. (예: "오늘 날씨는 ~~~" 형태)
4. 뉴스: 주요 뉴스 3건을 **각각 상세하고 길게** 소개하세요. 
   - 각 뉴스마다 **최소 3~4문장 이상**으로 구성하세요.
   - 제목만 읽지 말고, 제공된 요약 내용을 바탕으로 **배경, 상황, 의미, 영향** 등을 자연스럽게 풀어서 설명하세요.
   - 재밌고 이해하기 쉽게, 마치 친구에게 설명하듯이 말하세요.
   - 뉴스 간 전환은 "다음 뉴스는요~", "이번엔 ~~~ 소식입니다" 같은 자연스러운 연결 문구를 사용하세요.
5. 마무리: 짧게 오늘 하루 응원 메시지로 끝내 주세요.

## 형식
- 말하는 대본 형식 (따옴표 없이, DJ가 읽을 문장만).
- 적당한 길이(출근길 2~3분 분량, 800~1200자 내외). 뉴스가 많으면 더 길어도 됩니다.
- 이모지나 마크다운 없이 순수 텍스트만."""

    if news_items:
        news_block = "\n\n".join(
            f"[뉴스 {i+1}]\n제목: {it.get('title', '')}\n요약: {it.get('summary', '') or '(요약 없음)'}"
            for i, it in enumerate(news_items[:3])
        )
    else:
        news_block = "(뉴스 없음 - 오늘 수집된 뉴스가 없습니다)"
    user = f"""## 오늘 날씨 (아래 문구만 사용하고, 없는 내용은 추가하지 마세요)
{weather_text or '(날씨 정보 없음)'}

## 주요 뉴스 (제목 + 요약)
{news_block}

위 날씨·뉴스만 반영해서 아침 라디오 DJ 대본을 작성해 주세요. 날씨는 제공된 문구대로만 말하고, '비 예보 없음'이면 비·우산 언급하지 마세요. 뉴스가 없으면 뉴스 섹션을 생략하고 날씨와 응원 메시지만으로 마무리하세요."""
    return system, user


@app.get("/")
async def root(request: Request):
    """브라우저로 열면 안내 페이지, API 클라이언트는 JSON"""
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        html = """
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Cursor Hackathon API</title></head>
        <body style="font-family:sans-serif; max-width:600px; margin:40px auto; padding:20px;">
        <h1>✅ 서버 정상 동작 중</h1>
        <p>Cursor Hackathon API (Azure OpenAI)가 실행 중입니다.</p>
        <ul>
        <li><a href="/health">/health</a> — Azure 설정 여부 확인</li>
        <li><a href="/weather">/weather</a> — 날씨 API (Open-Meteo)</li>
        <li><a href="/music/chart">/music/chart</a> — Deezer 인기 차트</li>
        <li><a href="/music/search?q=test&source=deezer">/music/search</a> — 노래 검색 (deezer / youtube)</li>
        <li><a href="/news">/news</a> — 국내 뉴스 (딥서치)</li>
        <li><a href="/radio-script/ready">/radio-script/ready</a> — 라디오 스크립트 서버 응답 테스트</li>
        <li><strong>라디오 스크립트 (세분화):</strong></li>
        <li><a href="/radio-script/greeting">POST /radio-script/greeting</a> — 인사말 스크립트</li>
        <li><a href="/radio-script/news">POST /radio-script/news</a> — 뉴스 멘트 스크립트</li>
        <li><a href="/radio-script/closing">POST /radio-script/closing</a> — 마무리말 스크립트</li>
        <li><a href="/tts">POST /tts</a> — TTS (텍스트 → MP3, 클로바 TTS)</li>
        </ul>
        <p>라디오 스크립트는 웹앱 페이지에서 <strong>라디오 스크립트 생성</strong> 버튼으로 사용하세요.</p>
        </body></html>
        """
        return HTMLResponse(html)
    return {"status": "ok", "service": "cursor_hackathon_api"}


@app.get("/health")
async def health():
    """Azure OpenAI 연결 가능 여부 확인"""
    client = get_azure_client()
    return {
        "status": "healthy" if client else "no_azure_config",
        "azure_configured": bool(client),
    }


KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
ODSAY_BASE = "https://api.odsay.com/v1/api"


async def geocode_place(query: str) -> tuple[float, float]:
    """장소명/주소 → (경도 x, 위도 y). Kakao 주소 검색 후 키워드 검색."""
    if not settings.kakao_rest_key or not query or not query.strip():
        raise ValueError("장소를 찾을 수 없습니다.")
    q = query.strip()[:200]
    headers = {"Authorization": f"KakaoAK {settings.kakao_rest_key}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        for url in (KAKAO_ADDRESS_URL, KAKAO_KEYWORD_URL):
            r = await client.get(url, headers=headers, params={"query": q})
            if r.status_code != 200:
                continue
            data = r.json()
            docs = data.get("documents") or []
            if docs:
                d = docs[0]
                return float(d["x"]), float(d["y"])
    raise ValueError(f"좌표를 찾을 수 없음: {query}")


def _extract_nav_summary(best_path: dict) -> dict:
    info = best_path.get("info") or {}
    return {
        "total_time_min": int(info.get("totalTime", 0)),
        "payment_won": int(info.get("payment", 0)),
        "bus_transit_count": int(info.get("busTransitCount", 0)),
        "subway_transit_count": int(info.get("subwayTransitCount", 0)),
        "total_walk_m": int(info.get("totalWalk", 0)),
        "total_distance_m": int(info.get("totalDistance", 0)),
        "first_start_station": str(info.get("firstStartStation", "")),
        "last_end_station": str(info.get("lastEndStation", "")),
    }


def _extract_nav_legs(best_path: dict) -> list:
    legs = []
    for sp in best_path.get("subPath") or []:
        lane = sp.get("lane")
        line_name = ""
        if isinstance(lane, dict):
            line_name = lane.get("name", "")
        elif isinstance(lane, list) and lane and isinstance(lane[0], dict):
            line_name = lane[0].get("name", "")
        if not line_name and sp.get("trafficType") == 1:
            sc = sp.get("subwayCode")
            if sc:
                line_name = f"{sc}호선"
        if line_name and line_name.startswith("수도권 "):
            line_name = line_name.replace("수도권 ", "")
        leg = {
            "trafficType": sp.get("trafficType"),
            "sectionTimeMin": sp.get("sectionTime"),
            "distanceM": sp.get("distance"),
            "startName": sp.get("startName"),
            "endName": sp.get("endName"),
            "stationCount": sp.get("stationCount"),
            "lineName": line_name,
        }
        pass_stop = sp.get("passStopList")
        if isinstance(pass_stop, dict):
            stations = pass_stop.get("stations") or []
            leg["stations"] = [
                {"index": s.get("index"), "stationName": s.get("stationName"), "stationID": s.get("stationID"), "x": s.get("x"), "y": s.get("y")}
                for s in stations
            ]
        legs.append(leg)
    return legs


SEOUL_SUBWAY_API_BASE = "http://swopenAPI.seoul.go.kr/api/subway"

_SUBWAY_LINE_IDS = {
    "1001": "1호선", "1002": "2호선", "1003": "3호선", "1004": "4호선",
    "1005": "5호선", "1006": "6호선", "1007": "7호선", "1008": "8호선", "1009": "9호선",
    "1061": "중앙선", "1063": "경의중앙선", "1065": "공항철도", "1067": "경춘선",
    "1075": "수인분당선", "1077": "신분당선",
}


def _get_line_name_from_id(subway_id: str) -> str:
    return _SUBWAY_LINE_IDS.get(subway_id or "", f"{subway_id}번")


def _filter_arrivals_by_direction(arrivals: list, route_info: dict) -> list:
    """경로 방향에 맞는 열차만 필터링 (test_odsay 참고)."""
    line_name = route_info.get("line", "")
    destination = (route_info.get("destination") or "").replace("역", "").strip()
    station_names = [s.replace("역", "").strip() for s in (route_info.get("stations") or []) if s]
    filtered = []
    for a in arrivals:
        arrival_line = _get_line_name_from_id(a.get("subwayId", ""))
        if arrival_line not in line_name and line_name not in arrival_line:
            continue
        train_dir = (a.get("trainLineNm") or "")
        bstatn = (a.get("bstatnNm") or "").replace("역", "").strip()
        direction_ok = False
        for st in station_names:
            if len(st) >= 2 and st in train_dir:
                direction_ok = True
                break
        if not direction_ok and bstatn and len(bstatn) >= 2:
            for st in station_names:
                if bstatn in st or st in bstatn:
                    direction_ok = True
                    break
        if not direction_ok and destination and len(destination) >= 2 and destination in train_dir:
            direction_ok = True
        if direction_ok:
            filtered.append(a)
    return filtered


async def _get_realtime_subway_arrival(station_name: str) -> list:
    """서울시 지하철 실시간 도착정보 (역명)."""
    if not settings.seoul_subway_api_key:
        return []
    cleaned = station_name.replace("역", "").strip()
    name_map = {"천호": "천호(풍납토성)"}
    final_name = name_map.get(cleaned, cleaned)
    url = f"{SEOUL_SUBWAY_API_BASE}/{settings.seoul_subway_api_key}/xml/realtimeStationArrival/0/10/{quote(final_name)}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url)
        r.encoding = "utf-8"
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.content)
        code_el = root.find(".//code")
        if code_el is not None and (code_el.text or "") != "INFO-000":
            return []
        out = []
        for row in root.findall(".//row"):
            info = {c.tag: c.text for c in row}
            out.append({
                "subwayId": info.get("subwayId", ""),
                "trainLineNm": info.get("trainLineNm", ""),
                "barvlDt": info.get("barvlDt", ""),
                "arvlMsg2": info.get("arvlMsg2", ""),
                "bstatnNm": info.get("bstatnNm", ""),
            })
        return out
    except Exception as e:
        logger.warning("지하철 실시간 조회 예외 %s: %s", station_name, e)
        return []


def _build_subway_route_info(legs: list) -> list:
    """legs에서 지하철 출발역·환승역만 추출 (실시간 조회 대상)."""
    infos = []
    for idx, leg in enumerate(legs):
        if leg.get("trafficType") != 1:
            continue
        start_name = leg.get("startName")
        line_name = leg.get("lineName", "")
        stations = [s.get("stationName") for s in (leg.get("stations") or []) if s.get("stationName")]
        if start_name:
            infos.append({
                "station": start_name,
                "line": line_name,
                "destination": leg.get("endName", ""),
                "stations": stations,
                "is_transfer": idx > 0,
            })
        end_name = leg.get("endName")
        if end_name and idx < len(legs) - 1 and legs[idx + 1].get("trafficType") == 1:
            nxt = legs[idx + 1]
            infos.append({
                "station": end_name,
                "line": nxt.get("lineName", ""),
                "destination": nxt.get("endName", ""),
                "stations": [s.get("stationName") for s in (nxt.get("stations") or []) if s.get("stationName")],
                "is_transfer": True,
            })
    return infos


async def fetch_nav_route(start_query: str, end_query: str, opt: int = 0) -> dict:
    """출발지·도착지 → 대중교통 경로 (ODsay)."""
    if not settings.odsay_api_key:
        raise ValueError("ODSAY_API_KEY가 설정되지 않았습니다.")
    sx, sy = await geocode_place(start_query)
    ex, ey = await geocode_place(end_query)
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{ODSAY_BASE}/searchPubTransPathT",
            params={"SX": sx, "SY": sy, "EX": ex, "EY": ey, "OPT": opt, "apiKey": settings.odsay_api_key},
        )
    r.raise_for_status()
    data = r.json()
    if "result" not in data or not (data["result"].get("path")):
        raise RuntimeError("경로를 찾을 수 없습니다.")
    best = data["result"]["path"][0]
    summary = _extract_nav_summary(best)
    legs = _extract_nav_legs(best)
    realtime_subway = {}
    subway_infos = _build_subway_route_info(legs)
    for route_info in subway_infos:
        station = route_info["station"]
        arrivals = await _get_realtime_subway_arrival(station)
        if arrivals:
            filtered = _filter_arrivals_by_direction(arrivals, route_info)
            if filtered:
                realtime_subway[station] = filtered
            else:
                line_name = route_info.get("line", "")
                fallback = [a for a in arrivals if _get_line_name_from_id(a.get("subwayId", "")) in line_name]
                realtime_subway[station] = fallback if fallback else arrivals
    return {
        "summary": summary,
        "legs": legs,
        "start_coords": {"x": sx, "y": sy},
        "end_coords": {"x": ex, "y": ey},
        "realtime_subway": realtime_subway,
    }


async def fetch_place_autocomplete(query: str, limit: int = 5) -> list:
    """Kakao 키워드 검색으로 장소 자동완성 결과 반환. 키 없으면 빈 리스트."""
    if not settings.kakao_rest_key or not query or not query.strip():
        return []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                KAKAO_KEYWORD_URL,
                headers={"Authorization": f"KakaoAK {settings.kakao_rest_key}"},
                params={"query": query.strip()[:100], "size": limit},
            )
        if r.status_code != 200:
            logger.warning("Kakao 자동완성 실패: status=%s", r.status_code)
            return []
        data = r.json()
        results = []
        for doc in (data.get("documents") or [])[:limit]:
            results.append({
                "name": doc.get("place_name", ""),
                "address": doc.get("road_address_name") or doc.get("address_name", ""),
                "category": doc.get("category_group_name", ""),
                "x": doc.get("x", ""),
                "y": doc.get("y", ""),
            })
        return results
    except Exception as e:
        logger.exception("장소 자동완성 예외: %s", e)
        return []


@app.get("/place/autocomplete")
async def place_autocomplete(q: str = Query("", description="검색어")):
    """장소 자동완성 (Kakao 로컬 API). 설정 화면 집/회사 위치 입력용."""
    try:
        results = await fetch_place_autocomplete(q, limit=5)
        return {"results": results}
    except Exception as e:
        logger.exception("place/autocomplete 예외: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "results": []},
            headers={"Access-Control-Allow-Origin": "*"},
        )


@app.post("/nav/route")
async def nav_route(request: NavRouteRequest):
    """대중교통 경로 검색 (출발지=집 주소, 도착지=회사 위치). ODsay API."""
    try:
        result = await fetch_nav_route(request.start.strip(), request.end.strip(), request.opt)
        return result
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"detail": str(e), "error": "nav_route_error"},
            headers={"Access-Control-Allow-Origin": "*"},
        )
    except Exception as e:
        logger.exception("nav/route 예외: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "nav_route_error"},
            headers={"Access-Control-Allow-Origin": "*"},
        )


@app.get("/weather")
async def weather(
    lat: float = Query(37.5665, description="위도"),
    lon: float = Query(126.9780, description="경도"),
    location_name: str = Query("서울", description="위치 이름"),
):
    """날씨 API. Open-Meteo 기반, 라디오 스크립트 등 재사용 가능."""
    try:
        text = await fetch_weather_text(lat, lon, location_name)
        return {"weather_text": text}
    except Exception as e:
        logger.exception("날씨 API 호출 실패: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "weather_fetch_failed"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


@app.get("/music/chart")
async def music_chart():
    """Deezer 인기 차트 (트랙 목록, 미리듣기 URL 포함)."""
    try:
        tracks = await fetch_deezer_chart()
        return {"tracks": tracks}
    except Exception as e:
        logger.exception("음악 차트 조회 실패: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "music_chart_failed"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


@app.get("/music/search")
async def music_search(
    q: str = Query(..., description="검색어"),
    source: str = Query("deezer", description="deezer | youtube"),
):
    """노래 검색. source=deezer → Deezer 트랙 목록, source=youtube → YouTube 영상 목록(2분 이상)."""
    try:
        if source == "youtube":
            if not settings.youtube_api_key:
                return JSONResponse(
                    status_code=503,
                    content={"detail": "YOUTUBE_API_KEY가 설정되지 않았습니다. .env에 YOUTUBE_API_KEY를 추가해주세요.", "error": "youtube_api_key_missing"},
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "*",
                        "Access-Control-Allow-Headers": "*",
                    },
                )
            videos = await fetch_youtube_search(q)
            if not videos:
                logger.warning(f"YouTube 검색 결과 없음: q={q}")
            return {"source": "youtube", "videos": videos}
        if source == "deezer":
            tracks = await fetch_deezer_search(q)
            return {"source": "deezer", "tracks": tracks}
        return JSONResponse(
            status_code=400,
            content={"detail": "source는 deezer 또는 youtube"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )
    except ValueError as e:
        # API 키 누락 등 설정 오류
        logger.warning("음악 검색 설정 오류: %s", e)
        return JSONResponse(
            status_code=503,
            content={"detail": str(e), "error": "music_search_config_error"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            logger.warning("YouTube API 403: %s", e)
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "YouTube Data API v3가 활성화되지 않았거나 API 키 제한/할당량 문제입니다. Google Cloud Console에서 'YouTube Data API v3' 사용 설정을 켜주세요.",
                    "error": "youtube_403_forbidden",
                    "hint": "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        raise
    except Exception as e:
        logger.exception("음악 검색 실패: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "music_search_failed"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


async def fetch_news_per_sections(sections: list[str], per_section: int = 1) -> list:
    """여러 섹션에서 각각 per_section건씩 가져와 합친 리스트 반환."""
    if not sections:
        return await fetch_news(section="all", page_size=3)
    out = []
    for sec in sections:
        sec = (sec or "").strip()
        if not sec:
            continue
        items = await fetch_news(section=sec, page_size=per_section)
        for a in items[:per_section]:
            out.append(a)
    return out


@app.get("/news")
async def news(
    section: str = Query("all", description="단일 섹션: all | politics | economy | society | culture | world | tech | entertainment | opinion"),
    sections: Optional[str] = Query(None, description="쉼표 구분 여러 섹션. 지정 시 section 무시하고 섹션별 1건씩 조회 (예: politics,economy,society)"),
    page_size: int = Query(15, ge=1, le=50),
    per_section: int = Query(1, ge=1, le=5, description="sections 사용 시 섹션당 가져올 개수"),
):
    """국내 뉴스 API (딥서치). sections 있으면 관심 섹션별로 각각 per_section건씩 가져옴."""
    if sections:
        section_list = [s.strip() for s in sections.split(",") if s.strip()][:10]
        articles = await fetch_news_per_sections(section_list, per_section=per_section)
    else:
        articles = await fetch_news(section=section, page_size=page_size)
    return {"articles": articles}


@app.get("/radio-script/ready")
async def radio_script_ready():
    """라디오 스크립트 서버 응답 테스트 (Azure 호출 없음)."""
    return {"ok": True, "message": "서버 응답 정상. Azure 설정 여부는 GET /health 로 확인하세요."}


@app.post("/radio-script/greeting")
async def create_greeting_script(request: GreetingScriptRequest):
    """인사말 스크립트 생성 (날씨 포함). 자연스럽게 뉴스로 이어질 수 있도록 작성."""
    try:
        client = get_azure_client()
        if not client:
            return JSONResponse(
                status_code=503,
                content={"detail": "Azure OpenAI가 설정되지 않았습니다. .env에 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY를 넣어 주세요."},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        
        # 날씨: 없으면 백엔드에서 가져오기
        try:
            if request.weather_text:
                weather_text = request.weather_text[:500]
            else:
                logger.info("인사말용 날씨 정보를 백엔드에서 가져오는 중...")
                weather_text = await fetch_weather_text()
                logger.info(f"날씨 정보 수집 완료: {weather_text[:50]}...")
        except Exception as e:
            logger.exception("날씨 정보 수집 실패: %s", e)
            weather_text = "오늘 날씨 정보를 가져올 수 없습니다."
        
        # 프롬프트 생성 및 Azure OpenAI 호출
        logger.info("인사말 스크립트 프롬프트 생성 중...")
        system, user = _build_greeting_prompt(weather_text, request.user_name, request.dj_name)
        logger.info(f"프롬프트 생성 완료 (시스템: {len(system)}자, 사용자: {len(user)}자)")
        
        logger.info(f"Azure OpenAI API 호출 중... (모델: {settings.model_name})")
        resp = client.chat.completions.create(
            model=settings.model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=min(settings.max_tokens, 800),
            temperature=0.8,
            top_p=settings.top_p,
        )
        content = (resp.choices[0].message.content or "").strip()
        logger.info(f"인사말 스크립트 생성 완료 ({len(content)}자)")
        return {"script": content}
    except Exception as e:
        logger.exception("인사말 스크립트 생성 중 예외 발생: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "greeting_script_generation_failed"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


@app.post("/radio-script/news")
async def create_news_script(request: NewsScriptRequest):
    """뉴스 멘트 스크립트 생성. 이전 인사말의 톤을 유지하며 자연스럽게 연결."""
    try:
        client = get_azure_client()
        if not client:
            return JSONResponse(
                status_code=503,
                content={"detail": "Azure OpenAI가 설정되지 않았습니다. .env에 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY를 넣어 주세요."},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        
        # 뉴스: 없으면 백엔드에서 가져오기
        try:
            if request.news_items:
                news_items = [
                    {"title": (n.title or "")[:200], "summary": (n.summary or "")[:3000]}
                    for n in request.news_items[:3]
                ]
            else:
                logger.info(f"뉴스 멘트용 뉴스 정보를 백엔드에서 가져오는 중... (section={request.news_section})")
                articles = await fetch_news(section=request.news_section, page_size=3)
                logger.info(f"뉴스 {len(articles)}건 수집 완료")
                news_items = [
                    {"title": (a.get("title") or "")[:200], "summary": (a.get("summary") or "")[:3000]}
                    for a in articles[:3]
                ]
                if not news_items:
                    logger.warning(f"뉴스 수집 실패 또는 빈 결과 (section={request.news_section})")
        except Exception as e:
            logger.exception("뉴스 정보 수집 실패: %s", e)
            news_items = []
        
        # 프롬프트 생성 및 Azure OpenAI 호출
        logger.info("뉴스 멘트 스크립트 프롬프트 생성 중...")
        system, user = _build_news_prompt(news_items, request.previous_greeting)
        logger.info(f"프롬프트 생성 완료 (시스템: {len(system)}자, 사용자: {len(user)}자)")
        
        logger.info(f"Azure OpenAI API 호출 중... (모델: {settings.model_name})")
        try:
            resp = client.chat.completions.create(
                model=settings.model_name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                max_tokens=min(settings.max_tokens, 1500),
                temperature=0.8,
                top_p=settings.top_p,
            )
            content = (resp.choices[0].message.content or "").strip()
            logger.info(f"뉴스 멘트 스크립트 생성 완료 ({len(content)}자)")
            return {"script": content}
        except Exception as api_error:
            error_str = str(api_error)
            # 콘텐츠 필터링 에러 감지
            if "filtered" in error_str.lower() or "content_filter" in error_str.lower():
                logger.warning("뉴스 멘트가 콘텐츠 필터에 의해 차단되었습니다. 간단한 요약으로 대체합니다.")
                # 필터링된 경우 간단한 뉴스 요약 생성
                if news_items:
                    simple_news = "\n\n".join([
                        f"뉴스 {i+1}: {item.get('title', '')[:100]}"
                        for i, item in enumerate(news_items[:3])
                    ])
                    fallback_script = f"오늘의 주요 뉴스를 간단히 전해드리겠습니다.\n\n{simple_news}\n\n이상 오늘의 뉴스였습니다."
                else:
                    fallback_script = "오늘은 특별한 뉴스가 없네요. 여러분의 하루 속에서 좋은 소식들이 가득하길 바랍니다."
                return {"script": fallback_script}
            else:
                # 다른 에러는 그대로 전파
                raise
    except Exception as e:
        logger.exception("뉴스 멘트 스크립트 생성 중 예외 발생: %s", e)
        # 최종 폴백: 뉴스가 없을 때의 기본 메시지
        fallback_script = "오늘의 뉴스를 전해드리려고 했지만, 기술적인 문제로 상세한 내용을 전달하지 못했습니다. 여러분의 하루 속에서 좋은 소식들이 가득하길 바랍니다."
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "news_script_generation_failed", "fallback_script": fallback_script},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


class NewsSegmentsRequest(BaseModel):
    """뉴스 3건 → 멘트 3개 (인사말 없음, DJ 연결)"""
    news_items: Optional[list[NewsItemForScript]] = None
    news_section: str = "all"
    dj_name: Optional[str] = None  # DJ 이름 (첫 멘트에서 "DJ OO이 전해드리는 뉴스" 등 사용)


@app.post("/radio-script/news-segments")
async def create_news_script_segments(request: NewsSegmentsRequest):
    """뉴스 3건을 각각 짧은 멘트 3개로 생성. 인사말 없음. DJ 진행처럼 멘트 사이 자연스럽게 연결."""
    try:
        client = get_azure_client()
        if not client:
            return JSONResponse(
                status_code=503,
                content={"detail": "Azure OpenAI가 설정되지 않았습니다. .env에 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY를 넣어 주세요."},
                headers={"Access-Control-Allow-Origin": "*"},
            )
        try:
            if request.news_items:
                news_items = [
                    {"title": (n.title or "")[:200], "summary": (n.summary or "")[:3000]}
                    for n in request.news_items
                ]
            else:
                articles = await fetch_news(section=request.news_section, page_size=5)
                news_items = [
                    {"title": (a.get("title") or "")[:200], "summary": (a.get("summary") or "")[:3000]}
                    for a in articles
                ]
        except Exception as e:
            logger.exception("뉴스 수집 실패: %s", e)
            news_items = []

        if not news_items:
            return {"scripts": ["오늘은 전해드릴 뉴스가 없습니다."]}

        n = len(news_items)
        system, user = _build_news_segments_prompt(news_items, request.dj_name)
        resp = client.chat.completions.create(
            model=settings.model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=min(settings.max_tokens, 1200),
            temperature=0.8,
            top_p=settings.top_p,
        )
        content = (resp.choices[0].message.content or "").strip()
        parts = [p.strip() for p in content.split("---NEXT---") if p.strip()]
        if len(parts) >= n:
            scripts = parts[:n]
        elif len(parts) >= 1:
            scripts = parts + ["이상 오늘의 뉴스였습니다."] * (n - len(parts))
        else:
            scripts = ["오늘의 뉴스를 간단히 전해드렸습니다."] * n
        logger.info("뉴스 세그먼트 생성 완료: %d개", len(scripts))
        return {"scripts": scripts}
    except Exception as e:
        logger.exception("뉴스 세그먼트 생성 중 예외: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "news_segments_failed", "scripts": ["오늘의 뉴스를 전해드리지 못했습니다."]},
            headers={"Access-Control-Allow-Origin": "*"},
        )


@app.post("/radio-script/closing")
async def create_closing_script(request: ClosingScriptRequest):
    """마무리말 스크립트 생성 (도착 시). 이전 스크립트의 톤을 유지하며 자연스럽게 마무리."""
    try:
        client = get_azure_client()
        if not client:
            return JSONResponse(
                status_code=503,
                content={"detail": "Azure OpenAI가 설정되지 않았습니다. .env에 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY를 넣어 주세요."},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        
        # 프롬프트 생성 및 Azure OpenAI 호출
        logger.info("마무리말 스크립트 프롬프트 생성 중...")
        system, user = _build_closing_prompt(request.previous_script)
        logger.info(f"프롬프트 생성 완료 (시스템: {len(system)}자, 사용자: {len(user)}자)")
        
        logger.info(f"Azure OpenAI API 호출 중... (모델: {settings.model_name})")
        resp = client.chat.completions.create(
            model=settings.model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=min(settings.max_tokens, 500),
            temperature=0.8,
            top_p=settings.top_p,
        )
        content = (resp.choices[0].message.content or "").strip()
        logger.info(f"마무리말 스크립트 생성 완료 ({len(content)}자)")
        return {"script": content}
    except Exception as e:
        logger.exception("마무리말 스크립트 생성 중 예외 발생: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "closing_script_generation_failed"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


TTS_URL = "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts"


@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    """텍스트를 음성(MP3)으로 변환 (네이버 클로바 TTS Premium). 인사말/뉴스/마무리말 재생용."""
    if not request.text or not request.text.strip():
        return JSONResponse(
            status_code=400,
            content={"detail": "text는 비어 있을 수 없습니다."},
            headers={"Access-Control-Allow-Origin": "*"},
        )
    if not settings.ncp_tts_client_id or not settings.ncp_tts_client_secret:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "TTS가 설정되지 않았습니다. .env에 NCP_TTS_CLIENT_ID, NCP_TTS_CLIENT_SECRET을 넣어 주세요.",
            },
            headers={"Access-Control-Allow-Origin": "*"},
        )
    try:
        payload = {
            "speaker": request.speaker or "vhyeri",
            "volume": request.volume or "0",
            "speed": request.speed or "0",
            "pitch": request.pitch or "0",
            "text": request.text.strip(),
            "format": request.format or "mp3",
        }
        headers = {
            "X-NCP-APIGW-API-KEY-ID": settings.ncp_tts_client_id,
            "X-NCP-APIGW-API-KEY": settings.ncp_tts_client_secret,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(TTS_URL, data=payload, headers=headers)
        if resp.status_code != 200:
            logger.warning("TTS API 응답 오류: status=%s body=%s", resp.status_code, resp.text[:500])
            return JSONResponse(
                status_code=502,
                content={"detail": f"TTS API 오류: {resp.status_code}", "body": resp.text[:500]},
                headers={"Access-Control-Allow-Origin": "*"},
            )
        return Response(
            content=resp.content,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=tts.mp3",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as e:
        logger.exception("TTS 생성 중 예외: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "tts_failed"},
            headers={"Access-Control-Allow-Origin": "*"},
        )


@app.post("/radio-script")
async def create_radio_script(request: RadioScriptRequest):
    """날씨 + 뉴스 3건으로 DJ 스타일 아침 라디오 스크립트 생성. weather_text/news_items 없으면 백엔드에서 가져옴."""
    try:
        client = get_azure_client()
        if not client:
            return JSONResponse(
                status_code=503,
                content={"detail": "Azure OpenAI가 설정되지 않았습니다. .env에 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY를 넣어 주세요."},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                },
            )
        # 날씨: 없으면 백엔드에서 가져오기
        try:
            if request.weather_text:
                weather_text = request.weather_text[:500]
            else:
                logger.info("날씨 정보를 백엔드에서 가져오는 중...")
                weather_text = await fetch_weather_text()
                logger.info(f"날씨 정보 수집 완료: {weather_text[:50]}...")
        except Exception as e:
            logger.exception("날씨 정보 수집 실패: %s", e)
            weather_text = "오늘 날씨 정보를 가져올 수 없습니다."
        
        # 뉴스: 없으면 백엔드에서 가져오기 (요약을 길게 가져와서 DJ가 상세히 말할 수 있도록)
        try:
            if request.news_items:
                news_items = [
                    {"title": (n.title or "")[:200], "summary": (n.summary or "")[:3000]}
                    for n in request.news_items[:3]
                ]
            else:
                logger.info(f"뉴스 정보를 백엔드에서 가져오는 중... (section={request.news_section})")
                articles = await fetch_news(section=request.news_section, page_size=3)
                logger.info(f"뉴스 {len(articles)}건 수집 완료")
                news_items = [
                    {"title": (a.get("title") or "")[:200], "summary": (a.get("summary") or "")[:3000]}
                    for a in articles[:3]
                ]
                if not news_items:
                    logger.warning(f"뉴스 수집 실패 또는 빈 결과 (section={request.news_section}, api_key 설정 여부: {bool(settings.deepsearch_news_api_key)})")
        except Exception as e:
            logger.exception("뉴스 정보 수집 실패: %s", e)
            news_items = []
        
        if not news_items:
            logger.warning("뉴스 아이템이 비어있습니다. 스크립트에 뉴스가 포함되지 않을 수 있습니다.")
        
        # 프롬프트 생성 및 Azure OpenAI 호출
        logger.info("라디오 스크립트 프롬프트 생성 중...")
        system, user = _build_radio_script_prompt(weather_text, news_items)
        logger.info(f"프롬프트 생성 완료 (시스템: {len(system)}자, 사용자: {len(user)}자)")
        
        logger.info(f"Azure OpenAI API 호출 중... (모델: {settings.model_name})")
        resp = client.chat.completions.create(
            model=settings.model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=min(settings.max_tokens, 2048),
            temperature=0.8,
            top_p=settings.top_p,
        )
        content = (resp.choices[0].message.content or "").strip()
        logger.info(f"라디오 스크립트 생성 완료 ({len(content)}자)")
        return {"script": content}
    except Exception as e:
        logger.exception("라디오 스크립트 생성 중 예외 발생: %s", e)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "error": "script_generation_failed"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=settings.app_port,
        reload=True,
    )
