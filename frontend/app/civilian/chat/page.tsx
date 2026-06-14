"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Mic, MicOff, Volume2, VolumeX, Send, RefreshCw,
  MessageSquare, Plus, Trash2, History, X
} from "lucide-react";
import Navbar from "@/components/shared/Navbar";
import { api } from "@/lib/api";
import { useRequireAuth, getStoredUser, getToken } from "@/lib/useAuth";

interface Message {
  sender: "user" | "bot";
  text: string;
}

interface ChatSession {
  session_id: string;
  title: string;
  message_count: number;
  started_at: string;
  last_at: string;
}

// localStorage key remembering which conversation the user was last in.
const CHAT_SESSION_KEY = "roadwatch_chat_session";

// Bilingual greeting shown for any empty / brand-new conversation.
const WELCOME_MESSAGE: Message = {
  sender: "bot",
  text: "வணக்கம்! நான் உங்கள் சாலையின் குரல் உதவி ரோபோ. தமிழ்நாடு நெடுஞ்சாலைச் சட்டம், புகார் செயல்முறை மற்றும் பரிசுத் திட்டம் பற்றி நீங்கள் கேட்கலாம். (Hello! I am your சாலையின் குரல் AI assistant — ask me in English or Tamil about PWD guidelines, SLA timelines, or rewards.)",
};

