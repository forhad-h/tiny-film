"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { FilmGenerationState, Message } from "./types";
import { DEFAULT_SETTINGS } from "./constants";

interface FilmContextType {
  state: FilmGenerationState;
  setState: (state: FilmGenerationState) => void;
  messages: Message[];
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
}

const FilmContext = createContext<FilmContextType | undefined>(undefined);

export function FilmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilmGenerationState>({
    step: "idle",
    ...DEFAULT_SETTINGS,
  });

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! Tell me what kind of film you'd like to generate. Describe your concept and I'll help you create it.",
    },
  ]);

  const [isGenerating, setIsGenerating] = useState(false);

  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  return (
    <FilmContext.Provider
      value={{
        state,
        setState,
        messages,
        addMessage,
        setMessages,
        isGenerating,
        setIsGenerating,
      }}
    >
      {children}
    </FilmContext.Provider>
  );
}

export function useFilm() {
  const context = useContext(FilmContext);
  if (!context) {
    throw new Error("useFilm must be used within a FilmProvider");
  }
  return context;
}
