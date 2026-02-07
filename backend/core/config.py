"""
Azure OpenAI 설정 (kyobo2 참고)
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings

# cursor_hackathon 루트 = backend의 부모
_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _ROOT / ".env"


class Settings(BaseSettings):
    """애플리케이션 설정"""

    # Azure OpenAI
    azure_openai_api_version: str = "2024-12-01-preview"
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""

    # 모델
    model_name: str = "gpt-4o"
    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.95

    # 서버
    app_port: int = 9100

    # 음악 검색 (YouTube Data API 키, Deezer는 키 불필요)
    youtube_api_key: str = ""

    # 뉴스 (딥서치 국내 뉴스 API 키)
    deepsearch_news_api_key: str = ""

    # TTS (네이버 클로바 TTS Premium)
    ncp_tts_client_id: str = ""
    ncp_tts_client_secret: str = ""

    # 장소 자동완성 (Kakao 로컬 API)
    kakao_rest_key: str = ""

    # 대중교통 경로 검색 (ODsay API)
    odsay_api_key: str = ""

    # 서울시 지하철 실시간 도착정보 (공공데이터)
    seoul_subway_api_key: str = ""

    class Config:
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
