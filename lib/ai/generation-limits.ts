export const MAX_GENERATION_SOURCE_CHARS = 35_000;
// Multipart boundaries and generation instructions are additional to the file.
// Keep the complete request below the platform's 4.5 MB payload limit.
export const MAX_GENERATION_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_GENERATION_REQUEST_BYTES = MAX_GENERATION_FILE_BYTES + 128 * 1024;
