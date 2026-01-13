"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { script, characterVoices, ScriptLine } from "@/data/scriptData";

export default function PlayScriptPage() {
  // --- 상태 관리 ---
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [myRole, setMyRole] = useState<string>("");
  const [globalRate, setGlobalRate] = useState<number>(1.0);
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);

  const currentLineRef = useRef<HTMLDivElement>(null);

  const activeIndexRef = useRef<number>(-1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // ★ 추가: iOS 멈춤 방지용 타이머
  const safetyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const characters = Array.from(
    new Set(script.map((line) => line.character))
  ).filter((c) => c !== "지시문" && c !== "시스템");

  const allChapters = useMemo(
    () =>
      script
        .map((line, index) => ({ text: line.text, index, type: line.type }))
        .filter((item) => item.type === "header"),
    []
  );

  const filteredChapters = useMemo(() => {
    if (!myRole) return allChapters;
    return allChapters.filter((chapter, i) => {
      const startIndex = chapter.index;
      const endIndex = allChapters[i + 1]
        ? allChapters[i + 1].index
        : script.length;
      const linesInChapter = script.slice(startIndex, endIndex);
      return linesInChapter.some((line) => line.character === myRole);
    });
  }, [myRole, allChapters]);

  const getCurrentChapterIndex = () => {
    if (currentIndex === -1) return -1;
    const currentChapter = [...filteredChapters]
      .reverse()
      .find((ch) => ch.index <= currentIndex);
    return currentChapter ? currentChapter.index : -1;
  };

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setVoiceList(voices);
    };
    loadVoices();
    if (
      typeof window !== "undefined" &&
      window.speechSynthesis.onvoiceschanged !== undefined
    ) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      window.speechSynthesis.cancel();
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, []);

  const getBestVoice = () => {
    const korVoices = voiceList.filter(
      (v) => v.lang.includes("ko") || v.lang.includes("KR")
    );
    return (
      korVoices.find((v) => v.name.includes("Google")) ||
      korVoices.find((v) => v.name.includes("Microsoft")) ||
      korVoices[0] ||
      null
    );
  };

  // --- TTS 핵심 로직 ---
  const speakLine = (index: number) => {
    // 이전 타이머 및 음성 정리
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    window.speechSynthesis.cancel();

    if (index < 0 || index >= script.length) {
      setIsPlaying(false);
      return;
    }

    const line = script[index];
    activeIndexRef.current = index;

    // ★ iOS 해결 1: 특수문자 제거하고 읽히기
    // <햄릿> -> 햄릿 (특수문자가 있으면 iOS가 침묵으로 처리할 때가 있음)
    const cleanText = line.text.replace(/[<>{}[\]]/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    const isMyTurn = line.character === myRole;
    const bestVoice = getBestVoice();
    if (bestVoice) utterance.voice = bestVoice;
    utterance.lang = "ko-KR";

    const voiceSettings = characterVoices[line.character] || {
      pitch: 1.0,
      rate: 1.0,
    };
    utterance.pitch = voiceSettings.pitch;

    // 속도 계산
    let finalRate = voiceSettings.rate * globalRate;
    if (isMyTurn) {
      utterance.volume = 0;
      finalRate = finalRate * 0.5;
    } else {
      utterance.volume = 1;
    }
    utterance.rate = finalRate;

    // ★ iOS 해결 2: 강제 넘기기 안전장치 (Safety Timer)
    // 대사 길이(글자수)를 바탕으로 예상 시간을 계산하고, 그 시간 + 1.5초가 지나도 안 끝나면 강제 이동
    // 글자당 약 200ms 계산 (넉넉하게)
    const estimatedDuration = (cleanText.length * 200) / finalRate + 1500;

    safetyTimerRef.current = setTimeout(() => {
      if (isPlaying && index === activeIndexRef.current) {
        console.log("iOS 멈춤 감지: 강제로 다음 대사로 이동합니다.");
        setCurrentIndex((prev) => prev + 1);
      }
    }, estimatedDuration);

    utterance.onend = () => {
      // 정상적으로 끝났으면 타이머 해제
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

      if (isPlaying && index === activeIndexRef.current) {
        setCurrentIndex(index + 1);
      }
    };

    utterance.onerror = (e) => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

      if (e.error !== "interrupted") {
        console.error("TTS Error:", e);
        if (isPlaying && index === activeIndexRef.current) {
          setCurrentIndex(index + 1);
        }
      }
    };

    window.speechSynthesis.speak(utterance);

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  };

  // --- 재생/정지 감시 ---
  useEffect(() => {
    if (isPlaying && currentIndex >= 0) {
      speakLine(currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isPlaying]);

  useEffect(() => {
    if (currentLineRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex]);

  const handleLineClick = (index: number) => {
    activeIndexRef.current = index;
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = Number(e.target.value);
    if (newIndex !== -1) handleLineClick(newIndex);
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      window.speechSynthesis.cancel();
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    } else {
      const nextIdx = currentIndex === -1 ? 0 : currentIndex;
      setCurrentIndex(nextIdx);
      setIsPlaying(true);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-48">
      {/* 상단 컨트롤 패널 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm px-3 py-3 space-y-3">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex justify-between items-center">
            <h1 className="text-lg font-bold text-gray-800">🎭 리허설 모드</h1>
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
              {[1.0, 1.2, 1.4].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setGlobalRate(rate)}
                  className={`text-xs font-bold px-2 py-1 rounded transition-all ${
                    globalRate === rate
                      ? "bg-white text-blue-600 shadow-sm border border-gray-200"
                      : "text-gray-400"
                  }`}
                >
                  x{rate}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full">
            <select
              value={getCurrentChapterIndex()}
              onChange={handleChapterChange}
              className="w-full p-2.5 text-sm font-bold bg-gray-50 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="-1">
                🎬 챕터 선택 {myRole ? `(${myRole} 씬만)` : "(전체)"}
              </option>
              {filteredChapters.map((ch) => (
                <option key={ch.index} value={ch.index}>
                  {ch.text}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
              내 역할(Mute):
            </span>
            <button
              onClick={() => setMyRole("")}
              className={`whitespace-nowrap px-3 py-1 text-xs rounded-full border transition-all ${
                myRole === ""
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              전체 듣기
            </button>
            {characters.map((char) => (
              <button
                key={char}
                onClick={() => setMyRole(char)}
                className={`whitespace-nowrap px-3 py-1 text-xs rounded-full border transition-all ${
                  myRole === char
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 대본 리스트 */}
      <div className="max-w-2xl mx-auto p-3 space-y-2">
        {script.map((line, index) => {
          const isCurrent = index === currentIndex;
          const isMyPart = line.character === myRole;

          if (line.type === "header") {
            return (
              <div
                key={index}
                ref={isCurrent ? currentLineRef : null}
                onClick={() => handleLineClick(index)}
                className={`mt-8 mb-4 text-center cursor-pointer transition-all ${
                  isCurrent ? "scale-105" : "opacity-80"
                }`}
              >
                <div
                  className={`inline-block px-4 py-2 text-sm font-bold rounded-full shadow-md transition-colors ${
                    isCurrent
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-white"
                  }`}
                >
                  {line.text}
                </div>
              </div>
            );
          }

          return (
            <div
              key={index}
              ref={isCurrent ? currentLineRef : null}
              onClick={() => handleLineClick(index)}
              className={`p-3 rounded-lg cursor-pointer transition-all border-l-4 relative ${
                isCurrent
                  ? "bg-yellow-50 border-yellow-400 shadow-sm"
                  : "bg-white border-l-gray-200 border-transparent hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                    line.character === "지시문"
                      ? "bg-gray-400"
                      : line.character === "유정"
                      ? "bg-pink-500"
                      : line.character === "명근"
                      ? "bg-indigo-600"
                      : line.character === "찬수"
                      ? "bg-blue-500"
                      : line.character === "윤진"
                      ? "bg-orange-400"
                      : "bg-teal-500"
                  }`}
                >
                  {line.character}
                </span>
                {isMyPart && (
                  <span className="text-[10px] text-red-500 font-bold border border-red-200 bg-red-50 px-1 rounded">
                    MY ROLE
                  </span>
                )}
              </div>

              <p
                className={`text-base leading-relaxed ${
                  line.type === "action"
                    ? "italic text-gray-500 text-sm"
                    : "text-gray-900"
                } ${isCurrent ? "font-bold" : ""} ${
                  isMyPart && isCurrent ? "text-blue-600" : ""
                }`}
              >
                {line.text}
              </p>
            </div>
          );
        })}
      </div>

      {/* 하단 플레이어 컨트롤 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={`flex-1 py-3 rounded-xl text-lg font-bold text-white shadow transition-transform active:scale-95 flex items-center justify-center gap-2 ${
              isPlaying ? "bg-red-500" : "bg-blue-600"
            }`}
          >
            {isPlaying
              ? "⏸ 일시 정지"
              : currentIndex === -1
              ? "▶ 리허설 시작"
              : "▶ 계속 재생"}
          </button>
        </div>
      </div>
    </main>
  );
}
