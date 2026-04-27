'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SrtSegment } from '@/types';
import { useReviewStore, wavesurferRef } from '@/stores/review-store';
import { estimateWordStartTime, estimateWordEndTime } from '@/lib/time-utils';

interface CorrectionModalProps {
  segmentIndex: number;
  wordIndex: number;
  originalWord: string;
  currentCorrection?: string;
  segment: SrtSegment;
}

export default function CorrectionModal({
  segmentIndex,
  wordIndex,
  originalWord,
  currentCorrection,
  segment,
}: CorrectionModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { addCorrection, setSelectedWord, setIsLooping, playbackRate } = useReviewStore();

  const [value, setValue] = useState(currentCorrection ?? originalWord);
  const [loopActive, setLoopActive] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // 재검토 모드 토글 시 textarea 자동 포커스
  useEffect(() => {
    if (showReview) {
      reviewRef.current?.focus();
    }
  }, [showReview]);

  const close = useCallback(() => {
    stopLoop();
    setSelectedWord(null);
  }, [setSelectedWord]);

  const getPlayRange = useCallback(() => {
    const totalWords = segment.words.length;
    const prevIndex = Math.max(0, wordIndex - 2);

    // startTime: n-2 어절부터 (Whisper JSON: 정확한 타임스탬프 / SRT: 균등 추정)
    const startTime = segment.wordTimings
      ? segment.wordTimings[prevIndex].startTime
      : estimateWordStartTime(segment.startTime, segment.endTime, prevIndex, totalWords);

    // endTime: 오류 어절 끝까지
    const endTime = segment.wordTimings
      ? segment.wordTimings[wordIndex].endTime
      : estimateWordEndTime(segment.startTime, segment.endTime, wordIndex, totalWords);

    return { startTime, endTime, duration: endTime - startTime };
  }, [segment, wordIndex]);

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
  }, [getPlayRange, playbackRate]);

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

  const stopLoop = useCallback(() => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    wavesurferRef.current?.pause();
    setLoopActive(false);
    setIsLooping(false);
  }, [setIsLooping]);

  const toggleLoop = useCallback(() => {
    loopActive ? stopLoop() : startLoop();
  }, [loopActive, startLoop, stopLoop]);

  const save = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed === originalWord && currentCorrection === undefined) {
      close();
      return;
    }
    addCorrection({
      segmentIndex,
      wordIndex,
      original: originalWord,
      corrected: trimmed || null,
    });
    close();
  }, [value, originalWord, currentCorrection, addCorrection, segmentIndex, wordIndex, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [close]);

  useEffect(() => {
    return () => { if (loopTimerRef.current) clearTimeout(loopTimerRef.current); };
  }, []);

  return (
    <div
      ref={modalRef}
      className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-64"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 수정 입력 */}
      <div className="mb-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="수정할 내용 입력..."
        />
      </div>

      {/* 재검토 사유 (토글) */}
      {showReview && (
        <textarea
          ref={reviewRef}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
          placeholder="재검토 사유 입력..."
          rows={2}
          className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-2"
        />
      )}

      {/* 재생 컨트롤 + 저장 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={playOnce}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            title="해당 구간 재생"
          >
            <span className="text-[10px]">▶</span> 재생
          </button>
          <button
            onClick={toggleLoop}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors ${
              loopActive
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
            title="반복 재생"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            반복
          </button>
        </div>
        <button
          onClick={() => setShowReview((v) => !v)}
          className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full transition-colors flex-shrink-0 ${
            showReview
              ? 'bg-amber-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
          title="재검토 사유 입력"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill={showReview ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          재검토
        </button>
        <button
          onClick={save}
          className="text-xs px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors font-medium"
        >
          저장
        </button>
      </div>
    </div>
  );
}
