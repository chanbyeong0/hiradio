import { User } from '../types';

const AUTH_STORAGE_KEY = 'bazzenco_user';

export const authStorage = {
  save(user: User): void {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  },

  load(): User | null {
    const item = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!item) return null;
    try {
      const data = JSON.parse(item) as Partial<User>;
      if (data?.user_id && typeof data.user_id === 'string') {
        return data as User;
      }
    } catch {
      // ignore
    }
    return null;
  },

  clear(): void {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },
};
