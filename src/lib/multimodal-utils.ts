import { ContentBlock } from "@langchain/core/messages";
import { toast } from "sonner";

// Returns a Promise of a typed multimodal block for images or PDFs
export async function fileToContentBlock(
  file: File,
): Promise<ContentBlock.Multimodal.Data> {
  const supportedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/svg+xml",
  ];
  const supportedOfficeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  const odfTypes = [
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.presentation",
    "application/vnd.oasis.opendocument.spreadsheet",
  ];

  const allSupported = [
    ...supportedImageTypes,
    "application/pdf",
    ...supportedOfficeTypes,
    ...odfTypes,
    // video/audio/document types handled as file blocks
  ];

  // Video / Audio / Large files — NEVER encode as base64.
  // These are sent as file-type blocks with metadata only.
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  const isLargeMedia = isVideo || isAudio;

  if (isLargeMedia) {
    return {
      type: "file",
      mimeType: file.type,
      data: "", // No inlined base64 — metadata carries the URL
      metadata: {
        filename: file.name,
        media_type: isVideo ? "video" : "audio",
        size: file.size,
      },
    } as ContentBlock.Multimodal.Data;
  }

  // Office / ODF / PDF / text — also file blocks (too large for base64)
  const isOfficeOrDocument =
    supportedOfficeTypes.includes(file.type as (typeof supportedOfficeTypes)[number]) ||
    odfTypes.includes(file.type as (typeof odfTypes)[number]) ||
    file.type === "application/pdf" ||
    file.type.startsWith("text/") ||
    file.type === "application/json";

  if (isOfficeOrDocument) {
    return {
      type: "file",
      mimeType: file.type,
      data: "", // No inlined base64 — uploaded to Media Gallery separately
      metadata: {
        filename: file.name,
        size: file.size,
      },
    } as ContentBlock.Multimodal.Data;
  }

  // Images — small enough for base64, keep current behavior
  if (!allSupported.includes(file.type)) {
    toast.error(
      `Unsupported file type: ${file.type}. Supported types: images, videos, audio, PDF, Office documents (DOCX/PPTX/XLSX), ODF (ODT/ODP/ODS), and text files.`,
    );
    return Promise.reject(new Error(`Unsupported file type: ${file.type}`));
  }

  const data = await fileToBase64(file);

  if (supportedImageTypes.includes(file.type)) {
    return {
      type: "image",
      mimeType: file.type,
      data,
      metadata: { name: file.name },
    };
  }

  // Fallback for any remaining supported types (PDF, etc. if not caught above)
  return {
    type: "file",
    mimeType: file.type,
    data,
    metadata: { filename: file.name },
  };
}

// Helper to convert File to base64 string
export async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data:...;base64, prefix
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Type guard for Base64ContentBlock
export function isBase64ContentBlock(
  block: unknown,
): block is ContentBlock.Multimodal.Data {
  if (typeof block !== "object" || block === null || !("type" in block))
    return false;
  const mimeType: string | undefined =
    "mimeType" in block ? (block as { mimeType?: unknown }).mimeType as string | undefined : undefined;
  if (!mimeType) return false;

  // file type (legacy) — images, PDF, Office, ODF, video, audio, text
  if ((block as { type: unknown }).type === "file") {
    return (
      mimeType.startsWith("image/") ||
      mimeType.startsWith("video/") ||
      mimeType.startsWith("audio/") ||
      mimeType === "application/pdf" ||
      mimeType.startsWith("application/vnd.openxmlformats-officedocument") ||
      mimeType.startsWith("application/vnd.oasis.opendocument") ||
      mimeType.startsWith("text/") ||
      mimeType === "application/json"
    );
  }
  // image type (new)
  if (
    (block as { type: unknown }).type === "image" &&
    mimeType.startsWith("image/")
  ) {
    return true;
  }
  return false;
}
