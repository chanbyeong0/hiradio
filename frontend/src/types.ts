/** Google 로그인 사용자 정보 */
export interface User {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  /** JWT 액세스 토큰 (API 인증용) */
  access_token?: string;
  /** 남은 무료 토큰 수 */
  tokens_remaining?: number;
}

/** DJ 이름 → 클로바 TTS speaker ID (커돌이: 남자, 커순이: 여자) */
export const DJ_SPEAKER_IDS: Record<string, string> = {
  커돌이: 'nes_c_kihyo',
  커순이: 'vhyeri',
} as const;

export type DjName = keyof typeof DJ_SPEAKER_IDS;

// 온보딩 데이터
export interface OnboardingData {
  name: string;
  /** 출발 위치 (집 등) */
  startLocation: string;
  /** 회사(도착) 위치 */
  companyLocation: string;
  /** DJ 이름 (TTS 성우): 커돌이 | 커순이. 없으면 기본 '커순이' */
  djName?: DjName;
  radioRatio: number; // 뉴스 세그먼트 개수 + 관심분야 최대 선택 개수 (2:1이면 2)
  musicRatio: number; // 음악 곡 수 (예: 1)
  newsCategories: string[]; // 선택한 뉴스 카테고리 (최대 radioRatio개)
}

// 세션 상태
export type SessionState =
  | 'IDLE'
  | 'LOADING'
  | 'PLAYING_RADIO'
  | 'PLAYING_MUSIC'
  | 'PAUSED'
  | 'ENDED';

/** 재생 단계: 인사말 → 첫 곡 소개 멘트 → 추천곡 → 뉴스 → 음악 → … */
export type PlayPhase = 'greeting' | 'first_song_intro' | 'first_music' | 'news' | 'music';

// 앱 화면
export type AppScreen =
  | 'WELCOME'
  | 'ONBOARDING'
  | 'PREVIEW'
  | 'LOADING'
  | 'NOW_PLAYING'
  | 'END';

// 날씨 정보
export interface WeatherInfo {
  text: string;
}

// 뉴스 정보
export interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  publishedAt?: string;
  source?: string;
}

// 라디오 스크립트
export interface RadioScript {
  script: string;
}

// 세분화된 라디오 스크립트
export interface RadioScripts {
  greeting: string;       // 인사말
  news: string | string[]; // 뉴스 멘트 (1개 문자열 또는 3개 세그먼트)
  closing?: string;      // 마무리말 (도착 시)
}

// 음악 정보
export interface MusicTrack {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
}

// 음악 검색 쿼리 (상황별)
export interface MusicQuery {
  query: string;
  concept: string;
}

// 대중교통 경로 (ODsay)
export interface NavRouteSummary {
  total_time_min: number;
  payment_won: number;
  bus_transit_count: number;
  subway_transit_count: number;
  total_walk_m: number;
  total_distance_m: number;
  first_start_station: string;
  last_end_station: string;
}

export interface NavRouteLeg {
  trafficType: number; // 1=지하철, 2=버스, 3=도보
  sectionTimeMin: number;
  distanceM: number;
  startName: string;
  endName: string;
  stationCount?: number;
  lineName?: string;
  stations?: Array<{ index?: number; stationName: string; stationID?: string; x?: string; y?: string }>;
}

export interface RealtimeArrival {
  subwayId?: string;
  trainLineNm?: string;
  barvlDt?: string;
  arvlMsg2?: string;
  bstatnNm?: string;
}

export interface NavRouteResult {
  summary: NavRouteSummary;
  legs: NavRouteLeg[];
  start_coords: { x: number; y: number };
  end_coords: { x: number; y: number };
  realtime_subway?: Record<string, RealtimeArrival[]>;
}

/** 실시간 GPS 기반 경로 추적 응답 */
export type TrackState = 'BEFORE_BOARDING' | 'ON_BOARD' | 'UNKNOWN';

export interface TrackPositionResponse {
  state: TrackState | string;
  message: string;
  stationName: string | null;
  arrival_minutes: number | null;
  /** 현재 위치에 해당하는 경로 포인트 인덱스 (그래프 하이라이트용) */
  nearest_index?: number;
  /** 경로 전체 포인트 수 */
  total_points?: number;
}
