const TIFF_TYPES = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8 // SRATIONAL
};

const IFD0_TAGS = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x8769: "ExifIFDPointer",
  0x8825: "GPSInfoIFDPointer"
};

const EXIF_TAGS = {
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISOSpeedRatings",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue",
  0x9204: "ExposureBiasValue",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa403: "WhiteBalance",
  0xa405: "FocalLengthIn35mmFilm",
  0xa434: "LensModel",
  0xa431: "BodySerialNumber",
  0xa432: "LensSpecification"
};

const GPS_TAGS = {
  0x0000: "GPSVersionID",
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude",
  0x0007: "GPSTimeStamp",
  0x0012: "GPSMapDatum",
  0x001d: "GPSDateStamp"
};

function bytesToString(bytes) {
  return new TextDecoder("ascii").decode(bytes);
}

export function detectFileType(buffer, mimeType = "") {
  const view = new DataView(buffer);
  if (buffer.byteLength >= 2 && view.getUint16(0) === 0xffd8) {
    return "jpeg";
  }

  if (
    buffer.byteLength >= 8 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a
  ) {
    return "png";
  }

  if (buffer.byteLength >= 12) {
    const header = new Uint8Array(buffer.slice(4, 12));
    const boxType = bytesToString(header.slice(0, 4));
    const brand = bytesToString(header.slice(4, 8)).toLowerCase();
    if (boxType === "ftyp" && ["heic", "heix", "hevc", "heim", "heif", "mif1", "msf1"].includes(brand)) {
      return "heic";
    }
  }

  if ((mimeType || "").toLowerCase().includes("heic") || (mimeType || "").toLowerCase().includes("heif")) {
    return "heic";
  }

  return "unknown";
}

function safeSliceBytes(buffer, start, length) {
  if (start < 0 || length < 0 || start + length > buffer.byteLength) {
    return null;
  }
  return new Uint8Array(buffer, start, length);
}

function getTypeSize(type) {
  return TIFF_TYPES[type] || 0;
}

function readAscii(view, offset, count, isLittleEndian) {
  if (count <= 0) {
    return "";
  }
  const bytes = new Uint8Array(view.buffer, offset, count);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return text.replace(/\u0000+$/g, "").trim();
}

function readInlineAscii(view, valueOffset, count) {
  const bytes = new Uint8Array(view.buffer, valueOffset, Math.min(count, 4));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000+$/g, "").trim();
}

function readValue(view, tiffStart, type, count, valueOffset, isLittleEndian) {
  const typeSize = getTypeSize(type);
  if (!typeSize || count < 0) {
    return null;
  }

  const totalSize = typeSize * count;
  const actualOffset = totalSize <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, isLittleEndian);

  if (actualOffset < 0 || actualOffset + totalSize > view.byteLength) {
    return null;
  }

  const values = [];

  for (let index = 0; index < count; index += 1) {
    const currentOffset = actualOffset + index * typeSize;

    switch (type) {
      case 1:
      case 7:
        values.push(view.getUint8(currentOffset));
        break;
      case 2:
        if (totalSize <= 4) {
          return readInlineAscii(view, valueOffset, count);
        }
        return readAscii(view, actualOffset, count, isLittleEndian);
      case 3:
        values.push(view.getUint16(currentOffset, isLittleEndian));
        break;
      case 4:
        values.push(view.getUint32(currentOffset, isLittleEndian));
        break;
      case 5: {
        const numerator = view.getUint32(currentOffset, isLittleEndian);
        const denominator = view.getUint32(currentOffset + 4, isLittleEndian);
        values.push({
          numerator,
          denominator,
          value: denominator ? numerator / denominator : 0
        });
        break;
      }
      case 6:
        values.push(view.getInt8(currentOffset));
        break;
      case 8:
        values.push(view.getInt16(currentOffset, isLittleEndian));
        break;
      case 9:
        values.push(view.getInt32(currentOffset, isLittleEndian));
        break;
      case 10: {
        const numerator = view.getInt32(currentOffset, isLittleEndian);
        const denominator = view.getInt32(currentOffset + 4, isLittleEndian);
        values.push({
          numerator,
          denominator,
          value: denominator ? numerator / denominator : 0
        });
        break;
      }
      default:
        return null;
    }
  }

  if (values.length === 1) {
    return values[0];
  }

  return values;
}

