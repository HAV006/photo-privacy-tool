import { analyzeImageFile } from "./exif-reader.js";
import { createCleanCopy } from "./image-cleaner.js";

const STRINGS = {
  es: {
    start: "Selecciona una foto JPG, JPEG o PNG para empezar.",
    loading: "Procesando la foto localmente en tu navegador…",
    unsupported: "Formato no compatible. Usa JPG, JPEG o PNG.",
    heic: "HEIC y HEIF aún no cuentan con soporte fiable en esta V1. Convierte primero la imagen a JPG o PNG.",
    noExif: "No se han encontrado metadatos EXIF legibles en esta imagen.",
    exifFound: "Se han encontrado metadatos EXIF en la imagen.",
    gpsYes: "Sí contiene ubicación GPS",
    gpsNo: "No contiene ubicación GPS",
    gpsExplainYes: "El archivo conserva coordenadas GPS en sus metadatos. Si compartes la imagen original, podrías revelar dónde se tomó.",
    gpsExplainNo: "No hemos detectado coordenadas GPS legibles en este archivo. Aun así, si la privacidad es importante, puedes compartir una copia limpia.",
    removeVerified: "La copia descargable se ha verificado y no conserva metadatos EXIF legibles.",
    removeGpsNote: "En esta V1, al quitar GPS también se elimina el resto del EXIF para ofrecer una copia más privada.",
    chooseAnother: "Elegir otra imagen",
    downloadClean: "Descargar imagen limpia",
    originalFile: "Archivo original",
    outputFile: "Archivo limpio",
    dimensions: "Dimensiones",
    format: "Formato",
    metadata: "Metadatos",
    tableField: "Campo",
    tableValue: "Valor",
    gpsAlert: "La imagen contiene ubicación GPS.",
    gpsSafe: "No se ha detectado ubicación GPS.",
    parseError: "No hemos podido leer esta imagen. Prueba con otra foto JPG o PNG.",
    postCleanNoExif: "La copia limpia no muestra EXIF legible al volver a analizarla.",
    postCleanStillExif: "No hemos podido confirmar la limpieza total del EXIF en este navegador. Revisa la copia antes de compartirla.",
    pngBasic: "Nota sobre PNG: el soporte de lectura EXIF en PNG es básico y depende de si el archivo contiene un bloque eXIf.",
    hasExifYes: "EXIF detectado",
    hasExifNo: "Sin EXIF legible"
  },
  en: {
    start: "Select a JPG, JPEG or PNG photo to begin.",
    loading: "Processing the photo locally in your browser…",
    unsupported: "Unsupported format. Please use JPG, JPEG or PNG.",
    heic: "HEIC and HEIF do not yet have reliable support in this V1. Please convert the image to JPG or PNG first.",
    noExif: "No readable EXIF metadata was found in this image.",
    exifFound: "EXIF metadata was found in the image.",
    gpsYes: "Yes, it contains GPS location",
    gpsNo: "No, it does not contain GPS location",
    gpsExplainYes: "The file still stores GPS coordinates in its metadata. If you share the original image, you could reveal where it was taken.",
    gpsExplainNo: "We did not detect readable GPS coordinates in this file. Even so, if privacy matters, you can still share a clean copy.",
    removeVerified: "The downloadable copy was verified and no longer keeps readable EXIF metadata.",
    removeGpsNote: "In this V1, removing GPS also removes the rest of the EXIF block to produce a more private copy.",
    chooseAnother: "Choose another image",
    downloadClean: "Download clean image",
    originalFile: "Original file",
    outputFile: "Clean file",
    dimensions: "Dimensions",
    format: "Format",
    metadata: "Metadata",
    tableField: "Field",
    tableValue: "Value",
    gpsAlert: "The image contains GPS location data.",
    gpsSafe: "No GPS location data was detected.",
    parseError: "We could not read this image. Please try another JPG or PNG photo.",
    postCleanNoExif: "The clean copy shows no readable EXIF when analyzed again.",
    postCleanStillExif: "We could not fully confirm EXIF cleanup in this browser. Please review the copy before sharing.",
    pngBasic: "PNG note: EXIF reading support is basic and depends on whether the file contains an eXIf chunk.",
    hasExifYes: "EXIF detected",
    hasExifNo: "No readable EXIF"
  }
};

