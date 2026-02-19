import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import './index.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// 에러 핸들링
window.addEventListener('error', (event) => {
  console.error('전역 에러:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('처리되지 않은 Promise 거부:', event.reason);
});

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('root 엘리먼트를 찾을 수 없습니다.');
  }

  const app = (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  const root = ReactDOM.createRoot(rootElement);
  if (GOOGLE_CLIENT_ID) {
    root.render(
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        {app}
      </GoogleOAuthProvider>
    );
  } else {
    root.render(app);
  }
} catch (error) {
  console.error('앱 초기화 실패:', error);
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h1>앱 로드 실패</h1>
      <p>${error instanceof Error ? error.message : '알 수 없는 오류'}</p>
      <p>브라우저 콘솔을 확인해주세요.</p>
    </div>
  `;
}