function tagLabel(tagMap, tag) {
  return tagMap[tag] || `Tag 0x${tag.toString(16).padStart(4, "0").toUpperCase()}`;
}

function formatFraction(valueObject) {
  if (!valueObject || typeof valueObject !== "object") {
    return "";
  }
  const { numerator, denominator, value } = valueObject;
  if (!denominator) {
    return String(numerator);
  }
  if (value >= 1) {
    return `${value.toFixed(2)}`;
  }
  return `${numerator}/${denominator}`;
}

function humanizeValue(tagName, value) {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    if (tagName === "GPSLatitude" || tagName === "GPSLongitude") {
      const [deg, min, sec] = value;
      const parts = [deg, min, sec].map((item) => (item?.value ?? item));
      if (parts.some((item) => Number.isNaN(Number(item)))) {
        return "";
      }
      return `${parts[0].toFixed ? parts[0].toFixed(0) : parts[0]}° ${parts[1].toFixed ? parts[1].toFixed(0) : parts[1]}' ${Number(parts[2]).toFixed(2)}"`;
    }
    return value.map((item) => humanizeValue(tagName, item)).join(", ");
  }

  if (typeof value === "object") {
    if (tagName === "ExposureTime") {
      return value.value >= 1 ? `${value.value.toFixed(2)} s` : `${value.numerator}/${value.denominator} s`;
    }
    if (tagName === "FNumber") {
      return `f/${value.value.toFixed(1)}`;
    }
    if (tagName === "FocalLength") {
      return `${value.value.toFixed(2)} mm`;
    }
    if (tagName === "XResolution" || tagName === "YResolution") {
      return `${value.value.toFixed(2)} dpi`;
    }
    if (tagName === "GPSAltitude") {
      return `${value.value.toFixed(2)} m`;
    }
    return formatFraction(value);
  }

  if (tagName === "Orientation") {
    const map = {
      1: "Normal",
      3: "Rotated 180°",
      6: "Rotated 90° CW",
      8: "Rotated 90° CCW"
    };
    return map[value] || String(value);
  }

  if (tagName === "ResolutionUnit") {
    const map = { 2: "inch", 3: "cm" };
    return map[value] || String(value);
  }

  if (tagName === "WhiteBalance") {
    return value === 1 ? "Manual" : "Auto";
  }

  if (tagName === "Flash") {
    return value === 0 ? "Flash did not fire" : `Flash flag ${value}`;
  }

  return String(value);
}

function convertGpsCoordinate(coord, ref) {
  if (!Array.isArray(coord) || coord.length < 3) {
    return null;
  }

  const [deg, min, sec] = coord.map((item) => item?.value ?? Number(item));
  if ([deg, min, sec].some((item) => Number.isNaN(Number(item)))) {
    return null;
  }

  let decimal = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
  if (ref === "S" || ref === "W") {
    decimal *= -1;
  }
  return decimal;
}

function parseIfd(view, tiffStart, ifdOffset, isLittleEndian, tagMap, target) {
  if (!ifdOffset || tiffStart + ifdOffset + 2 > view.byteLength) {
    return;
  }

  const entries = view.getUint16(tiffStart + ifdOffset, isLittleEndian);
  const base = tiffStart + ifdOffset + 2;

  for (let index = 0; index < entries; index += 1) {
    const entryOffset = base + index * 12;
    if (entryOffset + 12 > view.byteLength) {
      continue;
    }

    const tag = view.getUint16(entryOffset, isLittleEndian);
    const type = view.getUint16(entryOffset + 2, isLittleEndian);
    const count = view.getUint32(entryOffset + 4, isLittleEndian);
    const value = readValue(view, tiffStart, type, count, entryOffset + 8, isLittleEndian);
    const name = tagLabel(tagMap, tag);

    target.raw[name] = value;
    target.entries.push({
      tag,
      name,
      value,
      displayValue: humanizeValue(name, value)
    });
  }
}