function formatBytes(size, lang) {
  if (!Number.isFinite(size)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = value >= 10 || index === 0 ? 0 : 1;
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: decimals }).format(value);
  return `${number} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(panel, text, type = "idle") {
  panel.className = "status-card";
  if (type === "loading") panel.classList.add("is-loading");
  if (type === "error") panel.classList.add("is-error");
  if (type === "success") panel.classList.add("is-success");
  panel.textContent = text;
}

function renderMetaTable(entries, lang) {
  const labels = STRINGS[lang];
  const rows = entries
    .filter((entry) => entry.name !== "ExifIFDPointer" && entry.name !== "GPSInfoIFDPointer")
    .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.name)}</td>
        <td>${escapeHtml(entry.displayValue || "-")}</td>
      </tr>
    `)
    .join("");

  return `
    <div class="meta-table-wrap">
      <table class="meta-table">
        <thead>
          <tr>
            <th>${labels.tableField}</th>
            <th>${labels.tableValue}</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="2">${escapeHtml(labels.noExif)}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderSummary(analyzed, lang) {
  const labels = STRINGS[lang];
  return `
    <section class="summary-card meta-summary">
      <div class="stat-grid">
        <div class="stat-card">
          <strong>${escapeHtml(analyzed.fileName)}</strong>
          <span>${escapeHtml(labels.originalFile)} · ${escapeHtml(formatBytes(analyzed.fileSize, lang))}</span>
        </div>
        <div class="stat-card">
          <strong>${escapeHtml((analyzed.fileType || "").toUpperCase() || "-")}</strong>
          <span>${escapeHtml(labels.format)}</span>
        </div>
        <div class="stat-card">
          <strong>${escapeHtml(analyzed.hasExif ? labels.hasExifYes : labels.hasExifNo)}</strong>
          <span>${escapeHtml(labels.metadata)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderViewExif(output, analyzed, shell) {
  const lang = shell.dataset.lang;
  const labels = STRINGS[lang];
  const gpsBanner = analyzed.hasGps
    ? `<div class="banner banner--danger">${escapeHtml(labels.gpsAlert)}${analyzed.gps ? ` ${escapeHtml(analyzed.gps.latitude.toFixed(6))}, ${escapeHtml(analyzed.gps.longitude.toFixed(6))}` : ""}</div>`
    : `<div class="banner banner--success">${escapeHtml(labels.gpsSafe)}</div>`;

  const note = analyzed.fileType === "png"
    ? `<div class="banner banner--warning">${escapeHtml(labels.pngBasic)}</div>`
    : "";

  output.innerHTML = `
    ${renderSummary(analyzed, lang)}
    <section class="card">
      <p class="kicker">${escapeHtml(labels.metadata)}</p>
      <h2>${escapeHtml(analyzed.hasExif ? labels.exifFound : labels.noExif)}</h2>
      ${gpsBanner}
      ${note}
      ${renderMetaTable(analyzed.entries, lang)}
    </section>
  `;
}

function renderCheckLocation(output, analyzed, shell) {
  const lang = shell.dataset.lang;
  const labels = STRINGS[lang];
  const removeGpsUrl = shell.dataset.removeGpsUrl;
  const yes = analyzed.hasGps;

  output.innerHTML = `
    ${renderSummary(analyzed, lang)}
    <section class="decision-card">
      <div class="decision-pill ${yes ? "decision-pill--yes" : "decision-pill--no"}">
        ${escapeHtml(yes ? labels.gpsYes : labels.gpsNo)}
      </div>
      <p>${escapeHtml(yes ? labels.gpsExplainYes : labels.gpsExplainNo)}</p>
      <div class="button-row">
        <a class="button button--primary" href="${escapeHtml(removeGpsUrl)}">${escapeHtml(lang === "es" ? "Quitar ubicación GPS" : "Remove GPS location")}</a>
      </div>
    </section>
    <section class="card">
      <h2>${escapeHtml(lang === "es" ? "Qué hemos encontrado" : "What we found")}</h2>
      ${renderMetaTable(analyzed.entries.filter((entry) => entry.name.startsWith("GPS") || entry.name === "GPSCoordinates"), lang)}
    </section>
  `;
}

function renderRemoveOutput(output, originalAnalysis, cleanResult, cleanAnalysis, shell, url) {
  const lang = shell.dataset.lang;
  const labels = STRINGS[lang];
  const gpsSpecific = shell.dataset.tool === "remove-gps";
  const verified = !cleanAnalysis.hasExif;
  const originalGpsNote = originalAnalysis.hasGps
    ? `<div class="banner banner--danger">${escapeHtml(labels.gpsAlert)}</div>`
    : `<div class="banner banner--success">${escapeHtml(labels.gpsSafe)}</div>`;

  output.innerHTML = `
    ${renderSummary(originalAnalysis, lang)}
    <section class="card">
      <h2>${escapeHtml(lang === "es" ? "Copia limpia lista para descargar" : "Clean copy ready to download")}</h2>
      ${originalGpsNote}
      <div class="stat-grid">
        <div class="stat-card">
          <strong>${escapeHtml(cleanResult.fileName)}</strong>
          <span>${escapeHtml(labels.outputFile)} · ${escapeHtml(formatBytes(cleanResult.blob.size, lang))}</span>
        </div>
        <div class="stat-card">
          <strong>${escapeHtml(`${cleanResult.width} × ${cleanResult.height}`)}</strong>
          <span>${escapeHtml(labels.dimensions)}</span>
        </div>
        <div class="stat-card">
          <strong>${escapeHtml(cleanResult.outputMime.replace("image/", "").toUpperCase())}</strong>
          <span>${escapeHtml(labels.format)}</span>
        </div>
      </div>
      <div class="banner ${verified ? "banner--success" : "banner--warning"}">
        ${escapeHtml(verified ? labels.removeVerified : labels.postCleanStillExif)}
      </div>
      ${gpsSpecific ? `<div class="banner banner--warning">${escapeHtml(labels.removeGpsNote)}</div>` : ""}
      <div class="preview-grid">
        <div class="preview-card">
          <p class="kicker">${escapeHtml(labels.outputFile)}</p>
          <img src="${escapeHtml(url)}" alt="${escapeHtml(cleanResult.fileName)}" loading="lazy">
        </div>
        <div class="preview-card">
          <p class="kicker">${escapeHtml(labels.metadata)}</p>
          <ul class="info-list">
            <li>${escapeHtml(verified ? labels.postCleanNoExif : labels.postCleanStillExif)}</li>
            <li>${escapeHtml(lang === "es" ? "Procesado localmente en el navegador." : "Processed locally in the browser.")}</li>
            <li>${escapeHtml(lang === "es" ? "No se ha enviado la foto a un servidor propio para esta acción." : "The photo was not sent to our own server for this action.")}</li>
          </ul>
        </div>
      </div>
      <div class="button-row">
        <a class="button button--primary" href="${escapeHtml(url)}" download="${escapeHtml(cleanResult.fileName)}">${escapeHtml(labels.downloadClean)}</a>
      </div>
    </section>
  `;
}

async function handleSelectedFile(file, shell, statusPanel, output) {
  const lang = shell.dataset.lang;
  const labels = STRINGS[lang];
  output.hidden = true;
  output.innerHTML = "";
  setStatus(statusPanel, labels.loading, "loading");

  try {
    const analyzed = await analyzeImageFile(file);

    if (!analyzed.supported) {
      const message = analyzed.fileType === "heic" ? labels.heic : (analyzed.warning || labels.unsupported);
      setStatus(statusPanel, message, "error");
      return;
    }

    setStatus(statusPanel, labels.exifFound, "success");

    if (shell.dataset.tool === "view-exif") {
      renderViewExif(output, analyzed, shell);
      output.hidden = false;
      return;
    }

    if (shell.dataset.tool === "check-location") {
      setStatus(statusPanel, analyzed.hasGps ? labels.gpsYes : labels.gpsNo, analyzed.hasGps ? "error" : "success");
      renderCheckLocation(output, analyzed, shell);
      output.hidden = false;
      return;
    }

    const cleanResult = await createCleanCopy(file);
    const cleanFile = new File([cleanResult.blob], cleanResult.fileName, { type: cleanResult.outputMime });
    const cleanAnalysis = await analyzeImageFile(cleanFile);
    const cleanUrl = URL.createObjectURL(cleanResult.blob);
    const previousUrl = shell.dataset.currentObjectUrl;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    shell.dataset.currentObjectUrl = cleanUrl;

    setStatus(statusPanel, cleanAnalysis.hasExif ? labels.postCleanStillExif : labels.removeVerified, cleanAnalysis.hasExif ? "error" : "success");
    renderRemoveOutput(output, analyzed, cleanResult, cleanAnalysis, shell, cleanUrl);
    output.hidden = false;
  } catch (error) {
    setStatus(statusPanel, labels.parseError, "error");
  }
}

export function initToolShell(shell) {
  const lang = shell.dataset.lang || "en";
  const labels = STRINGS[lang];
  const fileInput = shell.querySelector("[data-file-input]");
  const dropzone = shell.querySelector("[data-dropzone]");
  const triggerButton = shell.querySelector("[data-trigger-file]");
  const statusPanel = shell.querySelector("[data-status]");
  const output = shell.querySelector("[data-output]");

  setStatus(statusPanel, labels.start, "idle");

  triggerButton?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleSelectedFile(file, shell, statusPanel, output);
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone?.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      handleSelectedFile(file, shell, statusPanel, output);
    }
  });
}
