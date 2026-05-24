"use client";

import { useContext } from "react";
import { Client } from "@langchain/langgraph-sdk";
import { ClientContext } from "@/providers/ClientContext";

export function useClient(): Client {
  const context = useContext(ClientContext);

  if (!context) {
    throw new Error("useClient must be used within a ClientProvider");
  }
  return context.client;
}
