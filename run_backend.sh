#!/bin/bash
# cursor_hackathon 백엔드 실행 스크립트
# 컨테이너 안에서도 호스트에서도 동작

cd "$(dirname "$0")"

# 가상환경 활성화 (있는 경우)
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# .env 확인
if [ ! -f ".env" ]; then
    echo "⚠️  .env 파일이 없습니다. .env.template을 복사해 .env를 만들고 Azure 키를 넣어 주세요."
    exit 1
fi

echo "🚀 cursor_hackathon 백엔드 시작 (포트 9100)..."
echo "   브라우저: http://localhost:9100/"
echo "   중지: Ctrl+C"

uvicorn backend.main:app --host 0.0.0.0 --port 9100 --reload
