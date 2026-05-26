import { toast } from "sonner";
import { ContentBlock } from "@langchain/core/messages";
import { fileToContentBlock } from "@/lib/multimodal-utils";

/**
 * Supported file types for upload
 */
export const OFFICE_FILE_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** ODF (OpenDocument) files — gated behind ALPHARAVIS_ENABLE_ODF_UPLOAD */
export const ODF_FILE_TYPES = [
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
] as const;

const IMAGE_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/svg+xml",
] as const;

const VIDEO_FILE_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/x-m4v",
  "video/x-flv",
  "video/x-ms-wmv",
  "video/MP2T",
  "video/3gpp",
  "video/3gpp2",
  "video/ogg",
] as const;

const AUDIO_FILE_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
] as const;

const DOCUMENT_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
] as const;

export const SUPPORTED_FILE_TYPES = [
  ...IMAGE_FILE_TYPES,
  ...VIDEO_FILE_TYPES,
  ...AUDIO_FILE_TYPES,
  ...OFFICE_FILE_TYPES,
  ...ODF_FILE_TYPES,
  ...DOCUMENT_FILE_TYPES,
] as const;

const PASTED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function shouldRenamePastedFile(file: File): boolean {
  const normalizedName = file.name.trim().toLowerCase();
  return (
    file.type.startsWith("image/") &&
    (!normalizedName || normalizedName === "image.png" || normalizedName === "image.jpeg")
  );
}

function normalizePastedFileNames(files: File[]): File[] {
  return files.map((file, index) => {
    if (!shouldRenamePastedFile(file)) return file;

    const extension = PASTED_IMAGE_EXTENSIONS[file.type] ?? "png";
    const name = `pasted-image-${new Date().toISOString().replace(/[:.]/g, "-")}-${index + 1}.${extension}`;
    return new File([file], name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  });
}

/**
 * Error messages for file validation
 */
const ERROR_MESSAGES = {
  INVALID_FILE_TYPE:
    "You have uploaded an invalid file type. Please upload an image (JPEG, PNG, GIF, WEBP, HEIC, SVG), video (MP4, WebM, MOV, MKV, AVI), audio (MP3, WAV, OGG, FLAC), PDF, Office document (DOCX, PPTX, XLSX), OpenDocument (ODT, ODP, ODS), or text file (TXT, MD, CSV, JSON, HTML).",
  INVALID_FILE_TYPE_PASTE:
    "You have pasted an invalid file type. Please paste an image (JPEG, PNG, GIF, WEBP) file.",
  DUPLICATE_FILES: (fileNames: string[]) =>
    `Duplicate file(s) detected: ${fileNames.join(", ")}. Each file can only be uploaded once per message.`,
} as const;

/**
 * Check if a file is already uploaded (duplicate)
 */
export function isDuplicate(
  file: File,
  existingBlocks: ContentBlock.Multimodal.Data[],
): boolean {
  // All non-image types: match by filename + mimeType
  if (
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/") ||
    file.type === "application/pdf" ||
    OFFICE_FILE_TYPES.includes(file.type as (typeof OFFICE_FILE_TYPES)[number]) ||
    ODF_FILE_TYPES.includes(file.type as (typeof ODF_FILE_TYPES)[number]) ||
    file.type.startsWith("text/") ||
    file.type === "application/json"
  ) {
    return existingBlocks.some(
      (block) =>
        block.type === "file" &&
        block.mimeType === file.type &&
        block.metadata?.filename === file.name,
    );
  }

  // Images: match by name + mimeType
  if (
    file.type.startsWith("image/")
  ) {
    return existingBlocks.some(
      (block) =>
        block.type === "image" &&
        block.metadata?.name === file.name &&
        block.mimeType === file.type,
    );
  }

  return false;
}

/**
 * Result of file validation
 */
export interface FileValidationResult {
  validFiles: File[];
  invalidFiles: File[];
  duplicateFiles: File[];
  uniqueFiles: File[];
}

/**
 * Validate a list of files against supported types and existing blocks
 */
export function validateFiles(
  files: File[],
  existingBlocks: ContentBlock.Multimodal.Data[],
): FileValidationResult {
  const validFiles = files.filter((file) =>
    SUPPORTED_FILE_TYPES.includes(file.type as (typeof SUPPORTED_FILE_TYPES)[number]),
  );
  const invalidFiles = files.filter(
    (file) => !SUPPORTED_FILE_TYPES.includes(file.type as (typeof SUPPORTED_FILE_TYPES)[number]),
  );
  const duplicateFiles = validFiles.filter((file) =>
    isDuplicate(file, existingBlocks),
  );
  const uniqueFiles = validFiles.filter(
    (file) => !isDuplicate(file, existingBlocks),
  );

  return {
    validFiles,
    invalidFiles,
    duplicateFiles,
    uniqueFiles,
  };
}

/**
 * Show toast errors for invalid/duplicate files
 */
export function showFileValidationErrors(
  validation: FileValidationResult,
  isPaste = false,
): void {
  if (validation.invalidFiles.length > 0) {
    toast.error(
      isPaste
        ? ERROR_MESSAGES.INVALID_FILE_TYPE_PASTE
        : ERROR_MESSAGES.INVALID_FILE_TYPE,
    );
  }

  if (validation.duplicateFiles.length > 0) {
    toast.error(
      ERROR_MESSAGES.DUPLICATE_FILES(
        validation.duplicateFiles.map((f) => f.name),
      ),
    );
  }
}

/**
 * Process files: validate, show errors, and convert to content blocks
 */
export async function processFiles(
  files: File[],
  existingBlocks: ContentBlock.Multimodal.Data[],
  isPaste = false,
): Promise<ContentBlock.Multimodal.Data[]> {
  const normalizedFiles = isPaste ? normalizePastedFileNames(files) : files;
  const validation = validateFiles(normalizedFiles, existingBlocks);
  showFileValidationErrors(validation, isPaste);

  if (validation.uniqueFiles.length === 0) {
    return [];
  }

  const newBlocks = (await Promise.all(
    validation.uniqueFiles.map(fileToContentBlock),
  )) as ContentBlock.Multimodal.Data[];
  return newBlocks;
}
