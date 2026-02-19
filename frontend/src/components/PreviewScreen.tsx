import { useState, useEffect } from 'react';
import { NavRouteResult, OnboardingData, MusicTrack } from '../types';
import { api } from '../api';
import { getMusicQueryForWeather, MOOD_TO_SEARCH_QUERY } from '../utils/musicQueries';

const TRAFFIC_LABEL: Record<number, string> = { 1: '지하철', 2: '버스', 3: '도보' };

interface Props {
  data: OnboardingData;
  /** 출근 시작 시 첫 곡 + 무드 전달 (인사말 끝나고 "무드에 어울리는 곡명, 듣고 오시죠~" 멘트 후 재생) */
  onStart: (firstTrack: MusicTrack | null, mood: string) => void;
}

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  politics: '정치',
  economy: '경제',
  society: '사회',
  culture: '문화',
  world: '세계',
  tech: '기술',
  entertainment: '엔터',
  opinion: '예술',
};

export default function PreviewScreen({ data, onStart }: Props) {
  const [, setWeatherText] = useState<string>('');
  const [weatherSummary, setWeatherSummary] = useState<string>('로딩 중...');
  const [mood, setMood] = useState<string>('로딩 중...');
  const [firstTrack, setFirstTrack] = useState<MusicTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [routeData, setRouteData] = useState<NavRouteResult | null>(null);

  useEffect(() => {
    const loadPreviewData = async () => {
      try {
        // 날씨 정보 가져오기
        const weather = await api.getWeather();
        setWeatherText(weather.weather_text);

        // 날씨 요약 (간단히)
        const weatherLower = weather.weather_text.toLowerCase();
        if (weatherLower.includes('맑음') || weatherLower.includes('맑은')) {
          setWeatherSummary('맑음');
        } else if (weatherLower.includes('흐림') || weatherLower.includes('흐린')) {
          setWeatherSummary('흐림');
        } else if (weatherLower.includes('비') || weatherLower.includes('소나기')) {
          setWeatherSummary('비');
        } else if (weatherLower.includes('눈')) {
          setWeatherSummary('눈');
        } else {
          setWeatherSummary('맑음'); // 기본값
        }

        // 오늘의 무드 생성 (날씨와 요일 기반)
        const day = new Date().getDay();
        let moodValue = '';

        if (weatherLower.includes('맑음') || weatherLower.includes('맑은')) {
          if (day === 0 || day === 6) {
            moodValue = '잔잔한 모닝 카페';
          } else {
            moodValue = '상쾌한 아침 에너지';
          }
        } else if (weatherLower.includes('비') || weatherLower.includes('소나기')) {
          moodValue = '비 오는 날의 따뜻함';
        } else if (weatherLower.includes('눈')) {
          moodValue = '겨울 아침의 고요함';
        } else {
          moodValue = '편안한 출근길';
        }
        setMood(moodValue);

        // 첫 곡 검색: 화면에는 무드 문구 그대로, 검색은 대중적 키워드로 (MOOD_TO_SEARCH_QUERY)
        const musicQuery = MOOD_TO_SEARCH_QUERY[moodValue] ?? `${moodValue} music`;
        try {
          const musicResult = await api.searchMusic(musicQuery);
          if (musicResult.videos.length > 0) {
            const track = musicResult.videos[0];
            setFirstTrack({
              videoId: track.videoId,
              title: track.title,
              channelTitle: track.channelTitle,
            });
          } else {
            const fallbackQuery = getMusicQueryForWeather(weather.weather_text, 0);
            const fallbackResult = await api.searchMusic(fallbackQuery.query);
            if (fallbackResult.videos.length > 0) {
              const track = fallbackResult.videos[0];
              setFirstTrack({
                videoId: track.videoId,
                title: track.title,
                channelTitle: track.channelTitle,
              });
            }
          }
        } catch (err) {
          console.error('음악 검색 실패:', err);
          try {
            const fallbackQuery = getMusicQueryForWeather(weather.weather_text, 0);
            const fallbackResult = await api.searchMusic(fallbackQuery.query);
            if (fallbackResult.videos.length > 0) {
              const track = fallbackResult.videos[0];
              setFirstTrack({
                videoId: track.videoId,
                title: track.title,
                channelTitle: track.channelTitle,
              });
            }
          } catch (fallbackErr) {
            /* firstTrack 유지 null */
          }
        }
      } catch (err) {
        console.error('미리보기 데이터 로드 실패:', err);
        setWeatherSummary('날씨 정보 없음');
        setMood('기본 모드');
      } finally {
        setLoading(false);
      }
    };

    loadPreviewData();
  }, []);

  // 집 → 회사 경로 조회
  useEffect(() => {
    if (!data.startLocation?.trim() || !data.companyLocation?.trim()) return;
    let cancelled = false;
    api
      .getNavRoute(data.startLocation, data.companyLocation)
      .then((res) => { if (!cancelled) setRouteData(res); })
      .catch(() => { /* 경로 없으면 카드만 비움 */ });
    return () => { cancelled = true; };
  }, [data.startLocation, data.companyLocation]);

  // 뉴스 카테고리 라벨
  const newsCategoryLabels = data.newsCategories && data.newsCategories.length > 0
    ? data.newsCategories.map((cat) => NEWS_CATEGORY_LABELS[cat] || cat).join('·')
    : '전체';

  return (
    <div className="min-h-screen bg-toss-gray px-4 py-6 safe-area pb-24">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="text-sm text-primary font-semibold mb-2">하이라디오</div>
          <h1 className="text-2xl font-semibold mb-2 text-toss-gray-dark">
            {data.name}님을 위한<br />오늘의 출근길 라디오
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed px-2">
            앱을 켜두기만 하면, 날씨·뉴스·선곡까지<br />알아서 준비해 둘게요.
          </p>
        </div>

        {/* 정보 카드들 */}
        <div className="space-y-3 mb-8">
          {/* 집·회사·경로 카드 */}
          <div className="toss-card">
            <div className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">출근 경로</div>
            <div className="space-y-2 mb-3">
              <div className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0">집</span>
                <span className="text-sm text-toss-gray-dark">{data.startLocation || '—'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0">회사</span>
                <span className="text-sm text-toss-gray-dark">{data.companyLocation || '—'}</span>
              </div>
            </div>
            {routeData ? (
              <>
                <div className="text-sm font-semibold text-toss-gray-dark mb-2">
                  약 {routeData.summary.total_time_min}분 · {(routeData.summary.total_distance_m / 1000).toFixed(1)}km
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                  {routeData.legs.map((leg, idx) => (
                    <span key={idx} className="flex items-center gap-1">
                      {idx > 0 && <span className="text-gray-300">→</span>}
                      <span>
                        {TRAFFIC_LABEL[leg.trafficType] ?? '이동'}
                        {leg.lineName ? ` ${leg.lineName}` : ''}
                        {leg.startName || leg.endName ? ` ${leg.startName || ''}→${leg.endName || ''}` : ''}
                        <span className="text-gray-400"> {leg.sectionTimeMin}분</span>
                      </span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">경로를 불러오는 중이에요.</p>
            )}
          </div>

          {/* 오늘의 날씨 카드 */}
          <div className="toss-card">
            <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">오늘의 날씨</div>
            <div className="text-base font-semibold text-toss-gray-dark mb-2">
              {loading ? '로딩 중...' : weatherSummary}
            </div>
            <p className="text-xs text-gray-400">
              회사 기준으로 간단히 요약한 날씨 정보예요.
            </p>
          </div>

          {/* 오늘의 무드 카드 */}
          <div className="toss-card">
            <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">오늘의 무드</div>
            <div className="text-base font-semibold text-toss-gray-dark mb-2">
              {loading ? '로딩 중...' : mood}
            </div>
            <p className="text-xs text-gray-400">
              날씨와 요일을 보고 LLM이 추천한 출근길 분위기예요.
            </p>
          </div>

          {/* 뉴스 테마 카드 */}
          <div className="toss-card">
            <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">뉴스 테마</div>
            <div className="text-base font-semibold text-toss-gray-dark mb-2">
              {newsCategoryLabels}
            </div>
            <p className="text-xs text-gray-400">
              선택한 주제 위주로 아침 뉴스를 가볍게 정리해서 들려드려요.
            </p>
          </div>

          {/* 첫 곡 카드 */}
          <div className="toss-card">
            <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">첫 곡</div>
            <div className="text-base font-semibold text-toss-gray-dark mb-2">
              {loading ? '로딩 중...' : firstTrack ? firstTrack.title : '음악을 찾을 수 없습니다'}
            </div>
            <p className="text-xs text-gray-400">
              오늘 날씨와 {data.companyLocation}까지의 동선을 기준으로 골라본 곡이에요.
            </p>
          </div>
        </div>

        {/* Sticky Bottom 버튼 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4" style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom))` }}>
          <button
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try {
                await onStart(firstTrack, mood);
              } finally {
                setStarting(false);
              }
            }}
            className="toss-btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {starting ? '시작 중...' : '출근 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}
