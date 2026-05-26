"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  url: string;
  filename?: string;
  className?: string;
  muted?: boolean;
  controls?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
}

/**
 * HTML5 video player for video files from Media Gallery.
 * Detects and renders mp4/webm/ogg/mov videos.
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  filename,
  className,
  muted = false,
  controls = true,
  loop = false,
  autoPlay = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideoUrl = (() => {
    const lower = url.toLowerCase();
    return (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg") ||
      lower.endsWith(".mov") ||
      lower.endsWith(".m4v") ||
      lower.endsWith(".mkv") ||
      lower.endsWith(".avi")
    );
  })();

  if (!isVideoUrl) return null;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-black/5",
        className,
      )}
    >
      {filename && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
          <svg
            className="h-3.5 w-3.5 shrink-0 text-[#7dd3c7]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className="truncate font-medium text-foreground">
            {filename}
          </span>
        </div>
      )}
      <video
        ref={videoRef}
        src={url}
        controls={controls}
        muted={muted}
        loop={loop}
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        className="w-full max-h-[480px] object-contain bg-black"
        style={{ aspectRatio: "16 / 9" }}
      />
    </div>
  );
};

/**
 * Detect video URLs in text content and extract them.
 * Returns array of {url, filename} pairs.
 */
export function extractVideoUrls(text: string): { url: string; filename: string }[] {
  const results: { url: string; filename: string }[] = [];

  // Match HTTP URLs ending with video extensions
  const videoUrlRegex = /https?:\/\/[^\s"'<>]+\.(mp4|webm|ogg|mov|m4v|mkv|avi)(\?[^\s"'<>]*)?/gi;
  let match;
  while ((match = videoUrlRegex.exec(text)) !== null) {
    const url = match[0];
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    const filename = decodeURIComponent(pathParts[pathParts.length - 1] || "video");
    results.push({ url, filename });
  }

  return results;
}
