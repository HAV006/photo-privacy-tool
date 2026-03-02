import { analyzeImageFile } from "./exif-reader.js";
import { createCleanCopy } from "./image-cleaner.js";

/**
 * Unified workbench UI
 * - Left: upload + preview
 * - Right: detected metadata + actions (Remove GPS / Remove EXIF) + clean result
 * Everything stays client-side.
 */

const STRINGS = {
  es: {
    start: "Selecciona una foto para empezar.",
    loading: "Procesando la foto localmente en tu navegador…",
    unsupported: "Formato no compatible. Usa JPG, JPEG o PNG.",
    heic: "HEIC/HEIF aún no tiene soporte fiable en todos los navegadores. Convierte la imagen a JPG o PNG.",
    noExif: "No se han encontrado metadatos EXIF legibles en esta imagen.",
    exifFound: "Metadatos detectados",
    gpsDetected: "Ubicación GPS detectada",
    gpsNotDetected: "No se ha detectado ubicación GPS",
    exifDetected: "EXIF detectado",
    exifNotDetected: "Sin EXIF legible",
    privacy: "Tus fotos se procesan en tu navegador. No se suben a nuestros servidores.",
    choose: "Elige una imagen desde tu dispositivo",
    chooseAnother: "Elegir otra imagen",
    removeGps: "Eliminar GPS",
    removeExif: "Eliminar EXIF",
    downloadClean: "Descargar imagen limpia",
    original: "Original",
    clean: "Copia limpia",
    file: "Archivo",
    format: "Formato",
    size: "Tamaño",
    dimensions: "Dimensiones",
    camera: "Cámara",
    date: "Fecha",
    software: "Software",
    orientation: "Orientación",
    field: "Campo",
    value: "Valor",
    cleanReadyGps: "Se ha creado una copia sin ubicación GPS legible.",
    cleanReadyExif: "Se ha creado una copia sin metadatos EXIF legibles.",
    verifiedNoExif: "La copia descargable ya no muestra EXIF legible.",
    verifyWarn: "No hemos podido confirmar la limpieza total en este navegador. Revisa la copia antes de compartirla.",
    gpsRisk: "Si compartes la imagen original, podrías revelar dónde se tomó.",
    parseError: "No hemos podido leer esta imagen. Prueba con otra foto JPG o PNG.",
    pngBasic: "Nota: el soporte EXIF en PNG es básico y depende de si el archivo incluye un bloque eXIf."
  },
  en: {
    start: "Select a photo to begin.",
    loading: "Processing the photo locally in your browser…",
    unsupported: "Unsupported format. Please use JPG, JPEG or PNG.",
    heic: "HEIC/HEIF is not yet reliably supported across browsers. Please convert to JPG or PNG.",
    noExif: "No readable EXIF metadata was found in this image.",
    exifFound: "Detected metadata",
    gpsDetected: "GPS location detected",
    gpsNotDetected: "No GPS location detected",
    exifDetected: "EXIF detected",
    exifNotDetected: "No readable EXIF",
    privacy: "Your photos are processed in your browser. They are not uploaded to our servers.",
    choose: "Choose an image from your device",
    chooseAnother: "Choose another image",
    removeGps: "Remove GPS",
    removeExif: "Remove EXIF",
    downloadClean: "Download clean image",
    original: "Original",
    clean: "Clean copy",
    file: "File",
    format: "Format",
    size: "Size",
    dimensions: "Dimensions",
    camera: "Camera",
    date: "Date",
    software: "Software",
    orientation: "Orientation",
    field: "Field",
    value: "Value",
    cleanReadyGps: "A clean copy without readable GPS location data has been created.",
    cleanReadyExif: "A clean copy without readable EXIF metadata has been created.",
    verifiedNoExif: "The downloadable copy no longer shows readable EXIF metadata.",
    verifyWarn: "We could not fully confirm cleanup in this browser. Please review the copy before sharing.",
    gpsRisk: "If you share the original image, you could reveal where it was taken.",
    parseError: "We could not read this image. Please try another JPG or PNG photo.",
    pngBasic: "Note: PNG EXIF support is basic and depends on whether the file contains an eXIf chunk."
  }
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function setStatus(panel, text, type = "idle") {
  if (!panel) return;
  panel.className = "status-card";
  if (type === "loading") panel.classList.add("is-loading");
  if (type === "error") panel.classList.add("is-error");
  if (type === "success") panel.classList.add("is-success");
  panel.textContent = text;
}

function pickCommonFields(entries) {
  const map = new Map(entries.map((e) => [e.name, e]));
  const get = (name) => map.get(name)?.displayValue;
  return {
    make: get("Make"),
    model: get("Model"),
    software: get("Software"),
    date: get("DateTimeOriginal") || get("DateTime") || get("CreateDate"),
    orientation: get("Orientation")
  };
}

function renderPills(analyzed, lang) {
  const t = STRINGS[lang];
  const gpsPill = analyzed.hasGps
    ? `<span class="pill pill--danger">${escapeHtml(t.gpsDetected)}</span>`
    : `<span class="pill pill--success">${escapeHtml(t.gpsNotDetected)}</span>`;
  const exifPill = analyzed.hasExif
    ? `<span class="pill pill--info">${escapeHtml(t.exifDetected)}</span>`
    : `<span class="pill pill--muted">${escapeHtml(t.exifNotDetected)}</span>`;
  return `<div class="pill-row">${gpsPill}${exifPill}</div>`;
}

function renderFacts(analyzed, lang) {
  const t = STRINGS[lang];
  const common = pickCommonFields(analyzed.entries);
  const camera = [common.make, common.model].filter(Boolean).join(" ") || "-";
  const date = common.date || "-";
  const software = common.software || "-";
  const orientation = common.orientation || "-";
  const dims = analyzed.width && analyzed.height ? `${analyzed.width} × ${analyzed.height}` : "-";

  return `
    <div class="facts">
      <div class="fact"><span>${escapeHtml(t.format)}</span><strong>${escapeHtml((analyzed.fileType || "-").toUpperCase())}</strong></div>
      <div class="fact"><span>${escapeHtml(t.size)}</span><strong>${escapeHtml(formatBytes(analyzed.fileSize, lang))}</strong></div>
      <div class="fact"><span>${escapeHtml(t.dimensions)}</span><strong>${escapeHtml(dims)}</strong></div>
      <div class="fact"><span>${escapeHtml(t.camera)}</span><strong>${escapeHtml(camera)}</strong></div>
      <div class="fact"><span>${escapeHtml(t.date)}</span><strong>${escapeHtml(date)}</strong></div>
      <div class="fact"><span>${escapeHtml(t.software)}</span><strong>${escapeHtml(software)}</strong></div>
      <div class="fact"><span>${escapeHtml(t.orientation)}</span><strong>${escapeHtml(orientation)}</strong></div>
    </div>
  `;
}

function renderMetaTable(entries, lang) {
  const t = STRINGS[lang];
  const rows = entries
    .filter((e) => e.name !== "ExifIFDPointer" && e.name !== "GPSInfoIFDPointer")
    .map((e) => `
      <tr>
        <td>${escapeHtml(e.name)}</td>
        <td>${escapeHtml(e.displayValue || "-")}</td>
      </tr>
    `).join("");

  return `
    <div class="meta-table-wrap">
      <table class="meta-table">
        <thead><tr><th>${escapeHtml(t.field)}</th><th>${escapeHtml(t.value)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="2">${escapeHtml(t.noExif)}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderDetectedPanel(output, analyzed, shell) {
  const lang = shell.dataset.lang || "en";
  const t = STRINGS[lang];
  const tool = shell.dataset.tool;

  const note = analyzed.fileType === "png" ? `<div class="banner banner--warning">${escapeHtml(t.pngBasic)}</div>` : "";
  const gpsRisk = analyzed.hasGps ? `<div class="banner banner--warning">${escapeHtml(t.gpsRisk)}</div>` : "";

  // Decide which action is primary depending on current page
  const primaryAction = tool === "remove-gps" ? "gps" : (tool === "remove-exif" ? "exif" : "exif");
  const gpsBtnClass = primaryAction === "gps" ? "button button--primary" : "button button--secondary";
  const exifBtnClass = primaryAction === "exif" ? "button button--primary" : "button button--secondary";

  output.innerHTML = `
    <div class="workbench-right__head">
      <h2>${escapeHtml(t.exifFound)}</h2>
      ${renderPills(analyzed, lang)}
    </div>
    ${gpsRisk}
    ${note}
    ${renderFacts(analyzed, lang)}
    <div class="button-row button-row--tight">
      <button type="button" class="${gpsBtnClass}" data-action="remove-gps">${escapeHtml(t.removeGps)}</button>
      <button type="button" class="${exifBtnClass}" data-action="remove-exif">${escapeHtml(t.removeExif)}</button>
    </div>
    <details class="meta-details">
      <summary>${escapeHtml(lang === "es" ? "Ver lista completa de metadatos" : "View full metadata list")}</summary>
      ${renderMetaTable(analyzed.entries, lang)}
    </details>
    <div data-clean-result></div>
  `;
}

function renderLocationOnlyPanel(output, analyzed, shell) {
  const lang = shell.dataset.lang || "en";
  const t = STRINGS[lang];
  const yes = analyzed.hasGps;

  const primaryAction = "gps";
  const gpsBtnClass = "button button--primary";
  const exifBtnClass = "button button--secondary";

  const decision = `
    <div class="decision-pill ${yes ? "decision-pill--yes" : "decision-pill--no"}">
      ${escapeHtml(yes ? (lang === "es" ? "Sí contiene ubicación GPS" : "Yes, it contains GPS location") : (lang === "es" ? "No contiene ubicación GPS" : "No, it does not contain GPS location"))}
    </div>
  `;

  output.innerHTML = `
    <div class="workbench-right__head">
      <h2>${escapeHtml(lang === "es" ? "Ubicación" : "Location")}</h2>
      ${decision}
    </div>
    ${yes ? `<div class="banner banner--warning">${escapeHtml(t.gpsRisk)}</div>` : ""}
    ${renderFacts(analyzed, lang)}
    <div class="button-row button-row--tight">
      <button type="button" class="${gpsBtnClass}" data-action="remove-gps">${escapeHtml(t.removeGps)}</button>
      <button type="button" class="${exifBtnClass}" data-action="remove-exif">${escapeHtml(t.removeExif)}</button>
    </div>
    <details class="meta-details">
      <summary>${escapeHtml(lang === "es" ? "Ver campos GPS detectados" : "View detected GPS fields")}</summary>
      ${renderMetaTable(analyzed.entries.filter((e) => e.name.startsWith("GPS") || e.name === "GPSCoordinates"), lang)}
    </details>
    <div data-clean-result></div>
  `;
}

function renderCleanResult(container, originalAnalysis, mode, cleanResult, cleanAnalysis, url, shell) {
  const lang = shell.dataset.lang || "en";
  const t = STRINGS[lang];
  const verified = !cleanAnalysis.hasExif;

  const headline = mode === "remove-gps" ? t.cleanReadyGps : t.cleanReadyExif;

  container.innerHTML = `
    <section class="clean-result card">
      <h3>${escapeHtml(headline)}</h3>
      <div class="banner ${verified ? "banner--success" : "banner--warning"}">
        ${escapeHtml(verified ? t.verifiedNoExif : t.verifyWarn)}
      </div>
      <div class="stat-grid">
        <div class="stat-card">
          <strong>${escapeHtml(cleanResult.fileName)}</strong>
          <span>${escapeHtml(t.clean)} · ${escapeHtml(formatBytes(cleanResult.blob.size, lang))}</span>
        </div>
        <div class="stat-card">
          <strong>${escapeHtml(`${cleanResult.width} × ${cleanResult.height}`)}</strong>
          <span>${escapeHtml(t.dimensions)}</span>
        </div>
        <div class="stat-card">
          <strong>${escapeHtml(cleanResult.outputMime.replace("image/", "").toUpperCase())}</strong>
          <span>${escapeHtml(t.format)}</span>
        </div>
      </div>
      <div class="preview-mini">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(cleanResult.fileName)}" loading="lazy">
      </div>
      <div class="button-row">
        <a class="button button--primary" href="${escapeHtml(url)}" download="${escapeHtml(cleanResult.fileName)}">${escapeHtml(t.downloadClean)}</a>
      </div>
    </section>
  `;
}

async function analyzeAndRender(file, shell) {
  const lang = shell.dataset.lang || "en";
  const t = STRINGS[lang];

  const statusPanel = shell.querySelector("[data-status]");
  const output = shell.querySelector("[data-output]");
  const previewImg = shell.querySelector("[data-preview-img]");
  const previewWrap = shell.querySelector("[data-preview]");
  const fileNameEl = shell.querySelector("[data-file-name]");
  const fileInfoEl = shell.querySelector("[data-file-info]");

  output.hidden = true;
  output.innerHTML = "";
  setStatus(statusPanel, t.loading, "loading");

  try {
    const analyzed = await analyzeImageFile(file);

    if (!analyzed.supported) {
      const message = analyzed.fileType === "heic" ? t.heic : (analyzed.warning || t.unsupported);
      setStatus(statusPanel, message, "error");
      return;
    }

    // Store current file + analysis for actions
    shell._pptFile = file;
    shell._pptAnalysis = analyzed;

    // Preview
    if (previewImg && previewWrap) {
      const url = URL.createObjectURL(file);
      const prev = shell._pptPreviewUrl;
      if (prev) URL.revokeObjectURL(prev);
      shell._pptPreviewUrl = url;
      previewImg.src = url;
      previewImg.alt = file.name;
      previewWrap.hidden = false;
    }

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileInfoEl) fileInfoEl.textContent = `${formatBytes(file.size, lang)} · ${(analyzed.fileType || "").toUpperCase()}`;

    setStatus(statusPanel, t.exifFound, "success");

    if (shell.dataset.tool === "check-location") {
      renderLocationOnlyPanel(output, analyzed, shell);
    } else {
      renderDetectedPanel(output, analyzed, shell);
    }

    output.hidden = false;
    bindActions(shell);
  } catch (e) {
    setStatus(statusPanel, t.parseError, "error");
  }
}

async function runClean(shell, mode) {
  const lang = shell.dataset.lang || "en";
  const t = STRINGS[lang];
  const statusPanel = shell.querySelector("[data-status]");
  const output = shell.querySelector("[data-output]");
  const resultContainer = output.querySelector("[data-clean-result]");
  const file = shell._pptFile;
  const originalAnalysis = shell._pptAnalysis;

  if (!file || !originalAnalysis || !resultContainer) return;

  setStatus(statusPanel, t.loading, "loading");
  resultContainer.innerHTML = "";

  try {
    const cleanResult = await createCleanCopy(file);
    const cleanFile = new File([cleanResult.blob], cleanResult.fileName, { type: cleanResult.outputMime });
    const cleanAnalysis = await analyzeImageFile(cleanFile);

    const cleanUrl = URL.createObjectURL(cleanResult.blob);
    const prev = shell._pptCleanUrl;
    if (prev) URL.revokeObjectURL(prev);
    shell._pptCleanUrl = cleanUrl;

    setStatus(statusPanel, (!cleanAnalysis.hasExif ? t.verifiedNoExif : t.verifyWarn), !cleanAnalysis.hasExif ? "success" : "error");
    renderCleanResult(resultContainer, originalAnalysis, mode, cleanResult, cleanAnalysis, cleanUrl, shell);
  } catch (e) {
    setStatus(statusPanel, t.parseError, "error");
  }
}

function bindActions(shell) {
  const output = shell.querySelector("[data-output]");
  if (!output) return;

  output.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => runClean(shell, btn.dataset.action), { once: false });
  });
}

export function initToolShell(shell) {
  const lang = shell.dataset.lang || "en";
  const t = STRINGS[lang];

  const fileInput = shell.querySelector("[data-file-input]");
  const dropzone = shell.querySelector("[data-dropzone]");
  const triggerButton = shell.querySelector("[data-trigger-file]");
  const statusPanel = shell.querySelector("[data-status]");

  setStatus(statusPanel, t.start, "idle");

  triggerButton?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) analyzeAndRender(file, shell);
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
    if (file) analyzeAndRender(file, shell);
  });
}
