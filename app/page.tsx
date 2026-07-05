"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Brain, Eraser, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  AGE_BANDS,
  DEFAULT_AGE_ID,
  type LearnerMemory
} from "../lib/client-policy";

const STORAGE_MESSAGES_KEY = "kidsai.chat.messages.v1";
const STORAGE_MEMORY_KEY = "kidsai.learner.memory.v1";
const STARTER_PROMPTS = [
  "Help me understand fractions with hints.",
  "Why is the sky blue? Ask me a question first.",
  "Can you help me plan a science project?",
  "I got stuck on my homework. Coach me step by step."
];

const DEFAULT_MEMORY: LearnerMemory = {
  interests: [],
  recentConcepts: [],
  preferredHintStyle: "socratic"
};

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

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <main className="chat-app">
      <aside className="sidebar" aria-label="Kids AI settings">
        <div className="brand-lockup">
          <Image src="/assets/kids-ai-workshop.svg" alt="" width={44} height={44} priority />
          <div>
            <p>Kids AI</p>
            <span>Safe thinking coach</span>
          </div>
        </div>

        <section className="sidebar-section">
          <h2>Age</h2>
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
          <div className="memory-panel">
            <div>
              <span>Hint style</span>
              <select
                value={learnerMemory.preferredHintStyle}
                onChange={(event) =>
                  setLearnerMemory((current) => ({
                    ...current,
                    preferredHintStyle: event.target.value as LearnerMemory["preferredHintStyle"]
                  }))
                }
              >
                <option value="socratic">Socratic</option>
                <option value="gentle">Gentle</option>
                <option value="step_by_step">Step by step</option>
              </select>
            </div>
            <p>
              {learnerMemory.recentConcepts.length
                ? learnerMemory.recentConcepts.slice(0, 5).join(", ")
                : "Concepts will appear after a few messages."}
            </p>
          </div>
        </section>

        <section className="sidebar-section guardrails">
          <h2>Guardrails</h2>
          <p>
            Kids AI keeps unsafe topics out, avoids collecting private details, and nudges the learner to
            reason before answers.
          </p>
        </section>
      </aside>

      <section className="conversation-shell" aria-label="General chat">
        <header className="chat-header">
          <div>
            <p className="eyebrow">
              <ShieldCheck size={16} aria-hidden="true" />
              General Chat
            </p>
            <h1>Ask anything school-safe.</h1>
          </div>
          <button className="icon-button" type="button" onClick={clearChat} aria-label="Clear chat">
            <Eraser size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="message-list" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <Brain size={34} aria-hidden="true" />
              <h2>Start with a question.</h2>
              <p>Kids AI answers in Markdown, remembers safe learning context, and coaches thinking.</p>
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
            placeholder="Type a message..."
            rows={1}
            disabled={isBusy}
          />
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
      </section>
    </main>
  );
}
