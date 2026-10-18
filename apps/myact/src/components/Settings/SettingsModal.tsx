import { useCallback } from 'react';
import { usePrefsStore } from '@/stores';
import { useTranslation } from '@/hooks';
import type { Preferences, Language } from '@/types/preferences';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const prefs = usePrefsStore();
  const setPreference = usePrefsStore((s) => s.setPreference);
  const resetPreferences = usePrefsStore((s) => s.resetPreferences);

  const handleToggle = useCallback(
    (key: keyof Preferences) => {
      setPreference(key, !prefs[key] as Preferences[typeof key]);
    },
    [prefs, setPreference]
  );

  const handleChange = useCallback(
    (key: keyof Preferences, value: string | number) => {
      setPreference(key, value as Preferences[typeof key]);
    },
    [setPreference]
  );

  const handleLanguageChange = useCallback(
    (lang: Language) => {
      setPreference('language', lang);
    },
    [setPreference]
  );

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t('settings')}</h2>
          <button className="settings-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-body">
          {/* 言語設定 */}
          <section className="settings-section">
            <h3>{t('language')}</h3>
            <div className="settings-language-toggle">
              <button
                className={`lang-btn ${prefs.language === 'ja' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('ja')}
              >
                {t('japanese')}
              </button>
              <button
                className={`lang-btn ${prefs.language === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
              >
                {t('english')}
              </button>
            </div>
          </section>

          {/* 表示対象 */}
          <section className="settings-section">
            <h3>{t('display')}</h3>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.sota_ref}
                onChange={() => handleToggle('sota_ref')}
              />
              <span>{t('sotaReference')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.pota_ref}
                onChange={() => handleToggle('pota_ref')}
              />
              <span>{t('potaReference')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.jaff_ref}
                onChange={() => handleToggle('jaff_ref')}
              />
              <span>{t('jaffReference')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.display_area}
                onChange={() => handleToggle('display_area')}
              />
              <span>{t('potaJaffPolygon')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.aprs_track}
                onChange={() => handleToggle('aprs_track')}
              />
              <span>{t('aprsTrack')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.pilgrim}
                onChange={() => handleToggle('pilgrim')}
              />
              <span>{t('activationZone')}</span>
            </label>
          </section>

          {/* マーカー設定 */}
          <section className="settings-section">
            <h3>{t('marker')}</h3>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.popup_permanent}
                onChange={() => handleToggle('popup_permanent')}
              />
              <span>{t('permanentPopup')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.link_googlemap}
                onChange={() => handleToggle('link_googlemap')}
              />
              <span>{t('googleMapsLink')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.display_mapcode}
                onChange={() => handleToggle('display_mapcode')}
              />
              <span>{t('displayMapcode')}</span>
            </label>
            <label className="settings-range">
              <span>{t('zoomThreshold')}: {prefs.zoom_threshold}</span>
              <input
                type="range"
                min="8"
                max="16"
                value={prefs.zoom_threshold}
                onChange={(e) =>
                  handleChange('zoom_threshold', Number(e.target.value))
                }
              />
            </label>
          </section>

          {/* スポット設定 */}
          <section className="settings-section">
            <h3>{t('spots')}</h3>
            <label className="settings-select">
              <span>{t('spotPeriod')}:</span>
              <select
                value={prefs.spot_period}
                onChange={(e) =>
                  handleChange('spot_period', Number(e.target.value))
                }
              >
                {[1, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
                  <option key={h} value={h}>
                    {h} {t('hours')}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.by_call}
                onChange={() => handleToggle('by_call')}
              />
              <span>{t('groupByCallsign')}</span>
            </label>
          </section>

          {/* POTAログ */}
          <section className="settings-section">
            <h3>{t('potaLog')}</h3>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.show_potalog}
                onChange={() => handleToggle('show_potalog')}
              />
              <span>{t('showHunterLog')}</span>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.show_potaactlog}
                onChange={() => handleToggle('show_potaactlog')}
              />
              <span>{t('showActivatorLog')}</span>
            </label>
            <label className="settings-input">
              <span>{t('hunterUuid')}:</span>
              <input
                type="text"
                value={prefs.pota_hunter_uuid || ''}
                onChange={(e) =>
                  handleChange('pota_hunter_uuid', e.target.value || '')
                }
                placeholder={t('enterUuid')}
              />
            </label>
            <label className="settings-input">
              <span>{t('activatorUuid')}:</span>
              <input
                type="text"
                value={prefs.pota_activator_uuid || ''}
                onChange={(e) =>
                  handleChange('pota_activator_uuid', e.target.value || '')
                }
                placeholder={t('enterUuid')}
              />
            </label>
          </section>
        </div>

        <div className="settings-footer">
          <button className="btn btn-reset" onClick={resetPreferences}>
            {t('resetToDefaults')}
          </button>
          <button className="btn btn-close" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
