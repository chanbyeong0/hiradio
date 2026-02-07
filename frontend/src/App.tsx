import { useState, useEffect } from 'react';
import { AppScreen, DJ_SPEAKER_IDS, MusicTrack, OnboardingData, RadioScripts, SessionState } from './types';
import { storage } from './utils/storage';
import WelcomeScreen from './components/WelcomeScreen';
import OnboardingScreen from './components/OnboardingScreen';
import PreviewScreen from './components/PreviewScreen';
import LoadingScreen from './components/LoadingScreen';
import NowPlayingScreen from './components/NowPlayingScreen';
import EndScreen from './components/EndScreen';

function App() {
  const [screen, setScreen] = useState<AppScreen>('WELCOME');
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [previousScript, setPreviousScript] = useState<string | undefined>(undefined);
  /** 로딩 화면에서 한 번만 생성한 라디오 스크립트 (인사말/뉴스) → 재생 화면에서 재사용 */
  const [loadingScripts, setLoadingScripts] = useState<RadioScripts | null>(null);
  /** 미리보기에서 골라둔 첫 곡 + 무드 (첫 곡 소개 멘트용) */
  const [previewFirstTrack, setPreviewFirstTrack] = useState<MusicTrack | null>(null);
  const [previewMood, setPreviewMood] = useState<string>('');

  useEffect(() => {
    try {
      const saved = storage.load();
      if (saved) {
        setOnboardingData(saved);
      }
    } catch (err) {
      console.error('저장된 데이터 로드 실패:', err);
      setError('저장된 데이터를 불러오는 중 오류가 발생했습니다.');
    }
  }, []);

  const handleStart = () => {
    if (onboardingData) {
      setScreen('PREVIEW');
    } else {
      setScreen('ONBOARDING');
    }
  };

  const handleNewUser = () => {
    setScreen('ONBOARDING');
  };

  const handleCloseOnboarding = () => {
    setScreen('WELCOME');
  };

  const handleOnboardingComplete = (data: OnboardingData) => {
    try {
      storage.save(data);
      setOnboardingData(data);
      setScreen('PREVIEW');
      setError(null);
    } catch (err) {
      console.error('데이터 저장 실패:', err);
      setError('데이터 저장 중 오류가 발생했습니다.');
    }
  };

  const handleStartSession = (firstTrack: MusicTrack | null, mood: string = '') => {
    setPreviewFirstTrack(firstTrack);
    setPreviewMood(mood && !mood.includes('로딩') ? mood : '');
    setScreen('LOADING');
    setLoadingScripts(null);
    setError(null);
  };

  const handleLoadingComplete = (scripts: RadioScripts) => {
    setLoadingScripts(scripts);
    setScreen('NOW_PLAYING');
    setSessionState('PLAYING_RADIO');
    setError(null);
  };

  const handleEnd = () => {
    setScreen('END');
    setSessionState('ENDED');
  };

  const handleBackToWelcome = () => {
    setScreen('WELCOME');
    setSessionState('IDLE');
    setLoadingScripts(null);
    setPreviewFirstTrack(null);
    setPreviewMood('');
    setError(null);
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
        <div className="max-w-md w-full card">
          <div className="text-red-600 mb-4">{error}</div>
          <button onClick={() => setError(null)} className="btn-primary w-full">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!onboardingData && screen !== 'WELCOME' && screen !== 'ONBOARDING') {
    return <WelcomeScreen onStart={handleStart} onNewUser={handleNewUser} />;
  }

  switch (screen) {
    case 'WELCOME':
      return <WelcomeScreen onStart={handleStart} onNewUser={handleNewUser} />;
    case 'ONBOARDING':
      return <OnboardingScreen onComplete={handleOnboardingComplete} onClose={handleCloseOnboarding} />;
    case 'PREVIEW':
      return onboardingData ? (
        <PreviewScreen
          data={onboardingData}
          onStart={handleStartSession}
        />
      ) : null;
    case 'LOADING':
      return onboardingData ? (
        <LoadingScreen
          data={onboardingData}
          onComplete={handleLoadingComplete}
        />
      ) : null;
    case 'NOW_PLAYING':
      return onboardingData ? (
        <NowPlayingScreen
          data={onboardingData}
          initialScripts={loadingScripts}
          initialFirstTrack={previewFirstTrack}
          initialMood={previewMood}
          sessionState={sessionState}
          onStateChange={setSessionState}
          onEnd={(script) => {
            setPreviousScript(script);
            handleEnd();
          }}
        />
      ) : null;
    case 'END':
      return onboardingData ? (
        <EndScreen
          name={onboardingData.name}
          previousScript={previousScript}
          speaker={DJ_SPEAKER_IDS[onboardingData.djName ?? '커순이'] ?? 'vhyeri'}
          onBack={handleBackToWelcome}
        />
      ) : null;
    default:
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div>알 수 없는 화면입니다.</div>
        </div>
      );
  }
}

export default App;
