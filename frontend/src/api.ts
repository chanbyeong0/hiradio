const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:9100';

export const api = {
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
