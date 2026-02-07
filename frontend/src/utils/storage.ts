import { OnboardingData } from '../types';

const STORAGE_KEY = 'bazzenco_onboarding';

export const storage = {
  save(data: OnboardingData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  load(): OnboardingData | null {
    const item = localStorage.getItem(STORAGE_KEY);
    if (!item) return null;
    const data = JSON.parse(item) as Partial<OnboardingData>;
    if (data && typeof data.name === 'string') {
      if (data.startLocation == null) data.startLocation = '';
      return data as OnboardingData;
    }
    return null;
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
