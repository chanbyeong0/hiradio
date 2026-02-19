"""
MongoDB 데이터베이스 서비스 - 로그인 계정별 무료 토큰 관리
"""
import logging
from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from pymongo.errors import ConnectionFailure, DuplicateKeyError

from backend.core import settings

logger = logging.getLogger(__name__)

FREE_TOKENS_PER_USER = 3


class MongoDBService:
    """MongoDB 서비스 - user_tokens 컬렉션"""

    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.database: Optional[AsyncIOMotorDatabase] = None
        self.collection: Optional[AsyncIOMotorCollection] = None

    async def connect(self):
        """MongoDB 연결"""
        try:
            if not settings.mongodb_url:
                logger.warning("MONGODB_URL이 설정되지 않았습니다. 토큰 제한 없이 실행됩니다.")
                return

            self.client = AsyncIOMotorClient(
                settings.mongodb_url,
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=20000,
                socketTimeoutMS=30000,
            )
            self.database = self.client[settings.mongodb_database]
            self.collection = self.database[settings.mongodb_collection]

            await self.client.admin.command("ping")
            logger.info(f"MongoDB 연결 성공: {settings.mongodb_database}/{settings.mongodb_collection}")

            await self._create_indexes()
        except ConnectionFailure as e:
            logger.warning(f"MongoDB 연결 실패: {e}. 토큰 제한 없이 실행됩니다.")
            self.client = None
            self.database = None
            self.collection = None
        except Exception as e:
            logger.warning(f"MongoDB 초기화 오류: {e}. 토큰 제한 없이 실행됩니다.")
            self.client = None
            self.database = None
            self.collection = None

    async def disconnect(self):
        """MongoDB 연결 해제"""
        if self.client is not None:
            self.client.close()
            logger.info("MongoDB 연결 해제")

    async def _create_indexes(self):
        """인덱스 생성"""
        try:
            await self.collection.create_index("user_id", unique=True)
            logger.info("MongoDB 인덱스 생성 완료")
        except Exception as e:
            logger.warning(f"인덱스 생성 실패 (무시 가능): {e}")

    async def get_or_create_user_tokens(self, user_id: str, email: str = "", name: str = "") -> dict:
        """
        사용자 토큰 조회. 없으면 새로 생성 (무료 3개).
        Returns: { "tokens_remaining": int, "created": bool }
        """
        if self.collection is None:
            return {"tokens_remaining": FREE_TOKENS_PER_USER, "created": False}

        doc = await self.collection.find_one({"user_id": user_id})
        if doc:
            return {"tokens_remaining": doc.get("tokens_remaining", 0), "created": False}

        # 새 사용자: 무료 3개 부여 (동시 요청 시 DuplicateKeyError → 재조회)
        now = datetime.utcnow()
        try:
            await self.collection.insert_one({
                "user_id": user_id,
                "email": email,
                "name": name,
                "tokens_remaining": FREE_TOKENS_PER_USER,
                "created_at": now,
                "updated_at": now,
            })
            return {"tokens_remaining": FREE_TOKENS_PER_USER, "created": True}
        except DuplicateKeyError:
            doc = await self.collection.find_one({"user_id": user_id})
            return {"tokens_remaining": doc.get("tokens_remaining", 0), "created": False}

    async def consume_token(self, user_id: str) -> Optional[int]:
        """
        토큰 1개 소비. 성공 시 남은 토큰 수 반환, 실패 시 None.
        """
        if self.collection is None:
            return 999  # DB 없으면 제한 없음

        result = await self.collection.find_one_and_update(
            {"user_id": user_id, "tokens_remaining": {"$gt": 0}},
            {"$inc": {"tokens_remaining": -1}, "$set": {"updated_at": datetime.utcnow()}},
            return_document=True,
        )
        if result:
            return result.get("tokens_remaining", 0)
        return None

    async def get_tokens_remaining(self, user_id: str) -> int:
        """남은 토큰 수 조회"""
        if self.collection is None:
            return 999

        doc = await self.collection.find_one({"user_id": user_id})
        return doc.get("tokens_remaining", 0) if doc else 0


mongodb_service = MongoDBService()
