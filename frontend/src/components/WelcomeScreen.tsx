import { OnboardingData } from '../types';
import { storage } from '../utils/storage';
import logo from '../assets/images/logo.png';

interface Props {
  onStart: () => void;
  onNewUser: () => void;
}

export default function WelcomeScreen({ onStart, onNewUser }: Props) {
  const saved = storage.load();

  return (
    <div className="min-h-screen flex flex-col px-6 bg-toss-gray safe-area">
      {/* 상단 정보 섹션 - 가운데 정렬 */}
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto pt-12">
        {/* 로고 이미지 */}
        <div className="mb-3">
          <img
            src={logo}
            alt="온에어 로고"
            className="w-48 h-48 mx-auto object-contain"
          />
        </div>

        {/* Pill 라벨 */}
        <div className="toss-banner mb-6">
          <span className="text-sm font-semibold text-primary">ONAIR</span>
        </div>

        {/* 메인 타이틀 */}
        <h1 className="text-2xl font-semibold mb-4 text-toss-gray-dark leading-tight">
          나만의 출근길<br />라디오 만들기
        </h1>

        {/* 설명 텍스트 */}
        <p className="text-base text-gray-600 leading-relaxed mb-12 px-2">
          한 번만 설정하면, 내일 아침부터는<br />
          앱이 먼저 말을 걸어주는 출근 루틴.
        </p>
      </div>

      {/* 하단 버튼 섹션 */}
      <div className="w-full max-w-sm mx-auto pb-8 space-y-3">
        {saved ? (
          <>
            <button
              onClick={onStart}
              className="toss-btn-primary"
            >
              바로 시작하기
            </button>
            <button
              onClick={onNewUser}
              className="toss-btn-secondary"
            >
              설정 다시 하기
            </button>
          </>
        ) : (
          <button
            onClick={onNewUser}
            className="toss-btn-primary"
          >
            바로 시작하기
          </button>
        )}
      </div>
    </div>
  );
}
