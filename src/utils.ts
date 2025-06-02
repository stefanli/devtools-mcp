import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Some CDP responses return data fields with base64 encoded binary data. This
 * function takes that data and saves it as a file and then updates the field to
 * instead contain the file path, allowing the agent to retrieve the file if
 * needed without blowing up the context window.
 */
export function processBinaryData(
  response: any,
  outputDir: string,
  binaryFields: string[] = ["data", "content", "body", "screenshot"],
  minBinarySize: number = 1000
): any {
  ensureOutputDir(outputDir);

  const processObject = (obj: any): any => {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(processObject);
    }

    const processed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (
        typeof value === "string" &&
        binaryFields.includes(key) &&
        value.length > minBinarySize &&
        isBase64(value)
      ) {
        // Save binary data to file
        const filePath = saveBinaryToFile(value, key, outputDir);
        processed[key] = `[Binary data saved to: ${filePath}]`;
      } else if (typeof value === "object") {
        processed[key] = processObject(value);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  };

  return processObject(response);
}

export function isBase64(str: string): boolean {
  try {
    // Check if string matches base64 pattern
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length % 4 === 0;
  } catch {
    return false;
  }
}

export function saveBinaryToFile(
  data: string,
  fieldName: string,
  outputDir: string
): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  const extension = getFileExtension(fieldName, data);
  const fileName = `${fieldName}_${timestamp}_${random}${extension}`;
  const filePath = path.join(outputDir, fileName);

  try {
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (error) {
    console.error(`Failed to save binary data to ${filePath}:`, error);
    return `[Failed to save binary data: ${error}]`;
  }
}

export function getFileExtension(fieldName: string, data: string): string {
  // Try to determine file type from field name or data header
  if (fieldName === "data" || fieldName === "screenshot") {
    // Check if it's a PNG (starts with iVBORw0KGgo)
    if (data.startsWith("iVBORw0KGgo")) return ".png";
    // Check if it's a JPEG (starts with /9j/)
    if (data.startsWith("/9j/")) return ".jpg";
    // Check if it's a PDF (starts with JVBERi0)
    if (data.startsWith("JVBERi0")) return ".pdf";
    return ".png"; // Default for screenshots
  }
  return ".bin"; // Default binary extension
}
