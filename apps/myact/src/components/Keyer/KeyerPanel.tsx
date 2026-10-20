import { useState, useCallback, useRef, useEffect } from 'react';
import { usePrefsStore } from '@/stores';
import './KeyerPanel.css';

// Web Serial API型定義
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}

interface Serial {
  requestPort(): Promise<SerialPort>;
}

declare global {
  interface Navigator {
    serial?: Serial;
  }
}

interface KeyerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// CWメッセージ変数置換
function expandMessage(template: string, prefs: ReturnType<typeof usePrefsStore.getState>): string {
  return template
    .replace(/\$CALL/g, prefs.pemu_call || 'NOCALL')
    .replace(/\$SOTA/g, prefs.pemu_sota || '')
    .replace(/\$POTA/g, prefs.pemu_pota || '')
    .replace(/\$JAFF/g, prefs.pemu_jaff || '')
    .replace(/\$CENTURY/g, prefs.pemu_century || '')
    .replace(/\$AREA/g, prefs.pemu_areacode || '');
}

export function KeyerPanel({ isOpen, onClose }: KeyerPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const portRef = useRef<SerialPort | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  const prefs = usePrefsStore();
  const setPreference = usePrefsStore((s) => s.setPreference);

  // WebSocket接続
  const connectWebSocket = useCallback(async () => {
    if (!prefs.enable_wifi) return;

    setStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(`ws://${prefs.pemu_host}/ws`);

      ws.onopen = () => {
        setStatus('connected');
        wsRef.current = ws;
      };

      ws.onerror = () => {
        setError('WebSocket connection failed');
        setStatus('disconnected');
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;
      };
    } catch {
      setError('Failed to connect via WebSocket');
      setStatus('disconnected');
    }
  }, [prefs.enable_wifi, prefs.pemu_host]);

  // WebSerial接続
  const connectSerial = useCallback(async () => {
    if (!prefs.enable_serial) return;
    if (!('serial' in navigator)) {
      setError('Web Serial API not supported');
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const port = await navigator.serial!.requestPort();
      await port.open({ baudRate: 115200 });

      const writer = port.writable?.getWriter();
      if (!writer) {
        throw new Error('Failed to get writer');
      }

      portRef.current = port;
      writerRef.current = writer;
      setStatus('connected');
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotFoundError') {
        setError('Failed to connect via Serial');
      }
      setStatus('disconnected');
    }
  }, [prefs.enable_serial]);

  // 切断
  const disconnect = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (writerRef.current) {
      await writerRef.current.close();
      writerRef.current = null;
    }

    if (portRef.current) {
      await portRef.current.close();
      portRef.current = null;
    }

    setStatus('disconnected');
  }, []);

  // メッセージ送信
  const sendMessage = useCallback(async (messageTemplate: string) => {
    const message = expandMessage(messageTemplate, prefs);
    const data = `${message}\n`;

    setSentMessage(message);

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      } else if (writerRef.current) {
        const encoder = new TextEncoder();
        await writerRef.current.write(encoder.encode(data));
      } else {
        setError('Not connected');
      }
    } catch {
      setError('Failed to send message');
    }
  }, [prefs]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  if (!isOpen) return null;

  const messages = [
    { label: 'MSG1', template: prefs.pemu_mesg1 },
    { label: 'MSG2', template: prefs.pemu_mesg2 },
    { label: 'MSG3', template: prefs.pemu_mesg3 },
    { label: 'MSG4', template: prefs.pemu_mesg4 },
  ];

  return (
    <div className="keyer-overlay" onClick={onClose}>
      <div className="keyer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="keyer-header">
          <h2>CW Keyer</h2>
          <button className="keyer-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="keyer-body">
          {error && <div className="keyer-error">{error}</div>}

          {/* 接続状態 */}
          <section className="keyer-section">
            <h3>Connection</h3>
            <div className="keyer-status">
              <span className={`keyer-status-indicator ${status}`} />
              <span className="keyer-status-text">
                {status === 'connected' ? 'Connected' :
                  status === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>

            {status === 'disconnected' && (
              <div className="keyer-connect-buttons">
                {prefs.enable_wifi && (
                  <button className="btn btn-primary" onClick={connectWebSocket}>
                    Connect WiFi
                  </button>
                )}
                {prefs.enable_serial && (
                  <button className="btn btn-primary" onClick={connectSerial}>
                    Connect Serial
                  </button>
                )}
              </div>
            )}

            {status === 'connected' && (
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            )}
          </section>

          {/* 基本設定 */}
          <section className="keyer-section">
            <h3>Settings</h3>
            <label className="keyer-input">
              <span>Callsign:</span>
              <input
                type="text"
                value={prefs.pemu_call}
                onChange={(e) => setPreference('pemu_call', e.target.value.toUpperCase())}
                placeholder="JA1XXX"
              />
            </label>
            <label className="keyer-input">
              <span>WPM:</span>
              <input
                type="number"
                min="10"
                max="50"
                value={prefs.pemu_wpm}
                onChange={(e) => setPreference('pemu_wpm', e.target.value)}
              />
            </label>
            <label className="keyer-input">
              <span>SOTA Ref:</span>
              <input
                type="text"
                value={prefs.pemu_sota}
                onChange={(e) => setPreference('pemu_sota', e.target.value.toUpperCase())}
                placeholder="JA/TK-001"
              />
            </label>
            <label className="keyer-input">
              <span>POTA Ref:</span>
              <input
                type="text"
                value={prefs.pemu_pota}
                onChange={(e) => setPreference('pemu_pota', e.target.value.toUpperCase())}
                placeholder="JP-0001"
              />
            </label>
          </section>

          {/* メッセージボタン */}
          <section className="keyer-section">
            <h3>Messages</h3>
            <div className="keyer-message-buttons">
              {messages.map((msg, idx) => (
                <button
                  key={idx}
                  className="keyer-message-btn"
                  onClick={() => sendMessage(msg.template)}
                  disabled={status !== 'connected'}
                  title={expandMessage(msg.template, prefs)}
                >
                  {msg.label}
                </button>
              ))}
            </div>
            {sentMessage && (
              <div className="keyer-sent">
                <span>Sent:</span>
                <code>{sentMessage}</code>
              </div>
            )}
          </section>
        </div>

        <div className="keyer-footer">
          <button className="btn btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
