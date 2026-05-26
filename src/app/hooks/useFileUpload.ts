import { useState, useRef, useEffect, ChangeEvent, useCallback } from "react";
import { ContentBlock } from "@langchain/core/messages";
import { toast } from "sonner";
import { processFiles } from "@/lib/file-validation";
import { fileToBase64 } from "@/lib/multimodal-utils";

interface UseFileUploadOptions {
  initialBlocks?: ContentBlock.Multimodal.Data[];
}

/** Files that must be uploaded to Media Gallery (never base64 in context) */
const LARGE_MEDIA_PREFIXES = ["video/", "audio/"];
const DOCUMENT_PREFIXES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.oasis.opendocument",
  "text/",
  "application/json",
];

const MEDIA_GALLERY_UPLOAD_URL =
  process.env.NEXT_PUBLIC_MEDIA_GALLERY_UPLOAD_URL || "http://localhost:8130/api/assets/upload";

function needsGalleryUpload(file: File): boolean {
  if (LARGE_MEDIA_PREFIXES.some((p) => file.type.startsWith(p))) return true;
  if (DOCUMENT_PREFIXES.some((p) => file.type.startsWith(p))) return true;
  return false;
}

/**
 * Upload a file to the Media Gallery and return the public URL.
 */
async function uploadToMediaGallery(file: File): Promise<{
  asset_id: string;
  public_url: string;
}> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(MEDIA_GALLERY_UPLOAD_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Media Gallery upload failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return {
    asset_id: data.asset_id as string,
    public_url: data.public_url as string,
  };
}

export function useFileUpload({
  initialBlocks = [],
}: UseFileUploadOptions = {}) {
  const [contentBlocks, setContentBlocks] =
    useState<ContentBlock.Multimodal.Data[]>(initialBlocks);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const addFiles = useCallback(
    async (files: File[], isPaste = false) => {
      if (files.length === 0) return;

      setIsProcessingFiles(true);
      try {
        // Split files: images stay as base64, large/media files go to Gallery
        const galleryFiles: File[] = [];
        const inlineFiles: File[] = [];
        for (const file of files) {
          if (needsGalleryUpload(file)) {
            galleryFiles.push(file);
          } else {
            inlineFiles.push(file);
          }
        }

        const newBlocks: ContentBlock.Multimodal.Data[] = [];

        // Process images inline (base64, current behavior)
        if (inlineFiles.length > 0) {
          const imageBlocks = await processFiles(inlineFiles, contentBlocks, isPaste);
          newBlocks.push(...imageBlocks);
        }

        // Upload large/media files to Media Gallery
        for (const file of galleryFiles) {
          try {
            const { asset_id, public_url } = await uploadToMediaGallery(file);
            const isVideo = file.type.startsWith("video/");
            const isAudio = file.type.startsWith("audio/");
            newBlocks.push({
              type: "file",
              mimeType: file.type,
              data: "", // No inline data — URL in metadata
              metadata: {
                filename: file.name,
                url: public_url,
                asset_id: asset_id,
                media_type: isVideo ? "video" : isAudio ? "audio" : "document",
                size: file.size,
              },
            } as ContentBlock.Multimodal.Data);
          } catch (err) {
            console.error("Gallery upload failed for", file.name, err);
            toast.error(`Failed to upload ${file.name} to Media Gallery`);
          }
        }

        if (newBlocks.length > 0) {
          setContentBlocks((prev) => [...prev, ...newBlocks]);
          toast.success(
            `${newBlocks.length} file${newBlocks.length === 1 ? "" : "s"} attached`,
          );
        }
      } catch (error) {
        console.error("Error processing files:", error);
        toast.error("Failed to process uploaded file(s)");
      } finally {
        setIsProcessingFiles(false);
      }
    },
    [contentBlocks],
  );

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    await addFiles(Array.from(files), false);
    e.target.value = "";
  };

  // Drag and drop handlers
  useEffect(() => {
    if (!dropRef.current) return;

    // Global drag events with counter for robust dragOver state
    const handleWindowDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCounter.current += 1;
        setDragOver(true);
      }
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          setDragOver(false);
          dragCounter.current = 0;
        }
      }
    };
    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);

      if (!e.dataTransfer) return;

      await addFiles(Array.from(e.dataTransfer.files), false);
    };
    const handleWindowDragEnd = () => {
      dragCounter.current = 0;
      setDragOver(false);
    };
    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    window.addEventListener("dragend", handleWindowDragEnd);

    // Prevent default browser behavior for dragover globally
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("dragover", handleWindowDragOver);

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    };
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
    };
    const element = dropRef.current;
    element.addEventListener("dragover", handleDragOver);
    element.addEventListener("dragenter", handleDragEnter);
    element.addEventListener("dragleave", handleDragLeave);

    return () => {
      element.removeEventListener("dragover", handleDragOver);
      element.removeEventListener("dragenter", handleDragEnter);
      element.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("dragend", handleWindowDragEnd);
      window.removeEventListener("dragover", handleWindowDragOver);
      dragCounter.current = 0;
    };
  }, [addFiles]);

  const removeBlock = (idx: number) => {
    setContentBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetBlocks = () => setContentBlocks([]);

  /**
   * Handle paste event for files (images, PDFs)
   * Can be used as onPaste={handlePaste} on a textarea or input
   */
  const handlePaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    const items = e.clipboardData.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length === 0) {
      return;
    }

    e.preventDefault();
    await addFiles(files, true);
  };

  return {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    resetBlocks,
    dragOver,
    handlePaste,
    isProcessingFiles,
  };
}
