import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/authApi';
import { getStoredToken, setStoredToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [system, setSystem] = useState({ allowLiveWrites: false, defaultMode: 'live' });
  const [initializing, setInitializing] = useState(true);
  const [modeVersion, setModeVersion] = useState(0);

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setInitializing(false);
      return;
    }
    try {
      const data = await authApi.me();
      setUser(data.user);
      setSystem(data.system || { allowLiveWrites: false });
    } catch (_err) {
      setStoredToken('');
      setUser(null);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (credentials) => {
    const data = await authApi.login(credentials);
    setUser(data.user);
    setSystem(data.system || { allowLiveWrites: false });
    setModeVersion((v) => v + 1);
    return data;
  };

  const loginDemo = async (opts) => {
    const data = await authApi.loginDemo(opts);
    setUser(data.user);
    setSystem(data.system || { allowLiveWrites: false });
    setModeVersion((v) => v + 1);
    return data;
  };

  const switchMode = async (nextMode) => {
    const data = await authApi.switchMode(nextMode);
    setUser(data.user);
    setSystem(data.system || { allowLiveWrites: false });
    setModeVersion((v) => v + 1);
    return data;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const updateAllowLiveWritesState = (allowLiveWrites) => {
    setSystem((prev) => ({ ...prev, allowLiveWrites }));
  };

  const canWriteEffective = Boolean(
    user?.permissions?.canWrite && (user?.mode === 'demo' || system?.allowLiveWrites)
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        system,
        initializing,
        modeVersion,
        canWriteRole: Boolean(user?.permissions?.canWrite),
        canWriteEffective,
        canDeleteRole: Boolean(user?.permissions?.canDelete),
        isAdmin: user?.role === 'admin',
        login,
        loginDemo,
        switchMode,
        logout,
        refreshProfile,
        updateAllowLiveWritesState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
