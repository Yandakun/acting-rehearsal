"use client";

import React, { useState, useEffect, useRef } from "react";
import { script, characterVoices, ScriptLine } from "@/data/scriptData";

export default function PlayScriptPage() {
  // --- 상태 관리 ---
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [myRole, setMyRole] = useState<string>("");
  const [globalRate, setGlobalRate] = useState<number>(1.0);
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);

  const currentLineRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef<boolean>(false);

  // 캐릭터 목록
  const characters = Array.from(
    new Set(script.map((line) => line.character))
  ).filter((c) => c !== "지시문" && c !== "시스템");

  // 챕터(Header) 목록 추출 (인덱스와 함께 저장)
  const chapters = script
    .map((line, index) => ({ text: line.text, index, type: line.type }))
    .filter((item) => item.type === "header");

  // 현재 재생 위치에 따른 챕터 찾기 (UI 동기화용)
  const getCurrentChapterIndex = () => {
    if (currentIndex === -1) return -1;
    // 현재 인덱스보다 작거나 같은 것 중 가장 큰 인덱스(가장 최근 헤더)를 찾음
    const currentChapter = [...chapters]
      .reverse()
      .find((ch) => ch.index <= currentIndex);
    return currentChapter ? currentChapter.index : -1;
  };

  // --- 1. 목소리 로딩 ---
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setVoiceList(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const getBestVoice = () => {
    const korVoices = voiceList.filter(
      (v) => v.lang.includes("ko") || v.lang.includes("KR")
    );
    const googleVoice = korVoices.find((v) => v.name.includes("Google"));
    const msVoice = korVoices.find(
      (v) => v.name.includes("Microsoft") && v.name.includes("Online")
    );
    return googleVoice || msVoice || korVoices[0] || null;
  };

  // --- TTS 로직 ---
  const speakLine = (index: number) => {
    if (index < 0 || index >= script.length) {
      setIsPlaying(false);
      return;
    }

    const line = script[index];
    window.speechSynthesis.cancel();

    const isMyTurn = line.character === myRole;

    const utterance = new SpeechSynthesisUtterance(line.text);
    const bestVoice = getBestVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    utterance.lang = "ko-KR";
    utterance.volume = isMyTurn ? 0 : 1;

    const voiceSettings = characterVoices[line.character] || {
      pitch: 1.0,
      rate: 1.0,
    };
    utterance.pitch = voiceSettings.pitch;
    utterance.rate = voiceSettings.rate * globalRate;

    utterance.onend = () => {
      speakingRef.current = false;
      if (isPlaying) {
        setCurrentIndex((prev) => prev + 1);
      }
    };

    speakingRef.current = true;
    window.speechSynthesis.speak(utterance);
  };

  // --- Effects ---
  useEffect(() => {
    if (isPlaying && currentIndex >= 0 && currentIndex < script.length) {
      speakLine(currentIndex);
    } else if (!isPlaying) {
      window.speechSynthesis.cancel();
    }
  }, [currentIndex, isPlaying]);

  useEffect(() => {
    if (currentLineRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex]);

  // --- 핸들러 ---
  const handleLineClick = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = Number(e.target.value);
    if (newIndex !== -1) {
      setCurrentIndex(newIndex);
      setIsPlaying(true); // 챕터 선택 시 바로 재생
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      window.speechSynthesis.cancel();
    } else {
      setIsPlaying(true);
      if (currentIndex === -1 || currentIndex >= script.length) {
        setCurrentIndex(0);
      } else {
        speakLine(currentIndex);
      }
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-48">
      {/* 상단 컨트롤 패널 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm px-3 py-3 space-y-3">
        <div className="max-w-2xl mx-auto space-y-3">
          {/* 1열: 타이틀 & 속도 조절 */}
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
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  x{rate}
                </button>
              ))}
            </div>
          </div>

          {/* 2열: 챕터 선택 드롭다운 (NEW!) */}
          <div className="w-full">
            <select
              value={getCurrentChapterIndex()}
              onChange={handleChapterChange}
              className="w-full p-2.5 text-sm font-bold bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="-1">🎬 챕터 선택 (처음부터)</option>
              {chapters.map((ch) => (
                <option key={ch.index} value={ch.index}>
                  {ch.text}
                </option>
              ))}
            </select>
          </div>

          {/* 3열: 내 배역 선택 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
              내 역할(Mute):
            </span>
            <button
              onClick={() => setMyRole("")}
              className={`whitespace-nowrap px-3 py-1 text-xs rounded-full border transition-all ${
                myRole === ""
                  ? "bg-gray-800 text-white border-gray-800"
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
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
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

          // 챕터 구분선
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

          // 일반 대사
          return (
            <div
              key={index}
              ref={isCurrent ? currentLineRef : null}
              onClick={() => handleLineClick(index)}
              className={`p-3 rounded-lg cursor-pointer transition-all duration-200 border-l-4 relative group ${
                isCurrent
                  ? "bg-yellow-50 border-yellow-400 shadow-sm"
                  : "bg-white border-transparent border-l-gray-200"
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
