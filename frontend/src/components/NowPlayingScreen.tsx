import { useState, useEffect, useRef } from 'react';
import { DJ_SPEAKER_IDS, MusicTrack, NavRouteResult, OnboardingData, PlayPhase, RadioScripts, SessionState } from '../types';
import { api } from '../api';
import { getMusicQueryForWeather, getMusicSearchPhraseAt, FALLBACK_MUSIC_QUERY } from '../utils/musicQueries';

const TRAFFIC_TYPE_LABEL: Record<number, string> = { 1: '지하철', 2: '버스', 3: '도보' };

declare global {
  interface Window {
    YT?: { Player: new (el: string | HTMLElement, opts: YT.PlayerOptions) => YT.Player; PlayerState: { ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}
declare namespace YT {
  interface Player {
    destroy: () => void;
  }
  interface PlayerOptions {
    videoId?: string;
    height?: string | number;
    width?: string | number;
    playerVars?: Record<string, unknown>;
    events?: { onStateChange?: (e: { data: number }) => void };
  }
}

interface Props {
  data: OnboardingData;
  /** 로딩 화면에서 미리 생성한 스크립트가 있으면 사용 (API 중복 호출 방지) */
  initialScripts?: RadioScripts | null;
  /** 미리보기에서 골라둔 첫 곡 — 인사말 끝나고 소개 멘트 후 재생 */
  initialFirstTrack?: MusicTrack | null;
  /** 미리보기 무드 (첫 곡 소개 멘트: "~무드에 어울리는 [곡명], 듣고 오시죠~") */
  initialMood?: string;
  sessionState: SessionState;
  onStateChange: (state: SessionState) => void;
  onEnd: (previousScript?: string) => void;
}

export default function NowPlayingScreen({
  data,
  initialScripts,
  initialFirstTrack,
  initialMood = '',
  sessionState,
  onStateChange,
  onEnd,
}: Props) {
  const [radioScripts, setRadioScripts] = useState<RadioScripts | null>(initialScripts ?? null);
  /** 플로우: 인사말 → 추천곡 → 뉴스(1건씩) → 음악 → 새 뉴스 → … */
  const [phase, setPhase] = useState<PlayPhase>('greeting');
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
  const [currentMusic, setCurrentMusic] = useState<MusicTrack | null>(null);
  const [weatherText, setWeatherText] = useState('');
  const [newsCount, setNewsCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  /** 길찾기 경로 (집 → 회사). 상단 전체 경로 표시용 */
  const [routeData, setRouteData] = useState<NavRouteResult | null>(null);

  const musicTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const onMusicEndRef = useRef<(() => void) | null>(null);
  const radioAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCancelledRef = useRef(false);
  const ttsRunIdRef = useRef(0);
  /** 10개 노래 검색 멘트 순환 인덱스 */
  const musicPhraseIndexRef = useRef(0);
  /** 비율: 이번 사이클에 남은 노래 수 (뉴스는 radioRatio개 세그먼트 1라운드 후 음악) */
  const remainingMusicSongsRef = useRef(0);
  /** 노래 한 곡 더 로드 트리거 (musicRatio > 1일 때) */
  const [musicLoadKey, setMusicLoadKey] = useState(0);

  // 로딩에서 넘어온 스크립트가 있으면 즉시 반영
  useEffect(() => {
    if (initialScripts) {
      setRadioScripts(initialScripts);
    }
  }, [initialScripts]);

  // 초기화: 날씨/뉴스(음악 쿼리용). 스크립트는 initialScripts 있으면 재생성 안 함
  useEffect(() => {
    const init = async () => {
      try {
        const newsSections = data.newsCategories?.length ? data.newsCategories : 'all';
        const [weather, news] = await Promise.all([
          api.getWeather(),
          api.getNews(newsSections),
        ]);
        setWeatherText(weather.weather_text);
        setNewsCount(news.articles.length);

        if (!initialScripts) {
          const greetingResult = await api.getGreetingScript(data.name, data.djName);
          const newsItems = news.articles.slice(0, data.radioRatio).map((a) => ({
            title: a.title,
            summary: a.summary || '',
          }));
          const newsResult = await api.getNewsScriptSegments(newsItems, data.djName);
          setRadioScripts({
            greeting: greetingResult.script,
            news: newsResult.scripts,
          });
        }
      } catch (err) {
        console.error('초기화 실패:', err);
      }
    };
    init();
  }, [data.name, data.newsCategories, initialScripts]);

  // 길찾기 경로 조회 (집 주소 → 회사 위치)
  useEffect(() => {
    if (!data.startLocation?.trim() || !data.companyLocation?.trim()) return;
    let cancelled = false;
    api
      .getNavRoute(data.startLocation, data.companyLocation)
      .then((res) => {
        if (!cancelled) setRouteData(res);
      })
      .catch((err) => {
        if (!cancelled) console.error('경로 조회 실패:', err);
      });
    return () => { cancelled = true; };
  }, [data.startLocation, data.companyLocation]);

  // 라디오 구간: TTS 인사말 또는 뉴스(한 건씩) 재생
  const newsSegments = radioScripts?.news
    ? (Array.isArray(radioScripts.news) ? radioScripts.news : [radioScripts.news]).filter(Boolean)
    : [];

  // 첫 곡 소개 멘트 (무드 + 곡명, "듣고 오시죠~")
  const firstSongIntroText =
    initialFirstTrack?.title && initialMood
      ? `${initialMood}에 어울리는 ${initialFirstTrack.title}, 듣고 오시죠~`
      : initialFirstTrack?.title
        ? `오늘 추천 곡, ${initialFirstTrack.title}. 듣고 오시죠~`
        : '';

  useEffect(() => {
    if (sessionState !== 'PLAYING_RADIO' || isPaused) return;
    const part = phase;
    if (part !== 'greeting' && part !== 'first_song_intro' && part !== 'news') return;
    if (part === 'news' && !radioScripts) return;

    const text =
      part === 'greeting'
        ? radioScripts?.greeting ?? ''
        : part === 'first_song_intro'
          ? firstSongIntroText
          : newsSegments[currentNewsIndex] ?? '';
    if (!text.trim()) {
      if (part === 'greeting') {
        setPhase('first_song_intro');
      } else if (part === 'first_song_intro') {
        setPhase('first_music');
        onStateChange('PLAYING_MUSIC');
      } else if (currentNewsIndex < newsSegments.length - 1) {
        setCurrentNewsIndex((i) => i + 1);
      } else {
        setCurrentNewsIndex(0);
        setPhase('music');
        remainingMusicSongsRef.current = data.musicRatio;
        onStateChange('PLAYING_MUSIC');
      }
      return;
    }

    ttsCancelledRef.current = false;
    const myRunId = ++ttsRunIdRef.current;
    const isGreeting = part === 'greeting';
    const isFirstSongIntro = part === 'first_song_intro';
    const isLastNews = currentNewsIndex >= newsSegments.length - 1;
    const ttsSpeaker = DJ_SPEAKER_IDS[data.djName ?? '커순이'] ?? 'vhyeri';
    let objectUrl: string | null = null;
    api
      .getTtsAudio(text, { speaker: ttsSpeaker })
      .then((blob) => {
        if (myRunId !== ttsRunIdRef.current) return;
        if (ttsCancelledRef.current) return;
        objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        radioAudioRef.current = audio;
        audio.onended = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          radioAudioRef.current = null;
          if (ttsCancelledRef.current) return;
          if (isGreeting) {
            setPhase('first_song_intro');
          } else if (isFirstSongIntro) {
            setPhase('first_music');
            onStateChange('PLAYING_MUSIC');
          } else if (!isLastNews) {
            setCurrentNewsIndex((i) => i + 1);
          } else {
            setCurrentNewsIndex(0);
            setPhase('music');
            remainingMusicSongsRef.current = data.musicRatio;
            onStateChange('PLAYING_MUSIC');
          }
        };
        audio.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          radioAudioRef.current = null;
          if (!ttsCancelledRef.current && isGreeting) {
            setPhase('first_song_intro');
          } else if (!ttsCancelledRef.current && isFirstSongIntro) {
            setPhase('first_music');
            onStateChange('PLAYING_MUSIC');
          } else if (!ttsCancelledRef.current && !isLastNews) {
            setCurrentNewsIndex((i) => i + 1);
          } else if (!ttsCancelledRef.current) {
            setCurrentNewsIndex(0);
            setPhase('music');
            remainingMusicSongsRef.current = data.musicRatio;
            onStateChange('PLAYING_MUSIC');
          }
        };
        audio.play().catch((err: DOMException) => {
          if (err.name === 'AbortError') return;
          console.error('TTS 재생 오류:', err);
        });
      })
      .catch((err) => {
        console.error('TTS 재생 실패:', err);
        if (myRunId !== ttsRunIdRef.current) return;
        if (ttsCancelledRef.current) return;
        if (isGreeting) {
          setPhase('first_song_intro');
        } else if (isFirstSongIntro) {
          setPhase('first_music');
          onStateChange('PLAYING_MUSIC');
        } else if (!isLastNews) {
          setCurrentNewsIndex((i) => i + 1);
        } else {
          setCurrentNewsIndex(0);
          setPhase('music');
          remainingMusicSongsRef.current = data.musicRatio;
          onStateChange('PLAYING_MUSIC');
        }
      });
    return () => {
      ttsCancelledRef.current = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (radioAudioRef.current) {
        radioAudioRef.current.pause();
        radioAudioRef.current = null;
      }
    };
  }, [sessionState, isPaused, phase, currentNewsIndex, radioScripts, newsSegments.length, firstSongIntroText, onStateChange, data.newsCategories, data.musicRatio]);

  // 음악 구간: 추천곡(1곡) 또는 10개 멘트 순환 곡, 종료 시 뉴스로 전환(음악이면 새 뉴스 조회)
  useEffect(() => {
    if (sessionState !== 'PLAYING_MUSIC' || isPaused) return;

    const isFirstMusic = phase === 'first_music';
    const isLoopMusic = phase === 'music';

    const loadAndPlayMusic = async () => {
      try {
        // 첫 곡: 미리보기에서 골라둔 곡이 있으면 그대로 사용 (무드 기반 추천과 동일)
        if (isFirstMusic && initialFirstTrack) {
          onMusicEndRef.current = () => {
            setPhase('news');
            onStateChange('PLAYING_RADIO');
          };
          setCurrentMusic(initialFirstTrack);
          return;
        }

        const query = isFirstMusic
          ? getMusicQueryForWeather(weatherText, newsCount).query
          : getMusicSearchPhraseAt(musicPhraseIndexRef.current);
        if (!isFirstMusic) musicPhraseIndexRef.current += 1;

        let result = await api.searchMusic(query);
        if (result.videos.length === 0) {
          result = await api.searchMusic(FALLBACK_MUSIC_QUERY);
        }
        if (result.videos.length === 0) {
          if (isFirstMusic) {
            setPhase('news');
            onStateChange('PLAYING_RADIO');
          } else {
            const newsSections = data.newsCategories?.length ? data.newsCategories : 'all';
            const newsRes = await api.getNews(newsSections);
            const newItems = newsRes.articles.slice(0, data.radioRatio).map((a) => ({ title: a.title, summary: a.summary || '' }));
            const newsResult = await api.getNewsScriptSegments(newItems, data.djName);
            setRadioScripts((prev) => (prev ? { ...prev, news: newsResult.scripts } : { greeting: '', news: newsResult.scripts }));
            setCurrentNewsIndex(0);
            setPhase('news');
            onStateChange('PLAYING_RADIO');
          }
          return;
        }
        const track = result.videos[Math.floor(Math.random() * result.videos.length)];
        onMusicEndRef.current = () => {
          if (isFirstMusic) {
            setPhase('news');
            onStateChange('PLAYING_RADIO');
          } else {
            remainingMusicSongsRef.current -= 1;
            if (remainingMusicSongsRef.current > 0) {
              setMusicLoadKey((k) => k + 1);
            } else {
              (async () => {
                try {
                  const newsSections = data.newsCategories?.length ? data.newsCategories : 'all';
                  const newsRes = await api.getNews(newsSections);
                  const newItems = newsRes.articles.slice(0, data.radioRatio).map((a) => ({
                    title: a.title,
                    summary: a.summary || '',
                  }));
                  const newsResult = await api.getNewsScriptSegments(newItems, data.djName);
                  setRadioScripts((prev) =>
                    prev ? { ...prev, news: newsResult.scripts } : { greeting: '', news: newsResult.scripts }
                  );
                  setCurrentNewsIndex(0);
                  setPhase('news');
                  onStateChange('PLAYING_RADIO');
                } catch (err) {
                  console.error('새 뉴스 로드 실패:', err);
                  setPhase('news');
                  onStateChange('PLAYING_RADIO');
                }
              })();
            }
          }
        };
        setCurrentMusic({
          videoId: track.videoId,
          title: track.title,
          channelTitle: track.channelTitle,
        });
      } catch (err) {
        console.error('음악 로드 실패:', err);
        if (isFirstMusic) {
          setPhase('news');
          onStateChange('PLAYING_RADIO');
        } else {
          setPhase('news');
          onStateChange('PLAYING_RADIO');
        }
      }
    };

    loadAndPlayMusic();

    return () => {
      if (musicTimerRef.current) clearTimeout(musicTimerRef.current);
    };
  }, [sessionState, isPaused, phase, data.newsCategories, data.radioRatio, data.musicRatio, weatherText, newsCount, radioScripts?.greeting, initialFirstTrack, musicLoadKey, onStateChange]);

  // YouTube 플레이어 생성 · 영상 끝나면 onMusicEndRef 호출 (60초 타이머 제거 → 끊김 방지)
  useEffect(() => {
    if (sessionState !== 'PLAYING_MUSIC' || !currentMusic?.videoId) return;

    const run = () => {
      const container = playerContainerRef.current;
      if (!window.YT?.Player || !container) return;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (_) {}
        ytPlayerRef.current = null;
      }
      const YT = window.YT;
      ytPlayerRef.current = new YT.Player(container, {
        videoId: currentMusic.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onStateChange(e: { data: number }) {
            if (e.data === 0) {
              onMusicEndRef.current?.();
            }
          },
        },
      });
    };

    const tryRun = () => {
      if (window.YT?.Player && playerContainerRef.current) {
        run();
        return true;
      }
      return false;
    };

    if (tryRun()) {
      return cleanup;
    }
    (window as Window).onYouTubeIframeAPIReady = () => tryRun();
    const t = setInterval(() => {
      if (tryRun()) clearInterval(t);
    }, 150);
    return () => {
      clearInterval(t);
      cleanup();
    };

    function cleanup() {

      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (_) {}
        ytPlayerRef.current = null;
      }
    }
  }, [sessionState, currentMusic?.videoId]);

  const handlePause = () => {
    if (radioAudioRef.current) {
      radioAudioRef.current.pause();
    }
    setIsPaused(true);
    onStateChange('PAUSED');
  };

  const handleResume = () => {
    setIsPaused(false);
    const isRadio = phase === 'greeting' || phase === 'first_song_intro' || phase === 'news';
    onStateChange(isRadio ? 'PLAYING_RADIO' : 'PLAYING_MUSIC');
    if (radioAudioRef.current) {
      radioAudioRef.current.play().catch((err: DOMException) => {
        if (err.name === 'AbortError') return;
        console.error('재생 재개 오류:', err);
      });
    }
  };

  const handleSkipTts = () => {
    // TTS 오디오 중단
    ttsCancelledRef.current = true;
    if (radioAudioRef.current) {
      radioAudioRef.current.pause();
      radioAudioRef.current = null;
    }

    // 다음 단계로 이동
    if (phase === 'greeting') {
      setPhase('first_song_intro');
    } else if (phase === 'first_song_intro') {
      setPhase('first_music');
      onStateChange('PLAYING_MUSIC');
    } else if (phase === 'news') {
      const isLastNews = currentNewsIndex >= newsSegments.length - 1;
      if (!isLastNews) {
        setCurrentNewsIndex((i) => i + 1);
      } else {
        setCurrentNewsIndex(0);
        setPhase('music');
        remainingMusicSongsRef.current = data.musicRatio;
        onStateChange('PLAYING_MUSIC');
      }
    }
  };

  const currentTtsText =
    phase === 'greeting'
      ? (radioScripts?.greeting ?? '')
      : phase === 'first_song_intro'
        ? firstSongIntroText
        : (newsSegments[currentNewsIndex] ?? '');

  return (
    <div className="min-h-screen bg-toss-gray px-4 py-4 safe-area pb-24">
      <div className="max-w-md mx-auto">
        {/* 상단: 출근 중 + 일시정지 */}
        <div className="flex items-center justify-between mb-3">
          <div className="toss-banner">
            <span className="text-sm font-semibold text-toss-gray-dark">출근 중</span>
            <span className="text-sm text-gray-500"> · </span>
            <span className="text-sm text-gray-500">{data.companyLocation} 방향</span>
          </div>
          <button
            onClick={isPaused ? handleResume : handlePause}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 active:bg-gray-100"
          >
            {isPaused ? '▶' : '⏸'}
          </button>
        </div>

        {/* 전체 경로 (길찾기) — 실시간 지하철 도착 정보 포함 */}
        {routeData && (
          <div className="mb-4">
            {/* 요약 정보 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* 헤더: 총 소요시간 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚇</span>
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        약 {routeData.summary.total_time_min}분
                      </div>
                      <div className="text-xs text-gray-600">
                        {(routeData.summary.total_distance_m / 1000).toFixed(1)}km · {routeData.summary.payment_won.toLocaleString()}원
                      </div>
                    </div>
                  </div>
                  {routeData.summary.bus_transit_count + routeData.summary.subway_transit_count > 0 && (
                    <div className="text-xs text-gray-500">
                      환승 {routeData.summary.bus_transit_count + routeData.summary.subway_transit_count}회
                    </div>
                  )}
                </div>
              </div>

              {/* 경로 상세 */}
              <div className="p-4 space-y-3">
                {routeData.legs.map((leg, idx) => {
                  const isSubway = leg.trafficType === 1;
                  const isBus = leg.trafficType === 2;
                  const isWalk = leg.trafficType === 3;
                  const realtimeInfo = isSubway && leg.startName ? routeData.realtime_subway?.[leg.startName] : null;
                  
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      {/* 아이콘 */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSubway ? 'bg-blue-100 text-blue-700' :
                        isBus ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {isSubway ? '🚇' : isBus ? '🚌' : '🚶'}
                      </div>

                      {/* 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-gray-900">
                            {leg.lineName || TRAFFIC_TYPE_LABEL[leg.trafficType] || '이동'}
                          </span>
                          <span className="text-sm text-gray-500">
                            {leg.sectionTimeMin}분
                          </span>
                        </div>
                        
                        {(leg.startName || leg.endName) && (
                          <div className="text-sm text-gray-600 mb-1">
                            {leg.startName && <span>{leg.startName}</span>}
                            {leg.startName && leg.endName && <span className="mx-1.5 text-gray-400">→</span>}
                            {leg.endName && <span>{leg.endName}</span>}
                            {leg.stationCount && leg.stationCount > 0 && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({leg.stationCount}개 정류장)
                              </span>
                            )}
                          </div>
                        )}

                        {/* 실시간 지하철 도착 정보 */}
                        {isSubway && realtimeInfo && realtimeInfo.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {realtimeInfo.slice(0, 2).map((arrival, i) => {
                              const seconds = arrival.barvlDt ? parseInt(arrival.barvlDt) : 0;
                              const minutes = Math.floor(seconds / 60);
                              const displayTime = minutes > 0 ? `${minutes}분` : '곧 도착';
                              
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                                    🚇 {displayTime}
                                  </span>
                                  <span className="text-gray-600 truncate">
                                    {arrival.arvlMsg2 || arrival.trainLineNm || '정보 없음'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isWalk && leg.distanceM && (
                          <div className="text-xs text-gray-500">
                            도보 {leg.distanceM}m
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 하단 콘텐츠 카드: TTS 자막(버블) 또는 음악(유튜브) */}
        {sessionState === 'PLAYING_RADIO' && (phase === 'greeting' || phase === 'first_song_intro' || phase === 'news') && (
          <div className="toss-card mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                {phase === 'greeting' ? '인사말' : phase === 'first_song_intro' ? '첫 곡 소개' : `뉴스 재생 중 (${currentNewsIndex + 1}/${newsSegments.length || 1})`}
              </div>
              {/* 스킵 버튼 */}
              {!isPaused && (
                <button
                  onClick={handleSkipTts}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                  title="건너뛰기"
                >
                  <span>건너뛰기</span>
                  <span className="text-sm">⏭</span>
                </button>
              )}
            </div>
            {/* 현재 재생 중인 TTS 자막 (심플) */}
            {currentTtsText.trim() && (
              <p className="text-base leading-relaxed text-toss-gray-dark whitespace-pre-line">
                {currentTtsText}
              </p>
            )}
          </div>
        )}

        {sessionState === 'PLAYING_MUSIC' && currentMusic && (
          <div className="toss-card mb-4">
            <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">음악 재생 중</div>
            <div className="font-semibold text-base mb-1 text-toss-gray-dark">{currentMusic.title}</div>
            <div className="text-sm text-gray-500 mb-3">{currentMusic.channelTitle}</div>
            <div className="aspect-video bg-gray-100 rounded-toss overflow-hidden">
              <div ref={playerContainerRef} className="w-full h-full" />
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4" style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom))` }}>
          <button
            onClick={() => {
              const fullScript = radioScripts
                ? `${radioScripts.greeting}\n\n${Array.isArray(radioScripts.news) ? radioScripts.news.join('\n\n') : radioScripts.news}`
                : undefined;
              onEnd(fullScript);
            }}
            className="toss-btn-primary w-full"
          >
            도착 처리하기
          </button>
        </div>
      </div>
    </div>
  );
}
