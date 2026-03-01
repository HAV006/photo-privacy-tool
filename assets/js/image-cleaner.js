import { detectFileType } from "./exif-reader.js";

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image could not be decoded."));
    };
    image.src = objectUrl;
  });
}

async function drawToCanvas(file) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { alpha: true });
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvas;
    } catch (error) {
      // Fallback to Image() below.
    }
  }

  const image = await loadImageElement(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { alpha: true });
  context.drawImage(image, 0, 0);
  return canvas;
}

export function createCleanFileName(originalName, outputMime) {
  const extension = outputMime === "image/png" ? "png" : "jpg";
  const sanitized = originalName.replace(/\.[^.]+$/, "");
  return `${sanitized}-clean.${extension}`;
}

export async function createCleanCopy(file) {
  const buffer = await file.arrayBuffer();
  const type = detectFileType(buffer, file.type || "");
  if (!["jpeg", "png"].includes(type)) {
    throw new Error("Only JPG, JPEG and PNG are supported in this V1.");
  }

  const canvas = await drawToCanvas(file);
  const outputMime = type === "png" ? "image/png" : "image/jpeg";
  const quality = outputMime === "image/jpeg" ? 0.92 : undefined;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((generatedBlob) => {
      if (!generatedBlob) {
        reject(new Error("The browser could not create a cleaned copy."));
        return;
      }
      resolve(generatedBlob);
    }, outputMime, quality);
  });

  return {
    blob,
    outputMime,
    width: canvas.width,
    height: canvas.height,
    fileName: createCleanFileName(file.name, outputMime)
  };
}
