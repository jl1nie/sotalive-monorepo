import { useState, useCallback } from 'react';
import { usePrefsStore } from '@/stores';
import { api } from '@/api/client';
import './PotaLogManager.css';

// アップロード機能の有効/無効フラグ
const ENABLE_UPLOAD = false;

interface PotaLogManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PotaLogManager({ isOpen, onClose }: PotaLogManagerProps) {
  const [activeTab, setActiveTab] = useState<'activator' | 'hunter'>('activator');
  const [shareId, setShareId] = useState('');
  const [shareResult, setShareResult] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activatorUuid = usePrefsStore((s) => s.pota_activator_uuid);
  const hunterUuid = usePrefsStore((s) => s.pota_hunter_uuid);
  const setPreference = usePrefsStore((s) => s.setPreference);

  // ログ共有（エクスポート）
  const handleExport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setShareResult(null);

    try {
      const result = await api.exportPotaLog(activatorUuid, hunterUuid);
      setShareResult(result.share_id);
    } catch (err) {
      setError('Failed to export log');
      console.error('Export error:', err);
    } finally {
      setLoading(false);
    }
  }, [activatorUuid, hunterUuid]);

  // ログインポート
  const handleImport = useCallback(async () => {
    if (!shareId.trim()) {
      setError('Please enter a share ID');
      return;
    }

    setLoading(true);
    setError(null);
    setImportResult(null);

    try {
      const result = await api.importPotaLog(shareId.trim());

      // UUIDを保存
      if (result.activator_logid) {
        setPreference('pota_activator_uuid', result.activator_logid);
      }
      if (result.hunter_logid) {
        setPreference('pota_hunter_uuid', result.hunter_logid);
      }

      setImportResult('Log imported successfully!');
      setShareId('');
    } catch (err) {
      setError('Failed to import log');
      console.error('Import error:', err);
    } finally {
      setLoading(false);
    }
  }, [shareId, setPreference]);

  // ログ削除
  const handleDelete = useCallback(async (type: 'activator' | 'hunter') => {
    const uuid = type === 'activator' ? activatorUuid : hunterUuid;
    if (!uuid) return;

    if (!confirm(`Are you sure you want to delete the ${type} log?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.deletePotaLog(uuid);
      setPreference(
        type === 'activator' ? 'pota_activator_uuid' : 'pota_hunter_uuid',
        null
      );
    } catch (err) {
      setError(`Failed to delete ${type} log`);
      console.error('Delete error:', err);
    } finally {
      setLoading(false);
    }
  }, [activatorUuid, hunterUuid, setPreference]);

  // ファイルアップロード（無効化可能）
  const handleUpload = useCallback(async (file: File) => {
    if (!ENABLE_UPLOAD) {
      setError('Upload is currently disabled');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const targetUuid = activeTab === 'activator' ? activatorUuid : hunterUuid;
      const result = await api.uploadPotaLog(
        activeTab === 'activator' ? targetUuid : null,
        activeTab === 'hunter' ? targetUuid : null,
        file
      );

      setPreference(
        activeTab === 'activator' ? 'pota_activator_uuid' : 'pota_hunter_uuid',
        result.logId
      );
    } catch (err) {
      setError('Failed to upload log');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, activatorUuid, hunterUuid, setPreference]);

  if (!isOpen) return null;

  return (
    <div className="potalog-overlay" onClick={onClose}>
      <div className="potalog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="potalog-header">
          <h2>POTA Log Manager</h2>
          <button className="potalog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="potalog-tabs">
          <button
            className={`potalog-tab ${activeTab === 'activator' ? 'active' : ''}`}
            onClick={() => setActiveTab('activator')}
          >
            Activator
          </button>
          <button
            className={`potalog-tab ${activeTab === 'hunter' ? 'active' : ''}`}
            onClick={() => setActiveTab('hunter')}
          >
            Hunter
          </button>
        </div>

        <div className="potalog-body">
          {error && <div className="potalog-error">{error}</div>}

          {/* 現在のログ状態 */}
          <section className="potalog-section">
            <h3>Current Log</h3>
            <div className="potalog-status">
              {activeTab === 'activator' ? (
                activatorUuid ? (
                  <>
                    <span className="potalog-uuid">UUID: {activatorUuid.slice(0, 8)}...</span>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete('activator')}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <span className="potalog-empty">No activator log</span>
                )
              ) : hunterUuid ? (
                <>
                  <span className="potalog-uuid">UUID: {hunterUuid.slice(0, 8)}...</span>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete('hunter')}
                    disabled={loading}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <span className="potalog-empty">No hunter log</span>
              )}
            </div>
          </section>

          {/* アップロード（無効化時はメッセージ表示） */}
          <section className="potalog-section">
            <h3>Upload Log</h3>
            {ENABLE_UPLOAD ? (
              <div className="potalog-upload">
                <input
                  type="file"
                  accept=".csv,.adi,.adif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                  disabled={loading}
                />
                <p className="potalog-hint">
                  Accepts ADIF (.adi, .adif) or CSV files
                </p>
              </div>
            ) : (
              <div className="potalog-disabled">
                <p>Upload is currently disabled.</p>
                <p className="potalog-hint">
                  Use the Share/Import feature to transfer logs between devices.
                </p>
              </div>
            )}
          </section>

          {/* 共有（エクスポート） */}
          <section className="potalog-section">
            <h3>Share Log</h3>
            <p className="potalog-hint">
              Generate a share ID to transfer your log to another device.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={loading || (!activatorUuid && !hunterUuid)}
            >
              Generate Share ID
            </button>
            {shareResult && (
              <div className="potalog-share-result">
                <span>Share ID:</span>
                <code>{shareResult}</code>
                <button
                  className="btn btn-small"
                  onClick={() => navigator.clipboard.writeText(shareResult)}
                >
                  Copy
                </button>
              </div>
            )}
          </section>

          {/* インポート */}
          <section className="potalog-section">
            <h3>Import Log</h3>
            <p className="potalog-hint">
              Enter a share ID to import a log from another device.
            </p>
            <div className="potalog-import">
              <input
                type="text"
                placeholder="Enter share ID"
                value={shareId}
                onChange={(e) => setShareId(e.target.value)}
                disabled={loading}
              />
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={loading || !shareId.trim()}
              >
                Import
              </button>
            </div>
            {importResult && (
              <div className="potalog-import-result">{importResult}</div>
            )}
          </section>
        </div>

        <div className="potalog-footer">
          <button className="btn btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
