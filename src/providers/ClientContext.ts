"use client";

import { createContext } from "react";
import { Client } from "@langchain/langgraph-sdk";

export interface ClientContextValue {
  client: Client;
}

export const ClientContext = createContext<ClientContextValue | null>(null);
