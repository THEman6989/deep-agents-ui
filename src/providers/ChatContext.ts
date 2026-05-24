"use client";

import { createContext } from "react";
import { useChat } from "@/app/hooks/useChat";

export type ChatContextType = ReturnType<typeof useChat>;

export const ChatContext = createContext<ChatContextType | undefined>(undefined);
