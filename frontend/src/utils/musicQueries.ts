import { MusicQuery } from '../types';

/**
 * [노래 검색 프롬프트 작성 가이드] YouTube에서 잘 검색되려면:
 * 1. 짧고 핵심 키워드 2~4개: "장르 + playlist/mix" (예: chill pop playlist)
 * 2. 실제 영상 제목에 자주 쓰는 표현: morning music, coffee jazz, lofi, acoustic
 * 3. 문학적/긴 문장보다 검색어형: "비 오는 날 감성" → "rainy day jazz" 또는 "비 재즈"
 * 4. 영어 키워드 섞기: jazz, pop, lofi, chill (글로벌 플랫폼에서 결과 많음)
 * 5. "플레이리스트", "mix", "1 hour" 등으로 재생목록/믹스 영상 유도
 */

/** 미리 정의한 10개 노래 검색어 (YouTube 검색용, 짧고 대중적인 키워드) */
export const MUSIC_SEARCH_PHRASES: string[] = [
  'morning pop playlist',
  'city pop mix',
  'chill indie morning',
  'wake up rock playlist',
  'rainy day jazz',
  'weekend morning jazz',
  'dance pop hits',
  'piano instrumental',
  'chill electronic music',
  'classical piano morning',
];

/** 10개 멘트 중 인덱스에 해당하는 검색어 (순환) */
export function getMusicSearchPhraseAt(index: number): string {
  return MUSIC_SEARCH_PHRASES[index % MUSIC_SEARCH_PHRASES.length];
}

/** 검색 결과가 없을 때 폴백 (YouTube에 많이 있는 표현) */
export const FALLBACK_MUSIC_QUERY = 'chill pop music';

// 날씨/상황 기반 음악 검색어 (추천 곡 1곡용, 검색 잘 되도록 키워드형)
export function getMusicQueryForWeather(weatherText: string, newsCount: number): MusicQuery {
  const lower = weatherText.toLowerCase();

  if (lower.includes('비') || lower.includes('눈') || lower.includes('소나기')) {
    return {
      query: 'rainy day jazz playlist',
      concept: '창밖으로 흐르는 빗물과 딱 어울리는 촉촉한 목소리를 준비했습니다.',
    };
  }

  if (lower.includes('맑음') || lower.includes('맑은')) {
    return {
      query: 'morning city pop playlist',
      concept: '오늘 날씨 정말 좋네요! 눈부신 햇살처럼 반짝이는 리듬입니다.',
    };
  }

  if (newsCount >= 3) {
    const day = new Date().getDay();
    if (day === 0) {
      return {
        query: 'upbeat pop morning playlist',
        concept: '내일 월요일이지만, 이 노래라면 발걸음이 가벼워질 거예요.',
      };
    }
    if (day === 4) {
      return {
        query: 'friday dance pop mix',
        concept: '벌써 금요일입니다! 오늘만 버티면 주말이라는 설렘을 담았습니다.',
      };
    }
  }

  return {
    query: 'morning pop playlist',
    concept: '눈이 번쩍 뜨일 만한 강력한 사운드로 아침을 시작해볼까요?',
  };
}

/** 미리보기 무드 문구 → YouTube 검색용 쿼리 (대중적으로 잘 검색되도록) */
export const MOOD_TO_SEARCH_QUERY: Record<string, string> = {
  '잔잔한 모닝 카페': 'morning coffee jazz playlist',
  '상쾌한 아침 에너지': 'morning pop playlist',
  '비 오는 날의 따뜻함': 'rainy day jazz',
  '겨울 아침의 고요함': 'calm winter piano',
  '편안한 출근길': 'chill morning music',
};
