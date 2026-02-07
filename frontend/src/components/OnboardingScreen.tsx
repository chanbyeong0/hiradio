import { useState, useRef, useEffect } from 'react';
import { OnboardingData } from '../types';
import { api } from '../api';

interface Props {
  onComplete: (data: OnboardingData) => void;
  onClose?: () => void;
}

const NEWS_CATEGORIES = [
  { id: 'politics', label: '정치' },
  { id: 'economy', label: '경제' },
  { id: 'society', label: '사회' },
  { id: 'culture', label: '문화' },
  { id: 'world', label: '세계' },
  { id: 'tech', label: '기술' },
  { id: 'entertainment', label: '엔터' },
  { id: 'opinion', label: '예술' },
];

const RATIO_PRESETS = [
  { radio: 3, music: 1, label: '3:1' },
  { radio: 2, music: 1, label: '2:1' },
  { radio: 4, music: 1, label: '4:1' },
];

const DJ_OPTIONS: Array<{ id: '커돌이' | '커순이'; label: string }> = [
  { id: '커돌이', label: '커돌이 (남자)' },
  { id: '커순이', label: '커순이 (여자)' },
];

export type PlaceSuggestion = { name: string; address: string; category: string; x: string; y: string };

export default function OnboardingScreen({ onComplete, onClose }: Props) {
  const [name, setName] = useState('');
  const [startLocation, setStartLocation] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<PlaceSuggestion[]>([]);
  const [startDropdownOpen, setStartDropdownOpen] = useState(false);
  const [startSelectedIndex, setStartSelectedIndex] = useState(-1);
  const startAutocompleteRef = useRef<HTMLDivElement>(null);
  const [companyLocation, setCompanyLocation] = useState('');
  const [companySuggestions, setCompanySuggestions] = useState<PlaceSuggestion[]>([]);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [companySelectedIndex, setCompanySelectedIndex] = useState(-1);
  const companyAutocompleteRef = useRef<HTMLDivElement>(null);
  const autocompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [djName, setDjName] = useState<'커돌이' | '커순이'>('커순이');
  const [radioRatio, setRadioRatio] = useState(3);
  const [musicRatio, setMusicRatio] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      } else if (prev.length < radioRatio) {
        return [...prev, categoryId];
      }
      return prev; // 비율에 따라 최대 radioRatio개만 선택 (2:1이면 2개)
    });
  };

  const handlePreset = (radio: number, music: number) => {
    setRadioRatio(radio);
    setMusicRatio(music);
  };

  const fetchStartAutocomplete = (query: string) => {
    if (!query.trim()) {
      setStartSuggestions([]);
      setStartDropdownOpen(false);
      return;
    }
    api.getPlaceAutocomplete(query).then(({ results }) => {
      setStartSuggestions(results);
      setStartSelectedIndex(-1);
      setStartDropdownOpen(results.length > 0);
    });
  };

  const onStartInputChange = (value: string) => {
    setStartLocation(value);
    if (autocompleteTimeoutRef.current) clearTimeout(autocompleteTimeoutRef.current);
    autocompleteTimeoutRef.current = setTimeout(() => fetchStartAutocomplete(value), 300);
  };

  const selectStartPlace = (place: PlaceSuggestion) => {
    setStartLocation(place.name);
    setStartDropdownOpen(false);
    setStartSuggestions([]);
  };

  const onStartKeyDown = (e: React.KeyboardEvent) => {
    if (!startDropdownOpen || startSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setStartSelectedIndex((i) => (i < startSuggestions.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setStartSelectedIndex((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === 'Enter' && startSelectedIndex >= 0 && startSuggestions[startSelectedIndex]) {
      e.preventDefault();
      selectStartPlace(startSuggestions[startSelectedIndex]);
    } else if (e.key === 'Escape') {
      setStartDropdownOpen(false);
    }
  };

  const fetchCompanyAutocomplete = (query: string) => {
    if (!query.trim()) {
      setCompanySuggestions([]);
      setCompanyDropdownOpen(false);
      return;
    }
    api.getPlaceAutocomplete(query).then(({ results }) => {
      setCompanySuggestions(results);
      setCompanySelectedIndex(-1);
      setCompanyDropdownOpen(results.length > 0);
    });
  };

  const onCompanyInputChange = (value: string) => {
    setCompanyLocation(value);
    if (autocompleteTimeoutRef.current) clearTimeout(autocompleteTimeoutRef.current);
    autocompleteTimeoutRef.current = setTimeout(() => fetchCompanyAutocomplete(value), 300);
  };

  const selectCompanyPlace = (place: PlaceSuggestion) => {
    setCompanyLocation(place.name);
    setCompanyDropdownOpen(false);
    setCompanySuggestions([]);
  };

  const onCompanyKeyDown = (e: React.KeyboardEvent) => {
    if (!companyDropdownOpen || companySuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCompanySelectedIndex((i) => (i < companySuggestions.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCompanySelectedIndex((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === 'Enter' && companySelectedIndex >= 0 && companySuggestions[companySelectedIndex]) {
      e.preventDefault();
      selectCompanyPlace(companySuggestions[companySelectedIndex]);
    } else if (e.key === 'Escape') {
      setCompanyDropdownOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (startAutocompleteRef.current && !startAutocompleteRef.current.contains(target)) {
        setStartDropdownOpen(false);
      }
      if (companyAutocompleteRef.current && !companyAutocompleteRef.current.contains(target)) {
        setCompanyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (autocompleteTimeoutRef.current) clearTimeout(autocompleteTimeoutRef.current);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startLocation.trim() || !companyLocation.trim()) {
      alert('이름, 집 주소, 회사 위치를 입력해주세요.');
      return;
    }
    onComplete({
      name,
      startLocation,
      companyLocation,
      djName,
      radioRatio,
      musicRatio,
      newsCategories: selectedCategories,
    });
  };

  return (
    <div className="min-h-screen bg-toss-gray safe-area">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 -ml-1 rounded-full text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="닫기"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <div className="w-10" />
        )}
        <h1 className="text-lg font-semibold text-toss-gray-dark flex-1 text-center">
          출근길 기본 설정
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 나에 대해 알려주세요 섹션 */}
          <div className="toss-card">
            <h2 className="text-base font-semibold text-toss-gray-dark mb-4">
              나에 대해 알려주세요
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-2 font-medium">
                  이름
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="toss-input"
                  placeholder="효정"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2 font-medium">
                  집 주소
                </label>
                <div className="relative" ref={startAutocompleteRef}>
                  <input
                    type="text"
                    value={startLocation}
                    onChange={(e) => onStartInputChange(e.target.value)}
                    onFocus={() => startSuggestions.length > 0 && setStartDropdownOpen(true)}
                    onKeyDown={onStartKeyDown}
                    className="toss-input w-full"
                    placeholder="예: 집 근처 역, 주소 검색"
                    autoComplete="off"
                    required
                  />
                  {startDropdownOpen && startSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-0 bg-white border border-t-0 border-gray-200 rounded-b-lg shadow-lg max-h-60 overflow-y-auto">
                      {startSuggestions.map((place, idx) => (
                        <button
                          key={`start-${place.x}-${place.y}-${idx}`}
                          type="button"
                          onClick={() => selectStartPlace(place)}
                          className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                            idx === startSelectedIndex ? 'bg-primary/10' : ''
                          }`}
                        >
                          <div className="font-medium text-toss-gray-dark">{place.name}</div>
                          {place.address && (
                            <div className="text-xs text-gray-500 mt-0.5">{place.address}</div>
                          )}
                          {place.category && (
                            <span className="inline-block mt-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                              {place.category}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2 font-medium">
                  회사 위치
                </label>
                <div className="relative" ref={companyAutocompleteRef}>
                  <input
                    type="text"
                    value={companyLocation}
                    onChange={(e) => onCompanyInputChange(e.target.value)}
                    onFocus={() => companySuggestions.length > 0 && setCompanyDropdownOpen(true)}
                    onKeyDown={onCompanyKeyDown}
                    className="toss-input w-full"
                    placeholder="예: 강남역, 서울역, 주소 검색"
                    autoComplete="off"
                    required
                  />
                  {companyDropdownOpen && companySuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-0 bg-white border border-t-0 border-gray-200 rounded-b-lg shadow-lg max-h-60 overflow-y-auto">
                      {companySuggestions.map((place, idx) => (
                        <button
                          key={`company-${place.x}-${place.y}-${idx}`}
                          type="button"
                          onClick={() => selectCompanyPlace(place)}
                          className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                            idx === companySelectedIndex ? 'bg-primary/10' : ''
                          }`}
                        >
                          <div className="font-medium text-toss-gray-dark">{place.name}</div>
                          {place.address && (
                            <div className="text-xs text-gray-500 mt-0.5">{place.address}</div>
                          )}
                          {place.category && (
                            <span className="inline-block mt-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                              {place.category}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              역명·주소를 입력하면 장소를 골라줄 수 있어요.
            </p>
          </div>

          {/* DJ(성우) 선택 섹션 */}
          <div className="toss-card">
            <h2 className="text-base font-semibold text-toss-gray-dark mb-2">
              DJ 선택
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              출근길 라디오에서 말해줄 DJ(성우)를 골라 주세요.
            </p>
            <div className="flex flex-wrap gap-2">
              {DJ_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDjName(opt.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    djName === opt.id
                      ? 'bg-primary text-white'
                      : 'bg-white text-gray-700 border border-gray-200 active:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 라디오·음악 비율 섹션 */}
          <div className="toss-card">
            <h2 className="text-base font-semibold text-toss-gray-dark mb-4">
              라디오·음악 비율
            </h2>

            {/* 비율 슬라이더 */}
            <div className="space-y-5 mb-4">
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-base text-toss-gray-dark font-semibold">라디오</span>
                  <span className="text-base font-semibold text-primary">{radioRatio}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={radioRatio}
                  onChange={(e) => setRadioRatio(Number(e.target.value))}
                  className="toss-slider"
                />
              </div>
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-base text-toss-gray-dark font-semibold">음악</span>
                  <span className="text-base font-semibold text-primary">{musicRatio}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="3"
                  value={musicRatio}
                  onChange={(e) => setMusicRatio(Number(e.target.value))}
                  className="toss-slider"
                />
              </div>
            </div>

            {/* 현재 비율 표시 */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 text-center">
                현재 비율: <span className="font-semibold text-primary">{radioRatio}:{musicRatio}</span>
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">
                뉴스 세그먼트 {radioRatio}개 · 관심분야 최대 {radioRatio}개 선택 · 음악 {musicRatio}곡
              </p>
            </div>

            {/* 기본값 버튼 */}
            <button
              type="button"
              onClick={() => handlePreset(3, 1)}
              className="w-full py-2.5 px-3 rounded-toss-button text-sm font-medium bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors"
            >
              기본값 3:1로 맞추기
            </button>
          </div>

          {/* 관심 뉴스 테마 섹션 */}
          <div className="toss-card">
            <h2 className="text-base font-semibold text-toss-gray-dark mb-2">
              관심 뉴스 테마
            </h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              출근길 라디오에서 더 자주 듣고 싶은 뉴스 주제를 골라 주세요. 여러 개 선택할 수 있어요.
            </p>

            {/* 카테고리 버튼들 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {NEWS_CATEGORIES.map((category) => {
                const isSelected = selectedCategories.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleCategoryToggle(category.id)}
                    disabled={!isSelected && selectedCategories.length >= radioRatio}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary text-white'
                        : 'bg-white text-gray-700 border border-gray-200 active:bg-gray-50'
                    } ${
                      !isSelected && selectedCategories.length >= radioRatio
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-gray-400">
              선택하지 않으면, 아침 주요 헤드라인 위주로만 간단히 들어요.
            </p>
          </div>

          {/* 하단 버튼 */}
          <button type="submit" className="toss-btn-primary mt-6">
            출근길 미리보기
          </button>
        </form>
      </div>
    </div>
  );
}
