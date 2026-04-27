'use client';

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { useReviewStore, wavesurferRef } from '@/stores/review-store';
import { Correction, SrtSegment } from '@/types';
import { estimateWordStartTime, estimateWordEndTime } from '@/lib/time-utils';

type EditorHandle = { focus: () => void };

const CorrectionEditor = forwardRef<EditorHandle, {
  correction: Correction;
  segment: SrtSegment | undefined;
  onSave: (corrected: string | null, reviewNote?: string) => void;
  onNext?: () => void;
}>(function CorrectionEditor({ correction, segment, onSave, onNext }, ref) {
  const { setIsLooping, playbackRate } = useReviewStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLTextAreaElement>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const initial = correction.corrected ?? correction.original;
  const [value, setValue] = useState(initial);
  const [loopActive, setLoopActive] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    return () => { if (loopTimerRef.current) clearTimeout(loopTimerRef.current); };
  }, []);

  useEffect(() => {
    if (showReview) reviewRef.current?.focus();
  }, [showReview]);

  const getPlayRange = useCallback(() => {
    if (!segment) return { startTime: 0, duration: 0 };
    const totalWords = segment.words.length;
    const prevIndex = Math.max(0, correction.wordIndex - 2);

    const startTime = segment.wordTimings
      ? segment.wordTimings[prevIndex].startTime
      : estimateWordStartTime(segment.startTime, segment.endTime, prevIndex, totalWords);

    const endTime = segment.wordTimings
      ? segment.wordTimings[correction.wordIndex].endTime
      : estimateWordEndTime(segment.startTime, segment.endTime, correction.wordIndex, totalWords);

    return { startTime, duration: endTime - startTime };
  }, [segment, correction.wordIndex]);

  const stopLoop = useCallback(() => {
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }
    wavesurferRef.current?.pause();
    setLoopActive(false);
    setIsLooping(false);
  }, [setIsLooping]);

  const playOnce = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    stopLoop();
    const { startTime, duration } = getPlayRange();
    const dur = ws.getDuration();
    if (dur <= 0) return;
    ws.seekTo(startTime / dur);
    ws.play();
    loopTimerRef.current = setTimeout(() => ws.pause(), duration * 1000 / playbackRate);
  }, [getPlayRange, stopLoop, playbackRate]);

  const startLoop = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    setLoopActive(true);
    setIsLooping(true);
    const playLoop = () => {
      const { startTime, duration } = getPlayRange();
      const dur = ws.getDuration();
      if (dur <= 0) return;
      ws.seekTo(startTime / dur);
      ws.play();
      loopTimerRef.current = setTimeout(() => {
        ws.pause();
        loopTimerRef.current = setTimeout(playLoop, 300);
      }, duration * 1000 / playbackRate);
    };
    playLoop();
  }, [getPlayRange, setIsLooping, playbackRate]);

  const toggleLoop = useCallback(() => {
    loopActive ? stopLoop() : startLoop();
  }, [loopActive, startLoop, stopLoop]);

  const commit = useCallback(() => {
    stopLoop();
    onSave(value.trim() || null, reviewNote.trim() || undefined);
  }, [stopLoop, onSave, value, reviewNote]);

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {/* 수정 입력 */}
      <div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); commit(); onNext?.(); } }}
          placeholder="수정 내용 입력..."
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* 재검수 사유 */}
      {showReview && (
        <textarea
          ref={reviewRef}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); onNext?.(); } }}
          placeholder="재검수 사유 입력... (Enter로 저장)"
          rows={2}
          className="w-full mt-1.5 border border-amber-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
      )}

      {/* 재생, 반복, 재검수, 저장 */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <button
          onClick={playOnce}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex-shrink-0"
        >
          <span className="text-[10px]">▶</span> 재생
        </button>
        <button
          onClick={toggleLoop}
          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors flex-shrink-0 ${
            loopActive ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
          반복
        </button>
        <button
          onClick={() => setShowReview((v) => !v)}
          className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full transition-colors flex-shrink-0 ${
            showReview ? 'bg-amber-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
          title="재검수 사유 입력"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill={showReview ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          재검수
        </button>
        <button
          onClick={commit}
          className="text-xs px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors font-medium flex-shrink-0"
        >
          저장
        </button>
      </div>
    </div>
  );
});

export default function CorrectionList() {
  const { corrections, segments, setActivePanel, addCorrection, removeCorrection, setActiveSegmentIndex, editMode, setEditMode } = useReviewStore();
  const editorRefs = useRef<(EditorHandle | null)[]>([]);

  const handleCorrectionClick = (segmentIndex: number) => {
    const arrayIdx = segments.findIndex((s) => s.index === segmentIndex);
    if (arrayIdx === -1) return;
    setActiveSegmentIndex(arrayIdx);
    const segment = segments[arrayIdx];
    const ws = wavesurferRef.current;
    if (ws) {
      const dur = ws.getDuration();
      if (dur > 0) ws.seekTo(segment.startTime / dur);
    }
    setActivePanel('corrections');
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      onClick={() => setActivePanel('corrections')}
    >
      {/* 헤더: 검수 목록 왼쪽, 토글 오른쪽 */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            검수 목록{' '}
            <span className="text-gray-400 font-normal">({corrections.length}건)</span>
          </h2>
          <button
            onClick={(e) => { e.stopPropagation(); setEditMode(!editMode); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors font-medium ${
              editMode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="수정 모드 켜기/끄기"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            수정 모드
            {editMode && (
              <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {corrections.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-xs text-center px-4">
            수정 내역이 없습니다.
            <br />
            어절을 클릭하여 수정하세요.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {corrections.map((c, i) => {
              const segment = segments.find((s) => s.index === c.segmentIndex);
              return (
                <li
                  key={i}
                  className="group px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleCorrectionClick(c.segmentIndex)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {c.corrected === null ? (
                        <div className="text-sm">
                          <span className="line-through text-red-400">{c.original}</span>
                          <span className="text-xs text-red-500 ml-1">[삭제됨]</span>
                        </div>
                      ) : c.corrected === c.original ? (
                        <div className="text-sm text-gray-500">{c.original}</div>
                      ) : (
                        <div className="text-sm flex items-center gap-1.5 flex-wrap">
                          <span className="text-gray-500">{c.original}</span>
                          <span className="text-gray-400 text-xs">→</span>
                          <span className="text-orange-600 font-medium">{c.corrected}</span>
                        </div>
                      )}
                      {c.reviewNote && (
                        <div className="flex items-center gap-1 mt-1">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                            <line x1="4" y1="22" x2="4" y2="15"/>
                          </svg>
                          <span className="text-xs text-amber-600 leading-tight">{c.reviewNote}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeCorrection(c.segmentIndex, c.wordIndex); }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 mt-0.5"
                      title="삭제"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="1" y1="1" x2="9" y2="9"/>
                        <line x1="9" y1="1" x2="1" y2="9"/>
                      </svg>
                    </button>
                  </div>

                  {editMode && c.corrected !== null && (
                    <CorrectionEditor
                      key={`${c.segmentIndex}-${c.wordIndex}-${c.corrected}`}
                      ref={(el) => { editorRefs.current[i] = el; }}
                      correction={c}
                      segment={segment}
                      onNext={() => {
                        for (let j = i + 1; j < corrections.length; j++) {
                          if (corrections[j].corrected !== null) {
                            editorRefs.current[j]?.focus();
                            return;
                          }
                        }
                      }}
                      onSave={(corrected, reviewNote) => addCorrection({ ...c, corrected, reviewNote })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </div>
  );
}
