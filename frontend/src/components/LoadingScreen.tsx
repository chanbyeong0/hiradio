import { useState, useEffect } from 'react';
import { api } from '../api';
import { OnboardingData, RadioScripts } from '../types';

interface Props {
  data: OnboardingData;
  onComplete: (scripts: RadioScripts) => void;
}

const STEP_MESSAGES: Record<number, string> = {
  0: '회사 근처 날씨를 확인하는 중이에요',
  1: '뉴스를 스캔하는 중이에요',
  2: '인사말 대본을 만드는 중이에요',
  3: '뉴스 멘트를 만드는 중이에요',
  4: '첫 곡을 선곡하는 중이에요',
};

export default function LoadingScreen({ data, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setCurrentStep(0);
        await api.getWeather();
        await new Promise(resolve => setTimeout(resolve, 500));

        setCurrentStep(1);
        const newsSections = data.newsCategories?.length ? data.newsCategories : 'all';
        const newsRes = await api.getNews(newsSections);
        await new Promise(resolve => setTimeout(resolve, 500));

        setCurrentStep(2);
        const greetingResult = await api.getGreetingScript(data.name, data.djName);
        await new Promise(resolve => setTimeout(resolve, 500));

        setCurrentStep(3);
        const newsItems = newsRes.articles.slice(0, data.radioRatio).map((a) => ({
          title: a.title,
          summary: a.summary || '',
        }));
        const newsResult = await api.getNewsScriptSegments(newsItems, data.djName);
        await new Promise(resolve => setTimeout(resolve, 500));

        setCurrentStep(4);
        const musicQuery = `아침을 깨우는 상쾌한 파워 팝송 플레이리스트`;
        await api.searchMusic(musicQuery);
        await new Promise(resolve => setTimeout(resolve, 500));

        onComplete({
          greeting: greetingResult.script,
          news: newsResult.scripts,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '로딩 중 오류가 발생했습니다.');
      }
    };

    loadData();
  }, [data.name, data.djName, data.newsCategories, data.radioRatio, onComplete]);

  const statusMessage = STEP_MESSAGES[currentStep] ?? '준비하는 중이에요';

  return (
    <div className="min-h-screen bg-toss-gray px-6 safe-area flex flex-col justify-center items-center">
      <div className="max-w-md mx-auto w-full text-center">
        {/* 메인 메시지 */}
        <h2 className="text-2xl font-semibold text-toss-gray-dark leading-tight mb-2">
          바쁜 아침엔<br />
          조작 없이, 듣기만 하세요.
        </h2>

        {/* 현재 상태 메시지 */}
        <p className="text-base text-gray-600 mb-8">
          {error ? error : statusMessage}
        </p>

        {/* 스켈레톤 로딩 바 3개 (플레이스홀더) */}
        <div className="space-y-4 flex flex-col items-center">
          <div className="h-4 bg-gray-200 rounded-toss-button" style={{ width: '85%' }} />
          <div className="h-4 bg-gray-200 rounded-toss-button" style={{ width: '70%' }} />
          <div className="h-4 bg-gray-200 rounded-toss-button" style={{ width: '55%' }} />
        </div>

        {error && (
          <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-toss">
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
