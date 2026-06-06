import { create } from 'zustand';
import type { UserInfo } from '../types';
import { loginApi, registerApi, getMeApi } from '../api/auth';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string, captchaId?: string, captchaCode?: string) => Promise<void>;
  register: (username: string, email: string, password: string, code?: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  setUser: (user: UserInfo, token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,

  setUser: (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  login: async (username: string, password: string, captchaId?: string, captchaCode?: string) => {
    set({ loading: true });
    try {
      const { token, user } = await loginApi(username, password, captchaId, captchaCode);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true, loading: false });
    } catch (err: any) {
      set({ loading: false });
      const error = new Error(err.response?.data?.error || '登录失败');
      (error as any).banInfo = err.response?.data?.banInfo || null;
      throw error;
    }
  },

  register: async (username, email, password, code) => {
    set({ loading: true });
    try {
      const { token, user } = await registerApi(username, email, password, code);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true, loading: false });
    } catch (err: any) {
      set({ loading: false });
      throw new Error(err.response?.data?.error || '注册失败');
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    try {
      const { user } = await getMeApi();
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    } catch {
      // token 失效，退出登录
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
