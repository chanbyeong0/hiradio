import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface Props {
  name: string;
  previousScript?: string; // 이전 스크립트 (인사말 + 뉴스)
  /** TTS 성우 speaker ID (클로바: vhyeri=커순이, nes_c_kihyo=커돌이) */
  speaker?: string;
  onBack: () => void;
}

export default function EndScreen({ name, previousScript, speaker = 'vhyeri', onBack }: Props) {
  const [closingScript, setClosingScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const playedTtsRef = useRef(false);

  useEffect(() => {
    const generateClosingScript = async () => {
      try {
        const result = await api.getClosingScript(previousScript);
        setClosingScript(result.script);
      } catch (err) {
        console.error('마무리 스크립트 생성 실패:', err);
        setClosingScript(null);
      } finally {
        setLoading(false);
      }
    };

    if (previousScript) {
      generateClosingScript();
    } else {
      setLoading(false);
    }
  }, [previousScript]);

  // 마무리말 TTS 자동 재생 (한 번만)
  const closingTtsUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!closingScript?.trim() || playedTtsRef.current) return;
    playedTtsRef.current = true;
    api
      .getTtsAudio(closingScript, { speaker })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        closingTtsUrlRef.current = url;
        const audio = new Audio(url);
        audio.onended = () => {
          if (closingTtsUrlRef.current) {
            URL.revokeObjectURL(closingTtsUrlRef.current);
            closingTtsUrlRef.current = null;
          }
        };
        audio.onerror = () => {
          if (closingTtsUrlRef.current) {
            URL.revokeObjectURL(closingTtsUrlRef.current);
            closingTtsUrlRef.current = null;
          }
        };
        audio.play().catch((err: DOMException) => {
          if (err.name === 'AbortError') return;
          console.error('마무리 TTS 재생 실패:', err);
        });
      })
      .catch((err) => console.error('마무리 TTS 재생 실패:', err));
    return () => {
      if (closingTtsUrlRef.current) {
        URL.revokeObjectURL(closingTtsUrlRef.current);
        closingTtsUrlRef.current = null;
      }
    };
  }, [closingScript, speaker]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-toss-gray safe-area">
      <div className="text-center mb-12 max-w-md">
        <div className="w-20 h-20 bg-primary/10 rounded-toss-lg mx-auto mb-6 flex items-center justify-center">
          <span className="text-5xl">🎉</span>
        </div>
        <h1 className="text-2xl font-semibold mb-3 text-toss-gray-dark">
          {name}님 도착했어요!
        </h1>
        {loading ? (
          <p className="text-base text-gray-500">마무리 인사말 준비 중...</p>
        ) : closingScript ? (
          <div className="toss-card mt-6 text-left">
            <div className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">마무리 인사</div>
            <p className="text-base leading-relaxed text-toss-gray-dark">
              {closingScript}
            </p>
          </div>
        ) : (
          <p className="text-base text-gray-500">
            오늘도 수고하셨습니다
          </p>
        )}
      </div>

      <div className="w-full max-w-sm pb-8">
        <button onClick={onBack} className="toss-btn-primary">
          처음으로
        </button>
      </div>
    </div>
  );
}