// Compact relative-time label for the history list.
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CivilianChat() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [session, setSession] = useState<any>(null);

  // Chat configuration. `language` now only drives voice (mic + read-aloud);
  // the bot's REPLY language is auto-detected server-side from each message.
  const [language, setLanguage] = useState<"en" | "ta" | "hi" | "te">("ta");
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [input, setInput] = useState("");

  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);

  const [loadingResponse, setLoadingResponse] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);

  // Conversation/session management.
  const [sessionId, setSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const sessionIdRef = useRef<string>("");
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Web Speech API recognition instances
  const recognitionRef = useRef<any>(null);
  // True while the user intends to keep recording (drives auto-restart on onend).
  const wantRecordingRef = useRef(false);
  // Accumulated FINAL transcript segments for the current recording session.
  const finalTranscriptRef = useRef("");
  // Set on unmount so async callbacks don't touch React state after teardown.
  const unmountedRef = useRef(false);
  // Cached TTS voices (getVoices() is empty until the async voiceschanged event).
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const langCodeMap = { en: "en-IN", ta: "ta-IN", hi: "hi-IN", te: "te-IN" } as const;

  // ── Conversation helpers ────────────────────────────────────────────────
  const loadHistory = async (sid: string) => {
    try {
      const data = await api.get<{ messages: { role: string; content: string }[] }>(
        `/api/chat/history?session_id=${encodeURIComponent(sid)}`,
        getToken() || undefined
      );
      if (data?.messages?.length) {
        setMessages(data.messages.map((m) => ({ sender: m.role === "user" ? "user" : "bot", text: m.content })));
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
    } catch {
      setMessages([WELCOME_MESSAGE]);
    } finally {
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await api.get<{ sessions: ChatSession[] }>(`/api/chat/sessions`, getToken() || undefined);
      setSessions(data?.sessions || []);
    } catch {
      /* non-fatal: history list just stays as-is */
    }
  };

  const startNewChat = () => {
    const s = getStoredUser();
    const sid = `user-${s?.userId ?? "anon"}-${Date.now()}`;
    sessionIdRef.current = sid;
    setSessionId(sid);
    try { localStorage.setItem(CHAT_SESSION_KEY, sid); } catch { /* noop */ }
    setMessages([WELCOME_MESSAGE]);
    setFollowUps([]);
    setInput("");
    setShowHistory(false);
  };

  const clearChat = async () => {
    if (!window.confirm("Clear this conversation? This permanently deletes its messages.")) return;
    const sid = sessionIdRef.current;
    try {
      await api.del(`/api/chat/session?session_id=${encodeURIComponent(sid)}`, getToken() || undefined);
    } catch { /* still reset the view even if the server call fails */ }
    setMessages([WELCOME_MESSAGE]);
    setFollowUps([]);
    loadSessions();
  };

  const selectSession = (sid: string) => {
    sessionIdRef.current = sid;
    setSessionId(sid);
    try { localStorage.setItem(CHAT_SESSION_KEY, sid); } catch { /* noop */ }
    setShowHistory(false);
    setFollowUps([]);
    loadHistory(sid);
  };

  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.del(`/api/chat/session?session_id=${encodeURIComponent(sid)}`, getToken() || undefined);
    } catch { /* non-fatal */ }
    if (sid === sessionIdRef.current) {
      startNewChat();
    }
    loadSessions();
  };

  useEffect(() => {
    if (!ready) return;
    const s = getStoredUser();
    setSession(s);

    // Resume the last conversation if we have one, else the user's default session.
    let sid = "";
    try { sid = localStorage.getItem(CHAT_SESSION_KEY) || ""; } catch { /* noop */ }
    if (!sid) sid = `user-${s?.userId ?? "anon"}`;
    sessionIdRef.current = sid;
    setSessionId(sid);

    loadHistory(sid);
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Scroll to bottom when messages list updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close the history dropdown when clicking outside it.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Initialize Speech Recognition client side (once). Language is re-applied on
  // each start() so we don't need to re-create the instance per language.
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous = true;        // capture longer / multi-phrase speech
    rec.interimResults = true;    // show live partial text
    rec.maxAlternatives = 3;      // consider top-3 candidates for final results
    rec.lang = langCodeMap[language];

    rec.onstart = () => setIsRecording(true);

    rec.onresult = (e: any) => {
      let interim = "";
      // Walk only the new results from resultIndex onward.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          // Pick the best (top) alternative of the FINAL result.
          let best = result[0];
          for (let a = 1; a < result.length; a++) {
            if ((result[a]?.confidence ?? 0) > (best?.confidence ?? 0)) best = result[a];
          }
          finalTranscriptRef.current += best.transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      // Accumulated finals + live interim shown together in the input.
      setInput((finalTranscriptRef.current + interim).trimStart());
    };

    rec.onerror = (e: any) => {
      const err = e?.error;
      // "no-speech" / "aborted" are benign while continuous; only surface real ones.
      if (err === "not-allowed" || err === "service-not-allowed") {
        wantRecordingRef.current = false;
        if (!unmountedRef.current) {
          setIsRecording(false);
          alert("Microphone permission is blocked. Please allow mic access in your browser settings.");
        }
      } else if (err === "audio-capture") {
        wantRecordingRef.current = false;
        if (!unmountedRef.current) {
          setIsRecording(false);
          alert("No microphone was found. Please connect a mic and try again.");
        }
      }
      // For no-speech/aborted/network we let onend handle restart-or-stop.
    };

    rec.onend = () => {
      // Auto-restart while the user still wants to record (continuous mode ends
      // itself on silence). Guard against teardown + permission failures.
      if (wantRecordingRef.current && !unmountedRef.current) {
        try {
          rec.lang = langCodeMap[language];
          rec.start();
          return;
        } catch {
          // start() can throw if it's already starting — fall through to stop.
        }
      }
      if (!unmountedRef.current) setIsRecording(false);
    };

    recognitionRef.current = rec;

    return () => {
      // Tear down cleanly on language change / unmount.
      wantRecordingRef.current = false;
      try { rec.onend = null; rec.stop(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Mark unmount so async speech callbacks stop touching state.
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  // Load + cache speech-synthesis voices. getVoices() is empty on first call in
  // most browsers and only populates after the async voiceschanged event fires.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; } catch { /* noop */ } };
  }, []);

  const stopRecording = () => {
    wantRecordingRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Voice speech recognition is not supported on this browser version.");
      return;
    }

    if (isRecording || wantRecordingRef.current) {
      stopRecording();
    } else {
      // Continue from whatever is already in the box so multiple dictation
      // sessions (and any typed text) accumulate instead of being wiped.
      finalTranscriptRef.current = input ? input.trimEnd() + " " : "";
      wantRecordingRef.current = true;
      try {
        recognitionRef.current.lang = langCodeMap[language];
        recognitionRef.current.start();
      } catch {
        // Calling start() twice throws; reset state so the mic isn't stuck.
        wantRecordingRef.current = false;
        setIsRecording(false);
      }
    }
  };

  // Speaks response aloud using Web Speech Synthesis. Picks the voice that
  // matches the spoken text so a Tamil reply isn't read by an English voice.
  const speakText = (text: string) => {
    if (!voiceOutputEnabled || typeof window === "undefined" || !window.speechSynthesis) return;

    // stop any current speech
    window.speechSynthesis.cancel();

    // Match the read-aloud voice to the reply itself (auto-detected), falling
    // back to the selected voice language.
    const replyLang = /[஀-௿]/.test(text)
      ? "ta-IN"
      : /[ऀ-ॿ]/.test(text)
        ? "hi-IN"
        : /[ఀ-౿]/.test(text)
          ? "te-IN"
          : /[a-zA-Z]/.test(text)
            ? "en-IN"
            : langCodeMap[language];
    const prefix = replyLang.split("-")[0]; // e.g. "ta"
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = replyLang;
    utterance.rate = 0.95;

    const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
    const match =
      voices.find(v => v.lang === replyLang) ||
      voices.find(v => v.lang?.toLowerCase().startsWith(prefix));
    if (match) utterance.voice = match;

    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    // Stop the mic cleanly if a voice session is active before sending.
    if (isRecording || wantRecordingRef.current) stopRecording();
    finalTranscriptRef.current = "";

    // Append user message
    const newMsg: Message = { sender: "user", text: textToSend };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    setLoadingResponse(true);

    try {
      // No `language` sent on purpose — the backend auto-detects each message's
      // language (English/Tamil) so the bot always replies in kind.
      const data = await api.post(
        "/chatbot",
        { message: textToSend, session_id: sessionIdRef.current },
        getToken() || undefined
      );
      const replyText = data.success && data.reply ? data.reply : "Sorry, I could not process that.";
      setMessages(prev => [...prev, { sender: "bot", text: replyText }]);
      if (Array.isArray(data.follow_up_options)) setFollowUps(data.follow_up_options);
      speakText(replyText);
      loadSessions(); // surface a freshly-started chat in the history list
    } catch (err) {
      const errorMsg = "I'm having trouble connecting to the server. Please try again.";
      setMessages(prev => [...prev, { sender: "bot", text: errorMsg }]);
      speakText(errorMsg);
    } finally {
      setLoadingResponse(false);
    }
  };

  const handleChipClick = (chipText: string) => {
    handleSendMessage(chipText);
  };

  // Quick reply chips based on language
  const chips = language === "ta"
    ? ["புகார் செய்வது எப்படி?", "எனது புள்ளிகள் என்ன?", "குழிகள் சரிசெய்ய எவ்வளவு நாள் ஆகும்?"]
    : ["How to report road damage?", "How does rewards work?", "What is the pothole repair SLA timeline?"];

  // Prefer the bot's contextual follow-up suggestions when present.
  const activeChips = followUps.length ? followUps : chips;

  const iconBtn =
    "p-1.5 rounded-lg border bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition";

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col items-center justify-center gap-4">
        <div className="w-48 h-6 rounded bg-slate-200 animate-pulse" />
        <div className="w-72 h-64 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark text-slate-800 dark:text-slate-100 flex flex-col transition-colors pb-12">
      <Navbar portal="civilian" userName={session?.name} />

      <main className="flex-1 max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl w-full mx-auto px-4 md:px-6 lg:px-8 mt-6 flex flex-col justify-between h-[calc(100dvh-140px)] min-h-0">

        {/* Chat Header card */}
        <div className="p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-md flex justify-between items-center gap-3 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary animate-pulse shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-black text-sm md:text-base dark:text-white text-secondary leading-tight truncate">
                சாலையின் குரல் Voice Bot
              </h2>
              <span className="text-[9.5px] font-mono text-slate-500 block uppercase truncate">English &amp; தமிழ் · PWD Assistant</span>
            </div>
          </div>

          {/* Conversation controls + voice + voice-language selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* New chat */}
            <button onClick={startNewChat} className={iconBtn} title="New chat">
              <Plus className="w-4 h-4" />
            </button>

            {/* Previous chats */}
            <div className="relative" ref={historyRef}>
              <button
                onClick={() => { const next = !showHistory; setShowHistory(next); if (next) loadSessions(); }}
                className={`${iconBtn} ${showHistory ? "!bg-primary/10 !text-primary !border-primary/20" : ""}`}
                title="Previous chats"
              >
                <History className="w-4 h-4" />
              </button>

              {showHistory && (
                <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-2">
                  <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Previous chats</span>
                    <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {sessions.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-6">No previous chats yet</p>
                  ) : (
                    sessions.map((s) => {
                      const isCurrent = s.session_id === sessionId;
                      return (
                        <div
                          key={s.session_id}
                          onClick={() => selectSession(s.session_id)}
                          className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition ${
                            isCurrent ? "bg-primary/10" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? "text-primary" : "text-slate-400"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate text-slate-700 dark:text-slate-200">{s.title}</p>
                            <p className="text-[10px] text-slate-400">{s.message_count} msgs · {timeAgo(s.last_at)}</p>
                          </div>
                          <button
                            onClick={(e) => deleteSession(s.session_id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-danger hover:bg-danger/10 transition"
                            title="Delete chat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Clear current chat */}
            <button onClick={clearChat} className={`${iconBtn} hover:!text-danger hover:!border-danger/30`} title="Clear this chat">
              <Trash2 className="w-4 h-4" />
            </button>

            <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {/* Read-aloud toggle */}
            <button
              onClick={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
              className={`p-1.5 rounded-lg border ${
                voiceOutputEnabled
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
              } transition`}
              title="Toggle Read-Aloud"
            >
              {voiceOutputEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Voice (mic + read-aloud) language */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="py-1 px-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none"
              title="Voice language (mic & read-aloud)"
            >
              <option value="ta">தமிழ்</option>
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="te">తెలుగు</option>
            </select>
          </div>
        </div>

        {/* Message Bubble Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-lg my-4 space-y-4">
          {messages.map((msg, index) => {
            const isBot = msg.sender === "bot";
            return (
              <div
                key={index}
                className={`flex w-full ${isBot ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`p-3 rounded-2xl text-xs md:text-sm max-w-[85%] sm:max-w-[80%] leading-relaxed shadow-sm break-words ${
                    isBot
                      ? "bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-tl-none text-slate-700 dark:text-slate-200"
                      : "bg-primary text-white rounded-tr-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })}
          {loadingResponse && (
            <div className="flex justify-start">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-tl-none flex items-center space-x-2 text-xs text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick reply chips */}
        <div className="flex overflow-x-auto space-x-2 pb-2 shrink-0 max-w-full">
          {activeChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleChipClick(chip)}
              className="py-1.5 px-3 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap transition"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="p-2.5 rounded-2xl glass border border-slate-200 dark:border-slate-800 flex items-center space-x-2 shrink-0">
          <button
            onClick={toggleRecording}
            className={`p-2.5 rounded-xl border transition shrink-0 ${
              isRecording
                ? "bg-danger text-white border-danger animate-pulse"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-400"
            }`}
            title="Voice Record (Web Speech)"
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <input
            type="text"
            placeholder={
              isRecording
                ? (language === "ta" ? "🎙️ கேட்கிறேன்..." : "🎙️ Listening...")
                : language === "ta" ? "இங்கு தட்டச்சு செய்யவும்..." : "Ask in English or Tamil…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendMessage(input);
            }}
            className="flex-grow min-w-0 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs md:text-sm focus:border-primary transition"
          />
          <button
            onClick={() => handleSendMessage(input)}
            className="p-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white transition shadow-md shadow-primary/10 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

      </main>
    </div>
  );
}
