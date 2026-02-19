const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:9100' : '/api');

/** 인증 헤더 (access_token 있으면) */
function authHeaders(accessToken?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
  return h;
}

export const api = {
  /** Google ID 토큰 검증 후 사용자 정보 + JWT 반환 */
  async verifyGoogleToken(credential: string): Promise<{
    user_id: string;
    email: string;
    name: string;
    picture: string;
    access_token: string;
    tokens_remaining: number;
  }> {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || res.statusText || '로그인에 실패했습니다.');
    }
    return res.json();
  },

  /** 남은 무료 토큰 조회 */
  async getTokens(accessToken: string): Promise<{ tokens_remaining: number }> {
    const res = await fetch(`${API_BASE}/users/me/tokens`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error('토큰 조회 실패');
    return res.json();
  },

  /** 세션 시작 시 토큰 1개 소비. 402면 토큰 소진 */
  async consumeToken(accessToken: string): Promise<{ tokens_remaining: number }> {
    const res = await fetch(`${API_BASE}/users/me/tokens/consume`, {
      method: 'POST',
      headers: authHeaders(accessToken),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 402) {
      throw new Error((data as { detail?: string }).detail || '무료 토큰이 모두 소진되었습니다.');
    }
    if (!res.ok) throw new Error((data as { detail?: string }).detail || '토큰 사용 실패');
    return data;
  },

  // 날씨
  async getWeather(): Promise<{ weather_text: string }> {
    const res = await fetch(`${API_BASE}/weather`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const detail = errorData.detail || res.statusText || '날씨 조회 실패';
      console.error('날씨 API 에러:', errorData);
      throw new Error(detail);
    }
    return res.json();
  },

  /** 장소 자동완성 (Kakao 로컬 API). 설정 화면 집/회사 위치 입력용 */
  async getPlaceAutocomplete(query: string): Promise<{ results: Array<{ name: string; address: string; category: string; x: string; y: string }> }> {
    if (!query?.trim()) return { results: [] };
    const res = await fetch(`${API_BASE}/place/autocomplete?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return { results: [] };
    const data = await res.json().catch(() => ({ results: [] }));
    return { results: data.results ?? [] };
  },

  /** 대중교통 경로 검색 (출발=집, 도착=회사). ODsay */
  async getNavRoute(start: string, end: string, opt: number = 0) {
    const res = await fetch(`${API_BASE}/nav/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: start.trim(), end: end.trim(), opt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || res.statusText || '경로 검색 실패');
    }
    return res.json();
  },

  /** 실시간 GPS 기반 경로 추적 (탑승 전 열차 도착 시간 / 탑승 중 환승·하차 알림) */
  async getTrackPosition(
    route: { summary: object; legs: object[]; start_coords: { x: number; y: number }; end_coords: { x: number; y: number } },
    lat: number,
    lng: number
  ) {
    const res = await fetch(`${API_BASE}/nav/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, route }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || res.statusText || '위치 추적 실패');
    }
    return res.json();
  },

  // 뉴스 (단일 섹션 또는 여러 섹션에서 각 1건씩)
  async getNews(sectionOrSections: string | string[] = 'all'): Promise<{ articles: Array<{ title: string; summary: string; url: string; publishedAt?: string; source?: string }> }> {
    const params = new URLSearchParams();
    if (Array.isArray(sectionOrSections) && sectionOrSections.length > 0) {
      params.set('sections', sectionOrSections.join(','));
      params.set('per_section', '1');
    } else {
      const section = typeof sectionOrSections === 'string' ? sectionOrSections : 'all';
      params.set('section', section);
      params.set('page_size', '3');
    }
    const res = await fetch(`${API_BASE}/news?${params.toString()}`);
    if (!res.ok) throw new Error('뉴스 조회 실패');
    return res.json();
  },

  // 라디오 스크립트 (세분화)
  async getGreetingScript(userName?: string, djName?: string): Promise<{ script: string }> {
    const res = await fetch(`${API_BASE}/radio-script/greeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_name: userName, dj_name: djName || undefined }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const detail = errorData.detail || res.statusText || '인사말 스크립트 생성 실패';
      console.error('인사말 스크립트 API 에러:', errorData);
      throw new Error(detail);
    }
    return res.json();
  },

  async getNewsScript(previousGreeting?: string, newsItems?: Array<{ title: string; summary: string }>): Promise<{ script: string }> {
    const body: { previous_greeting?: string; news_items?: Array<{ title: string; summary: string }> } = {};
    if (previousGreeting) body.previous_greeting = previousGreeting;
    if (newsItems && newsItems.length > 0) body.news_items = newsItems;
    const res = await fetch(`${API_BASE}/radio-script/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (errorData.fallback_script) {
        console.warn('뉴스 멘트 생성 실패, 폴백 스크립트 사용:', errorData);
        return { script: errorData.fallback_script };
      }
      const detail = errorData.detail || res.statusText || '뉴스 멘트 스크립트 생성 실패';
      console.error('뉴스 멘트 스크립트 API 에러:', errorData);
      throw new Error(detail);
    }
    return res.json();
  },

  /** 뉴스 N건 → 멘트 N개 (인사말 없음, DJ 연결). djName 있으면 "DJ OO이 전해드리는 뉴스" 등 반영 */
  async getNewsScriptSegments(
    newsItems?: Array<{ title: string; summary: string }>,
    djName?: string
  ): Promise<{ scripts: string[] }> {
    const body: { news_items?: Array<{ title: string; summary: string }>; dj_name?: string } =
      newsItems?.length ? { news_items: newsItems } : {};
    if (djName) body.dj_name = djName;
    const res = await fetch(`${API_BASE}/radio-script/news-segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const scripts = (err as { scripts?: string[] }).scripts;
      if (Array.isArray(scripts) && scripts.length > 0) return { scripts };
      throw new Error((err as { detail?: string }).detail || res.statusText || '뉴스 멘트 생성 실패');
    }
    const data = await res.json();
    return { scripts: Array.isArray(data.scripts) ? data.scripts : [data.script ?? '오늘의 뉴스입니다.'] };
  },

  async getClosingScript(previousScript?: string): Promise<{ script: string }> {
    const res = await fetch(`${API_BASE}/radio-script/closing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previous_script: previousScript }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const detail = errorData.detail || res.statusText || '마무리말 스크립트 생성 실패';
      console.error('마무리말 스크립트 API 에러:', errorData);
      throw new Error(detail);
    }
    return res.json();
  },

  // 기존 통합 API (하위 호환성)
  async getRadioScript(): Promise<{ script: string }> {
    const res = await fetch(`${API_BASE}/radio-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const detail = errorData.detail || res.statusText || '라디오 스크립트 생성 실패';
      console.error('라디오 스크립트 API 에러:', errorData);
      throw new Error(detail);
    }
    return res.json();
  },

  /** TTS: 텍스트 → MP3 Blob (인사말/뉴스/마무리말 음성 재생용) */
  async getTtsAudio(
    text: string,
    options?: { speaker?: string; speed?: string; volume?: string; pitch?: string }
  ): Promise<Blob> {
    const res = await fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speaker: options?.speaker ?? 'vhyeri',
        speed: options?.speed ?? '0',
        volume: options?.volume ?? '0',
        pitch: options?.pitch ?? '0',
        format: 'mp3',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || res.statusText || 'TTS 생성 실패');
    }
    return res.blob();
  },

  // 음악 검색 (결과 없으면 빈 배열 반환, 에러 아님 → 호출 쪽에서 폴백 검색 시도)
  async searchMusic(query: string): Promise<{ videos: Array<{ videoId: string; title: string; channelTitle: string }> }> {
    const res = await fetch(`${API_BASE}/music/search?q=${encodeURIComponent(query)}&source=youtube`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const detail = (errorData as { detail?: string }).detail || res.statusText || '음악 검색 실패';
      console.error('음악 검색 API 에러:', errorData);
      throw new Error(detail);
    }
    const data = await res.json();
    const videos = Array.isArray(data.videos) ? data.videos : [];
    return { videos };
  },
};
