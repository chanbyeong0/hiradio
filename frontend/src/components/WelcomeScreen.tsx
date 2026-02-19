import { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { User } from '../types';
import { api } from '../api';
import { storage } from '../utils/storage';
import { authStorage } from '../utils/authStorage';
import logo from '../assets/images/logo.png';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0 text-current">
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

interface Props {
  onStart: () => void;
  onNewUser: () => void;
}

export default function WelcomeScreen({ onStart, onNewUser }: Props) {
  const [user, setUser] = useState<User | null>(() => authStorage.load());
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const saved = storage.load();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // 로그인된 사용자: 토큰 수 최신화
  useEffect(() => {
    if (user?.access_token) {
      api.getTokens(user.access_token).then((res) => {
        setUser((u) => (u ? { ...u, tokens_remaining: res.tokens_remaining } : null));
        authStorage.save({ ...user!, tokens_remaining: res.tokens_remaining });
      }).catch(() => { });
    }
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSuccess = async (credential: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const userData = await api.verifyGoogleToken(credential);
      authStorage.save(userData);
      setUser(userData);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-toss-gray safe-area">
      {user && (
        <div className="absolute right-6 top-12 z-10 flex items-center gap-2">
          {user.tokens_remaining != null && (
            <span className="text-xs text-gray-500 font-medium">
              무료 {user.tokens_remaining}회
            </span>
          )}
          <button
            onClick={() => {
              authStorage.clear();
              setUser(null);
            }}
            className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-gray-100 shadow-sm hover:ring-primary/30 transition-all active:scale-95"
            title={`${user.name} (다른 계정으로 전환)`}
          >
            {user.picture ? (
              <img src={user.picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {user.name?.charAt(0) || '?'}
                </span>
              </div>
            )}
          </button>
        </div>
      )}

      {/* 전체 콘텐츠 - 화면 중앙 배치 */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* 로고 & 타이틀 */}
          <header className="text-center mb-8">
            <div>
              <img
                src={logo}
                alt="하이라디오"
                className="w-64 h-64 mx-auto object-contain drop-shadow-sm"
              />
            </div>
            <div className="toss-banner mt-4 mb-3">
              <span className="text-sm font-semibold text-primary">ONAIR</span>
            </div>
            <h1 className="text-xl font-semibold text-toss-gray-dark tracking-tight">
              나만의 출근길 라디오
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              한 번만 설정하면, 매일 아침 나에게 맞는 라디오
            </p>
          </header>

          {/* 메인 콘텐츠 */}
          <main className="w-full">
            {!user && googleClientId ? (
              /* 로그인 화면 - 구글 버튼만 */
              <section className="space-y-4">
                <div className="relative w-full">
                  {/* 보이는 버튼 - 흰색/아이보리 배경, 둥근 모서리, 얇은 테두리 */}
                  <div
                    className="flex items-center justify-center gap-2.5 w-full min-h-[52px] py-3.5 px-5 rounded-toss-button bg-white border border-gray-200 text-primary font-medium text-[15px] pointer-events-none"
                    aria-hidden
                  >
                    <GoogleIcon />
                    <span>Google 계정으로 계속하기</span>
                  </div>
                  {/* 클릭용 - 투명 오버레이 (Google iframe이 클릭 받음) */}
                  <div className="absolute inset-0 flex items-center justify-center rounded-toss-button overflow-hidden opacity-0 cursor-pointer [&>div]:min-w-full [&>div]:min-h-full [&>div]:flex [&>div]:items-center [&>div]:justify-center">
                    <GoogleLogin
                      onSuccess={(res) => {
                        if (res.credential) handleGoogleSuccess(res.credential);
                      }}
                      onError={() => setLoginError('Google 로그인을 취소했습니다.')}
                      useOneTap={false}
                      theme="filled_blue"
                      size="large"
                      text="continue_with"
                      shape="rectangular"
                      width={400}
                    />
                  </div>
                </div>
                {isLoggingIn && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    로그인 중...
                  </div>
                )}
                {loginError && (
                  <p className="text-sm text-red-500 text-center">{loginError}</p>
                )}
              </section>
            ) : user ? (
              /* 로그인 후 - 버튼만 */
              <section className="space-y-3">
                {saved ? (
                  <>
                    <button onClick={onStart} className="toss-btn-primary">
                      바로 시작하기
                    </button>
                    <button onClick={onNewUser} className="toss-btn-secondary">
                      설정 다시 하기
                    </button>
                  </>
                ) : (
                  <button onClick={onNewUser} className="toss-btn-primary">
                    바로 시작하기
                  </button>
                )}
              </section>
            ) : (
              /* 테스트 모드 */
              <section className="space-y-5">
                <div className="toss-account-card">
                  <p className="text-sm text-gray-500 text-center">
                    Google 로그인 없이 테스트할 수 있습니다
                  </p>
                </div>
                <div className="space-y-3">
                  {saved ? (
                    <>
                      <button onClick={onStart} className="toss-btn-primary">
                        테스트 모드로 시작
                      </button>
                      <button onClick={onNewUser} className="toss-btn-secondary">
                        설정 다시 하기
                      </button>
                    </>
                  ) : (
                    <button onClick={onNewUser} className="toss-btn-primary">
                      테스트 모드로 시작
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 text-center">
                  VITE_GOOGLE_CLIENT_ID를 설정하면 Google 로그인을 사용할 수 있습니다
                </p>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
