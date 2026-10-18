import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearch } from '@/hooks';
import { useMapStore } from '@/stores';
import type { SearchCandidate } from '@/types';
import './SearchInput.css';

export function SearchInput() {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: searchResult, isLoading } = useSearch(query);
  const setView = useMapStore((s) => s.setView);
  const setPopupData = useMapStore((s) => s.setPopupData);

  const candidates = searchResult?.candidates || [];

  const selectCandidate = useCallback(
    (candidate: SearchCandidate) => {
      setView([candidate.lat, candidate.lon], 15);
      setQuery('');
      setShowSuggestions(false);

      // ポップアップをセット
      if (candidate.code.match(/JA\d*\/.+/)) {
        // SOTAサミット
        setPopupData({
          type: 'summit',
          position: [candidate.lat, candidate.lon],
          data: {
            lat: candidate.lat,
            lon: candidate.lon,
            alt: 0,
            count: 0,
          },
        });
      } else if (candidate.code.match(/JP-|JAFF-/)) {
        // POTA/JAFF公園
        setPopupData({
          type: 'park',
          position: [candidate.lat, candidate.lon],
          data: {
            lat: candidate.lat,
            lon: candidate.lon,
            pota: candidate.code.startsWith('JP-') ? candidate.code : '',
            wwff: candidate.code.startsWith('JAFF-') ? candidate.code : '',
            nameJ: candidate.name,
            locid: [],
          },
        });
      }
    },
    [setView, setPopupData]
  );

  // 検索結果が1件の場合は自動でジャンプ
  useEffect(() => {
    if (candidates.length === 1 && query.length >= 2 && showSuggestions) {
      selectCandidate(candidates[0]);
    }
  }, [candidates, query, showSuggestions, selectCandidate]);

  const handleSelect = selectCandidate;

  // クリック外側で閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="search-container">
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search SOTA/POTA reference..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
      />
      {showSuggestions && query.length >= 2 && (
        <div ref={suggestionsRef} className="search-suggestions">
          {isLoading ? (
            <div className="search-loading">Searching...</div>
          ) : candidates.length === 0 ? (
            <div className="search-empty">No results</div>
          ) : (
            candidates.map((candidate: SearchCandidate, idx: number) => (
              <div
                key={`${candidate.code}-${idx}`}
                className="search-suggestion-item"
                onClick={() => handleSelect(candidate)}
              >
                <span className="search-code">{candidate.code}</span>
                <span className="search-name">{candidate.name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
