'use client';

import { useEffect } from 'react';
import { useReviewStore, wavesurferRef } from '@/stores/review-store';
import { Correction } from '@/types';
import { estimateWordStartTime, estimateWordEndTime } from '@/lib/time-utils';

// 모듈 레벨 루프 타이머 (Word 인스턴스 전체 공유)
let _loopTimer: ReturnType<typeof setTimeout> | null = null;

function _clearLoop() {
  if (_loopTimer !== null) {
    clearTimeout(_loopTimer);
    _loopTimer = null;
  }
}

interface WordProps {
  segmentIndex: number;
  wordIndex: number;
  text: string;
  correction: Correction | undefined;
  isActiveWord?: boolean;
}

export default function Word({
  segmentIndex,
  wordIndex,
  text,
  correction,
  isActiveWord = false,
}: WordProps) {
  const { setActivePanel, addCorrection, editMode, editLoopWord, setEditLoopWord } = useReviewStore();

  const isLooping =
    editLoopWord?.segmentIndex === segmentIndex &&
    editLoopWord?.wordIndex === wordIndex;

  // 루프 시작/정지
  useEffect(() => {
    if (!isLooping) {
      _clearLoop();
      return;
    }

    const ws = wavesurferRef.current;
    if (!ws) return;

    const { segments } = useReviewStore.getState();
    const seg = segments.find((s) => s.index === segmentIndex);
    if (!seg) return;

    const dur = ws.getDuration();
    if (!dur) return;

    const wordTime = seg.wordTimings
      ? seg.wordTimings[wordIndex].startTime
      : estimateWordStartTime(seg.startTime, seg.endTime, wordIndex, seg.words.length);
    const wordEnd = seg.wordTimings
      ? seg.wordTimings[wordIndex].endTime
      : estimateWordEndTime(seg.startTime, seg.endTime, wordIndex, seg.words.length);
    const wordDuration = wordEnd - wordTime;

    ws.pause();
    _clearLoop();

    const playOnce = () => {
      const currentWs = wavesurferRef.current;
      if (!currentWs || !useReviewStore.getState().editLoopWord) return;
      const { playbackRate } = useReviewStore.getState();
      currentWs.seekTo(wordTime / currentWs.getDuration());
      currentWs.play();
      _loopTimer = setTimeout(() => {
        currentWs.pause();
        _loopTimer = setTimeout(playOnce, 150);
      }, (wordDuration * 1000) / playbackRate);
    };

    playOnce();

    return () => _clearLoop();
  }, [isLooping, segmentIndex, wordIndex]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePanel('script');

    const ws = wavesurferRef.current;
    if (ws) {
      const { segments, editMode: em } = useReviewStore.getState();
      const seg = segments.find((s) => s.index === segmentIndex);
      if (seg) {
        const dur = ws.getDuration();
        if (dur > 0) {
          const wordTime = seg.wordTimings
            ? seg.wordTimings[wordIndex].startTime
            : estimateWordStartTime(seg.startTime, seg.endTime, wordIndex, seg.words.length);
          ws.seekTo(wordTime / dur);
          if (em) {
            // 다른 단어 루프 중이면 중지
            setEditLoopWord(null);
            const { playbackRate } = useReviewStore.getState();
            const wordEnd = seg.wordTimings
              ? seg.wordTimings[wordIndex].endTime
              : estimateWordEndTime(seg.startTime, seg.endTime, wordIndex, seg.words.length);
            const wordDuration = wordEnd - wordTime;
            ws.play();
            setTimeout(() => ws.pause(), (wordDuration * 1000) / playbackRate);
          }
        }
      }
    }

    if (!correction) {
      addCorrection({ segmentIndex, wordIndex, original: text, corrected: text });
    }
  };

  const handleLoopClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLooping) {
      setEditLoopWord(null);
      wavesurferRef.current?.pause();
    } else {
      setEditLoopWord({ segmentIndex, wordIndex });
    }
  };

  const isDeleted = correction?.corrected === null;
  const isCorrected = correction !== undefined && correction.corrected !== null && correction.corrected !== text;
  const isFlagged = correction !== undefined && correction.corrected === text;
  const hasReviewNote = Boolean(correction?.reviewNote);
  const displayText = isDeleted ? text : isCorrected ? correction.corrected! : text;

  let boxStyle: string;
  if (hasReviewNote) {
    boxStyle = 'bg-red-200 text-red-800';
  } else if (isCorrected) {
    boxStyle = 'bg-green-200 text-green-800';
  } else if (isDeleted) {
    boxStyle = 'bg-red-200 text-red-800 line-through';
  } else if (isFlagged) {
    boxStyle = 'bg-red-200 text-red-800';
  } else if (isActiveWord) {
    boxStyle = 'bg-yellow-200 text-gray-900';
  } else {
    boxStyle = 'text-gray-800 hover:bg-gray-100';
  }

  return (
    <span className="inline-flex items-center">
      <span
        onClick={handleClick}
        className={`relative inline-block px-1 py-0.5 mx-0.5 rounded cursor-pointer transition-colors leading-relaxed ${boxStyle}`}
        title={isCorrected ? `원본: ${text}` : undefined}
      >
        {displayText}
        {hasReviewNote && (
          <svg
            className="absolute -top-1.5 -right-1 text-amber-500"
            width="8" height="8" viewBox="0 0 24 24"
            fill="currentColor" stroke="none"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          </svg>
        )}
      </span>

      {/* 수정 모드 반복 재생 버튼 */}
      {editMode && (
        <button
          onClick={handleLoopClick}
          className={`ml-0.5 mr-1 w-4 h-4 flex items-center justify-center rounded-full text-xs transition-colors flex-shrink-0
            ${isLooping
              ? 'bg-blue-500 text-white'
              : 'text-gray-300 hover:text-blue-400'
            }`}
          title={isLooping ? '반복 중지' : '반복 재생'}
        >
          ↻
        </button>
      )}
    </span>
  );
}