function parseTiff(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) {
    return null;
  }

  const byteOrder = String.fromCharCode(view.getUint8(tiffStart), view.getUint8(tiffStart + 1));
  const isLittleEndian = byteOrder === "II";
  if (!isLittleEndian && byteOrder !== "MM") {
    return null;
  }

  const fortyTwo = view.getUint16(tiffStart + 2, isLittleEndian);
  if (fortyTwo !== 42) {
    return null;
  }

  const ifd0Offset = view.getUint32(tiffStart + 4, isLittleEndian);
  const result = {
    entries: [],
    raw: {},
    hasExif: false,
    hasGps: false,
    gps: null
  };

  parseIfd(view, tiffStart, ifd0Offset, isLittleEndian, IFD0_TAGS, result);

  const exifPointer = result.raw.ExifIFDPointer;
  const gpsPointer = result.raw.GPSInfoIFDPointer;

  if (typeof exifPointer === "number") {
    parseIfd(view, tiffStart, exifPointer, isLittleEndian, EXIF_TAGS, result);
  }

  if (typeof gpsPointer === "number") {
    parseIfd(view, tiffStart, gpsPointer, isLittleEndian, GPS_TAGS, result);
  }

  result.hasExif = result.entries.length > 0;

  const lat = convertGpsCoordinate(result.raw.GPSLatitude, result.raw.GPSLatitudeRef);
  const lng = convertGpsCoordinate(result.raw.GPSLongitude, result.raw.GPSLongitudeRef);

  if (lat != null && lng != null) {
    result.hasGps = true;
    result.gps = {
      latitude: lat,
      longitude: lng
    };
    result.entries.push({
      tag: 0xffff,
      name: "GPSCoordinates",
      value: result.gps,
      displayValue: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    });
  }

  return result;
}

function parseJpegExif(buffer) {
  const view = new DataView(buffer);
  let offset = 2;

  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }

    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) {
      break;
    }

    const segmentLength = view.getUint16(offset + 2);
    if (!segmentLength || offset + 2 + segmentLength > view.byteLength) {
      break;
    }

    if (marker === 0xe1) {
      const exifHeaderBytes = safeSliceBytes(buffer, offset + 4, 6);
      if (exifHeaderBytes && bytesToString(exifHeaderBytes) === "Exif\u0000\u0000") {
        return parseTiff(view, offset + 10);
      }
    }

    offset += 2 + segmentLength;
  }

  return {
    entries: [],
    raw: {},
    hasExif: false,
    hasGps: false,
    gps: null
  };
}

function parsePngExif(buffer) {
  const view = new DataView(buffer);
  let offset = 8;

  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset);
    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const type = bytesToString(typeBytes);
    const dataStart = offset + 8;

    if (type === "eXIf") {
      return parseTiff(view, dataStart);
    }

    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }

  return {
    entries: [],
    raw: {},
    hasExif: false,
    hasGps: false,
    gps: null
  };
}

export async function analyzeImageFile(file) {
  const buffer = await file.arrayBuffer();
  const fileType = detectFileType(buffer, file.type || "");
  const basic = {
    fileType,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "",
    hasExif: false,
    hasGps: false,
    gps: null,
    entries: [],
    warning: null
  };

  if (fileType === "heic") {
    return {
      ...basic,
      supported: false,
      warning: "HEIC/HEIF support is not reliably available in this browser-based V1 yet."
    };
  }

  if (fileType === "jpeg") {
    const parsed = parseJpegExif(buffer);
    return {
      ...basic,
      supported: true,
      ...parsed
    };
  }

  if (fileType === "png") {
    const parsed = parsePngExif(buffer);
    return {
      ...basic,
      supported: true,
      ...parsed
    };
  }

  return {
    ...basic,
    supported: false,
    warning: "Unsupported file format. Please choose a JPG, JPEG or PNG image."
  };
}
