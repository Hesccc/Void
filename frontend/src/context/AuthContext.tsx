import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { api, setToken } from '../api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (u: Partial<User>) => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshAuth = async () => {
    const token = localStorage.getItem('void_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.checkAuth();
      setUser(data);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();

    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('void_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('void_unauthorized', handleUnauthorized);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.login(username, password);
    setUser({
      username: res.username,
      must_change_password: res.must_change_password,
    });
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const updateUser = (updated: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updated });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
