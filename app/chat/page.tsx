"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Eraser, Mic, Plus, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Streamdown } from "streamdown";
import {
  AGE_BANDS,
  DEFAULT_AGE_ID,
  type LearnerMemory
} from "../../lib/client-policy";

const STORAGE_MESSAGES_KEY = "kidsai.chat.messages.v1";
const STORAGE_MEMORY_KEY = "kidsai.learner.memory.v1";
const STARTER_PROMPTS = [
  "Help me understand fractions.",
  "Why is the sky blue?",
  "Help me plan a science project.",
  "Coach me through my homework."
];

const DEFAULT_MEMORY: LearnerMemory = {
  interests: [],
  recentConcepts: [],
  preferredHintStyle: "socratic"
};

type VoiceStatus = "idle" | "recording" | "transcribing";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function textFromMessage(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

function conceptsFrom(text: string) {
  const matches = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5 && word.length <= 18)
    .filter((word) => !["because", "about", "think", "question", "answer"].includes(word));

  return Array.from(new Set(matches)).slice(0, 3);
}

export default function Page() {
  const [input, setInput] = useState("");
  const [ageId, setAgeId] = useState(DEFAULT_AGE_ID);
  const [learnerMemory, setLearnerMemory] = useState<LearnerMemory>(DEFAULT_MEMORY);
  const [isHydrated, setIsHydrated] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const shouldTranscribeRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest({ messages, id }) {
          return {
            body: {
              id,
              messages: messages.slice(-16),
              ageId,
              learnerMemory
            }
          };
        }
      }),
    [ageId, learnerMemory]
  );

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
    transport,
    onFinish: ({ messages: finishedMessages }) => {
      window.localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(finishedMessages.slice(-24)));
    }
  });

  useEffect(() => {
    setMessages(loadJson<UIMessage[]>(STORAGE_MESSAGES_KEY, []));
    setLearnerMemory(loadJson<LearnerMemory>(STORAGE_MEMORY_KEY, DEFAULT_MEMORY));
    setAgeId(loadJson<string>("kidsai.age.v1", DEFAULT_AGE_ID));
    setIsHydrated(true);
  }, [setMessages]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem("kidsai.age.v1", JSON.stringify(ageId));
    window.localStorage.setItem(STORAGE_MEMORY_KEY, JSON.stringify(learnerMemory));
  }, [ageId, learnerMemory, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages.slice(-24)));
  }, [messages, isHydrated]);

  const rememberFromUserMessage = useCallback((message: string) => {
    const newConcepts = conceptsFrom(message);

    if (newConcepts.length === 0) {
      return;
    }

    setLearnerMemory((current) => ({
      ...current,
      recentConcepts: Array.from(new Set([...newConcepts, ...current.recentConcepts])).slice(0, 8)
    }));
  }, []);

  const submitMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();

      if (!trimmed || status === "submitted" || status === "streaming") {
        return;
      }

      rememberFromUserMessage(trimmed);
      sendMessage({ text: trimmed });
      setInput("");
    },
    [rememberFromUserMessage, sendMessage, status]
  );

  function clearChat() {
    setMessages([]);
    window.localStorage.removeItem(STORAGE_MESSAGES_KEY);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function transcribeAudio(audioBlob: Blob) {
    setVoiceStatus("transcribing");
    setVoiceError(null);

    const formData = new FormData();
    const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("audio", audioBlob, `kids-ai.${extension}`);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as {
        transcript?: string;
        error?: string;
      };

      if (!response.ok || !payload.transcript) {
        throw new Error(payload.error || "Voice input could not be transcribed.");
      }

      const transcript = payload.transcript;
      setInput((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
    } catch (caughtError) {
      setVoiceError(
        caughtError instanceof Error ? caughtError.message : "Voice input could not be transcribed."
      );
    } finally {
      setVoiceStatus("idle");
    }
  }

  async function startVoiceInput() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice input is not supported in this browser.");
      return;
    }

    setVoiceError(null);
    audioChunksRef.current = [];
    shouldTranscribeRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });
        recorderRef.current = null;
        stopStream();

        if (!shouldTranscribeRef.current) {
          setVoiceStatus("idle");
          return;
        }

        if (audioBlob.size === 0) {
          setVoiceStatus("idle");
          setVoiceError("No speech was recorded.");
          return;
        }

        void transcribeAudio(audioBlob);
      });

      recorder.start();
      setVoiceStatus("recording");
    } catch {
      stopStream();
      setVoiceStatus("idle");
      setVoiceError("Microphone permission was not granted.");
    }
  }

  function stopVoiceInput() {
    shouldTranscribeRef.current = true;
    recorderRef.current?.stop();
  }

  useEffect(() => {
    return () => {
      shouldTranscribeRef.current = false;
      recorderRef.current?.stop();
      stopStream();
    };
  }, []);

  const isBusy = status === "submitted" || status === "streaming";
  const isVoiceBusy = voiceStatus === "recording" || voiceStatus === "transcribing";
  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submitMessage(input);
      }
    },
    [input, submitMessage]
  );

  return (
    <main className="chat-app">
      <aside className="chat-sidebar" aria-label="Kids AI settings">
        <div className="sidebar-top">
          <a className="brand-link" href="/">
            Kids AI
          </a>
          <button className="new-chat-button" type="button" onClick={clearChat}>
            <Plus size={17} aria-hidden="true" />
            New chat
          </button>
        </div>

        <section className="sidebar-section">
          <h2>Age band</h2>
          <div className="segmented-control" role="tablist" aria-label="Age band">
            {AGE_BANDS.map((age) => (
              <button
                key={age.id}
                type="button"
                role="tab"
                aria-selected={age.id === ageId}
                onClick={() => setAgeId(age.id)}
              >
                {age.label}
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section">
          <h2>Memory</h2>
          <select
            value={learnerMemory.preferredHintStyle}
            onChange={(event) =>
              setLearnerMemory((current) => ({
                ...current,
                preferredHintStyle: event.target.value as LearnerMemory["preferredHintStyle"]
              }))
            }
          >
            <option value="socratic">Socratic hints</option>
            <option value="gentle">Gentle hints</option>
            <option value="step_by_step">Step by step</option>
          </select>
          <p>
            {learnerMemory.recentConcepts.length
              ? learnerMemory.recentConcepts.slice(0, 4).join(", ")
              : "Recent concepts appear here."}
          </p>
        </section>
      </aside>

      <section className="chat-main" aria-label="General Chat">
        <header className="chat-topbar">
          <span>General Chat</span>
          <button className="icon-button" type="button" onClick={clearChat} aria-label="Clear chat">
            <Eraser size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="message-list" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h1>What should we think through?</h1>
              <div className="starter-grid">
                {STARTER_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => submitMessage(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <div className="message-label">{message.role === "user" ? "You" : "Kids AI"}</div>
                <div className="message-content">
                  {message.role === "assistant" ? (
                    message.parts.map((part, index) =>
                      part.type === "text" ? (
                        <Streamdown key={index} animated isAnimating={status === "streaming"}>
                          {part.text}
                        </Streamdown>
                      ) : null
                    )
                  ) : (
                    <p>{textFromMessage(message)}</p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {error ? <p className="chat-error">{error.message}</p> : null}
        {voiceError ? <p className="chat-error">{voiceError}</p> : null}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            submitMessage(input);
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message Kids AI..."
            rows={1}
            disabled={isBusy}
          />
          <button
            className="voice-button"
            type="button"
            aria-label={voiceStatus === "recording" ? "Stop voice input" : "Start voice input"}
            onClick={voiceStatus === "recording" ? stopVoiceInput : startVoiceInput}
            disabled={isBusy || voiceStatus === "transcribing"}
          >
            {voiceStatus === "recording" ? (
              <Square size={16} aria-hidden="true" />
            ) : (
              <Mic size={18} aria-hidden="true" />
            )}
          </button>
          {isBusy ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button className="send-button" type="submit" aria-label="Send message" disabled={!input.trim()}>
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          )}
        </form>
        {isVoiceBusy ? (
          <p className="voice-status">
            {voiceStatus === "recording" ? "Listening..." : "Transcribing..."}
          </p>
        ) : null}
      </section>
    </main>
  );
}
