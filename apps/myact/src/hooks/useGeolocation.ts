import { useState, useCallback, useEffect, useRef } from 'react';

export interface GeolocationState {
  loading: boolean;
  error: string | null;
  position: GeolocationPosition | null;
  permissionState: PermissionState | null;
}

interface UseGeolocationOptions {
  /** 初期ロード時に権限が許可済みなら自動取得する */
  autoFetchIfGranted?: boolean;
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { autoFetchIfGranted = false } = options;
  const hasAutoFetched = useRef(false);

  const [state, setState] = useState<GeolocationState>({
    loading: false,
    error: null,
    position: null,
    permissionState: null,
  });

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Geolocation is not supported by this browser',
        position: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    // オリジナルと同じ設定で位置取得
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[Geolocation] Position acquired:', position.coords.latitude, position.coords.longitude);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
          position,
        }));
      },
      (error) => {
        let errorMessage: string;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
          default:
            errorMessage = 'An unknown error occurred';
        }
        console.log('[Geolocation] Error:', errorMessage);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
          position: null,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // キャッシュを使わない（オリジナルと同じ）
      }
    );
  }, []);

  // 初期ロード時に権限を確認し、許可済みなら自動取得
  useEffect(() => {
    if (!autoFetchIfGranted || hasAutoFetched.current) return;

    async function checkPermissionAndFetch() {
      if (!navigator.permissions?.query) {
        // permissions API非対応
        console.log('[Geolocation] Permissions API not supported');
        setState((prev) => ({ ...prev, permissionState: null }));
        return;
      }

      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        console.log('[Geolocation] Permission state:', result.state);
        setState((prev) => ({ ...prev, permissionState: result.state }));

        if (result.state === 'granted' && !hasAutoFetched.current) {
          console.log('[Geolocation] Permission granted, auto-fetching position...');
          hasAutoFetched.current = true;
          getCurrentPosition();
        } else if (result.state === 'prompt') {
          console.log('[Geolocation] Permission not yet granted, waiting for user action');
        } else if (result.state === 'denied') {
          console.log('[Geolocation] Permission denied by user');
        }

        // 権限状態の変更を監視
        result.addEventListener('change', () => {
          console.log('[Geolocation] Permission state changed to:', result.state);
          setState((prev) => ({ ...prev, permissionState: result.state }));
        });
      } catch (err) {
        // permissions API非対応
        console.log('[Geolocation] Permissions query failed:', err);
        setState((prev) => ({ ...prev, permissionState: null }));
      }
    }

    checkPermissionAndFetch();
  }, [autoFetchIfGranted, getCurrentPosition]);

  return {
    ...state,
    getCurrentPosition,
  };
}
