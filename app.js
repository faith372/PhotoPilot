const SETTINGS_STORAGE_KEY = "photopilot-ai-settings-v2";
const SCORING_THUMB_SIZE = 160;

const defaultEdit = {
  exposure: 0,
  contrast: 0,
  temperature: 0,
  saturation: 0,
  beauty: 12,
};

const state = {
  photos: [],
  selectedId: null,
  view: "select",
  minScore: 0,
  onlyFaces: false,
  onlyEdited: false,
  sort: "score-desc",
  previewMode: "after",
  isBusy: false,
  settings: loadSettings(),
};

const presets = {
  clean: {
    exposure: 18,
    contrast: -8,
    temperature: -8,
    saturation: 8,
    beauty: 18,
    label: "清透自然",
    notes: ["提升亮度和阴影，让画面更干净。", "轻微降低对比，保留自然肤色。", "美颜保持克制，避免塑料感。"],
  },
  film: {
    exposure: 6,
    contrast: 16,
    temperature: 22,
    saturation: -6,
    beauty: 10,
    label: "胶片暖调",
    notes: ["增加暖色和对比，形成柔和胶片感。", "降低饱和度，减少数码味。", "适合旅拍、人文和婚礼纪实。"],
  },
  studio: {
    exposure: 12,
    contrast: 8,
    temperature: 0,
    saturation: -4,
    beauty: 16,
    label: "干净棚拍",
    notes: ["提亮主体，控制饱和度。", "让背景更简洁，适合商品和证件感人像。", "保留真实质感，方便批量统一。"],
  },
  night: {
    exposure: 10,
    contrast: 22,
    temperature: -14,
    saturation: 12,
    beauty: 8,
    label: "夜景增强",
    notes: ["提高反差和色彩，让灯光更有层次。", "偏冷色温压住杂色。", "美颜较轻，避免夜景脸部发灰。"],
  },
};

const samplePhotos = [
  { name: "人像_清晨窗边.jpg", type: "portrait", seed: 11, scoreBias: 88 },
  { name: "旅拍_街角回头.jpg", type: "portrait", seed: 18, scoreBias: 76 },
  { name: "风景_湖面日落.jpg", type: "landscape", seed: 25, scoreBias: 91 },
  { name: "连拍_表情待定.jpg", type: "portrait", seed: 32, scoreBias: 62 },
  { name: "商品_白底香水.jpg", type: "product", seed: 39, scoreBias: 83 },
  { name: "夜景_霓虹人像.jpg", type: "portrait", seed: 46, scoreBias: 79 },
];

const els = {
  fileInput: document.querySelector("#fileInput"),
  importButton: document.querySelector("#importButton"),
  sampleButton: document.querySelector("#sampleButton"),
  runAiButton: document.querySelector("#runAiButton"),
  settingsButton: document.querySelector("#settingsButton"),
  gallery: document.querySelector("#gallery"),
  galleryHint: document.querySelector("#galleryHint"),
  sortSelect: document.querySelector("#sortSelect"),
  scoreFilter: document.querySelector("#scoreFilter"),
  scoreFilterValue: document.querySelector("#scoreFilterValue"),
  showOnlyFaces: document.querySelector("#showOnlyFaces"),
  showOnlyEdited: document.querySelector("#showOnlyEdited"),
  appMessage: document.querySelector("#appMessage"),
  providerSummary: document.querySelector("#providerSummary"),
  photoTitle: document.querySelector("#photoTitle"),
  photoMeta: document.querySelector("#photoMeta"),
  previewStage: document.querySelector("#previewStage"),
  previewImage: document.querySelector("#previewImage"),
  beforeButton: document.querySelector("#beforeButton"),
  afterButton: document.querySelector("#afterButton"),
  scoreValue: document.querySelector("#scoreValue"),
  scoreLabel: document.querySelector("#scoreLabel"),
  scoreReason: document.querySelector("#scoreReason"),
  aiNotes: document.querySelector("#aiNotes"),
  copyBestButton: document.querySelector("#copyBestButton"),
  resetEditsButton: document.querySelector("#resetEditsButton"),
  promptInput: document.querySelector("#promptInput"),
  promptButton: document.querySelector("#promptButton"),
  batchVisibleButton: document.querySelector("#batchVisibleButton"),
  batchKeepButton: document.querySelector("#batchKeepButton"),
  exportImageButton: document.querySelector("#exportImageButton"),
  exportKeepButton: document.querySelector("#exportKeepButton"),
  exportRecipeButton: document.querySelector("#exportRecipeButton"),
  exportSummary: document.querySelector("#exportSummary"),
  statTotal: document.querySelector("#statTotal"),
  statAverage: document.querySelector("#statAverage"),
  statRecommended: document.querySelector("#statRecommended"),
  statEdited: document.querySelector("#statEdited"),
  countKeep: document.querySelector("#countKeep"),
  countMaybe: document.querySelector("#countMaybe"),
  countReject: document.querySelector("#countReject"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  cancelSettingsButton: document.querySelector("#cancelSettingsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  aiMode: document.querySelector("#aiMode"),
  providerSelect: document.querySelector("#providerSelect"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  uploadConsent: document.querySelector("#uploadConsent"),
};

const localPixelProvider = {
  id: "local-pixel",
  label: "本地像素评分",
  async scoreBatch(photos) {
    const scored = [];
    for (const photo of photos) {
      const analysis = await scorePhotoLocally(photo);
      scored.push(analysis);
    }
    return scored;
  },
};

const cloudVisionProvider = {
  id: "cloud-llm",
  label: "大模型复核评分",
  async scoreBatch(photos) {
    if (!state.settings.apiKey || !state.settings.uploadConsent) {
      throw new Error("云端评分需要填写 API Key 并确认上传缩略图授权。当前未上传照片。");
    }

    const localScores = photos.map((photo) => photo.analysis ?? fallbackAnalyzePhoto(photo));
    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: state.settings,
        photos: photos.map((photo, index) => ({
          id: photo.id,
          name: photo.name,
          type: photo.type,
          imageDataUrl: photo.thumbnailDataUrl,
          localScore: localScores[index],
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message ?? "云端评分请求失败。");
    }

    const data = await response.json();
    const byId = new Map((data.results ?? []).map((item) => [item.id, item]));
    return photos.map((photo, index) => mergeCloudScore(localScores[index], byId.get(photo.id), photo));
  },
};

const localRetouchProvider = {
  id: "local-rules",
  label: "本地提示词规则",
  async createPlan({ prompt }) {
    return planFromPrompt(prompt);
  },
};

const cloudRetouchProvider = {
  id: "cloud-retouch",
  label: "大模型修图方案",
  async createPlan({ photo, prompt }) {
    ensureCloudReady("云端修图方案需要填写 API Key 并确认上传缩略图授权。当前未上传照片。");

    const response = await fetch("/api/retouch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: state.settings,
        photo: {
          id: photo.id,
          name: photo.name,
          type: photo.type,
          imageDataUrl: photo.thumbnailDataUrl,
          score: photo.score,
          status: photo.status,
          analysis: photo.analysis,
          currentEdit: photo.edit,
        },
        prompt,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message ?? "云端修图方案请求失败。");
    }

    const data = await response.json();
    return normalizeEditPlan(data.plan, planFromPrompt(prompt));
  },
};

function loadSettings() {
  const defaults = {
    aiMode: "local",
    provider: "local-pixel",
    apiKey: "",
    uploadConsent: false,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");
    return {
      ...defaults,
      aiMode: saved.aiMode === "cloud" ? "cloud" : "local",
      provider: normalizeProvider(saved.provider),
      uploadConsent: Boolean(saved.uploadConsent),
    };
  } catch {
    return defaults;
  }
}

function normalizeProvider(provider) {
  const supported = ["local-pixel", "openai", "deepseek", "claude", "kimi", "openai-compatible"];
  return supported.includes(provider) ? provider : "local-pixel";
}

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        aiMode: state.settings.aiMode,
        provider: state.settings.provider,
        uploadConsent: state.settings.uploadConsent,
      }),
    );
  } catch {
    // Local storage can be unavailable in private browsing; the current session still works.
  }
}

function cloneEdit(edit = defaultEdit) {
  return { ...edit };
}

function stableNoise(seed, offset) {
  const x = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function fallbackAnalyzePhoto(input) {
  const seed = input.seed ?? input.name.length + (input.size ?? 0) % 97;
  const base = input.scoreBias ?? 58 + Math.round(stableNoise(seed, 1) * 35);
  const sharpness = clamp(base + Math.round((stableNoise(seed, 2) - 0.5) * 22), 0, 100);
  const exposure = clamp(base + Math.round((stableNoise(seed, 3) - 0.5) * 20), 0, 100);
  const composition = clamp(base + Math.round((stableNoise(seed, 4) - 0.5) * 24), 0, 100);
  const color = clamp(base + Math.round((stableNoise(seed, 5) - 0.5) * 18), 0, 100);
  const expression = input.type === "portrait" ? clamp(base + Math.round((stableNoise(seed, 6) - 0.5) * 28), 0, 100) : null;
  const dynamicRange = clamp(base + Math.round((stableNoise(seed, 8) - 0.5) * 16), 0, 100);
  const duplicate = stableNoise(seed, 7) > 0.78 ? 45 : 8;
  const finalScore = clamp(
    Math.round(
      sharpness * 0.22 +
        exposure * 0.18 +
        composition * 0.2 +
        color * 0.14 +
        dynamicRange * 0.11 +
        (expression ?? base) * 0.1 -
        duplicate * 0.05,
    ),
    0,
    100,
  );

  return finalizeAnalysis({
    finalScore,
    sharpness,
    exposure,
    composition,
    color,
    expression,
    dynamicRange,
    duplicate,
    confidence: 0.42,
    source: "模拟评分",
    notes: buildScoreNotes({ sharpness, exposure, composition, color, expression, dynamicRange, duplicate }),
  });
}

async function scorePhotoLocally(photo) {
  try {
    const image = await loadImage(photo.src);
    const sample = sampleImage(image, SCORING_THUMB_SIZE);
    photo.thumbnailDataUrl = sample.thumbnailDataUrl;
    const metrics = extractImageMetrics(sample);
    const duplicate = computeDuplicateRisk(photo, metrics.hash);
    photo.hash = metrics.hash;

    const typeBoost = photo.type === "product" ? 4 : photo.type === "landscape" ? 2 : 0;
    const expression = photo.type === "portrait" ? clamp(Math.round(metrics.composition * 0.55 + metrics.exposure * 0.25 + metrics.sharpness * 0.2), 0, 100) : null;
    const rawScore = clamp(
      Math.round(
        metrics.sharpness * 0.24 +
          metrics.exposure * 0.18 +
          metrics.composition * 0.2 +
          metrics.color * 0.15 +
          metrics.dynamicRange * 0.12 +
          metrics.contrast * 0.08 +
          (expression ?? metrics.composition) * 0.06 -
          duplicate * 0.08 +
          typeBoost,
      ),
      0,
      100,
    );
    const finalScore = photo.isSample && photo.scoreBias ? clamp(Math.round(rawScore * 0.25 + photo.scoreBias * 0.75), 0, 100) : rawScore;

    return finalizeAnalysis({
      finalScore,
      sharpness: metrics.sharpness,
      exposure: metrics.exposure,
      composition: metrics.composition,
      color: metrics.color,
      expression,
      dynamicRange: metrics.dynamicRange,
      contrast: metrics.contrast,
      duplicate,
      confidence: 0.78,
      source: "本地像素评分",
      notes: [
        ...(photo.isSample && photo.scoreBias ? ["示例照片已按预设难度校准，方便体验精选/待定/淘汰流程。"] : []),
        ...buildScoreNotes({ ...metrics, expression, duplicate }),
      ],
    });
  } catch {
    return fallbackAnalyzePhoto(photo);
  }
}

function sampleImage(image, maxSize) {
  const ratio = image.naturalWidth / image.naturalHeight;
  const width = ratio >= 1 ? maxSize : Math.max(1, Math.round(maxSize * ratio));
  const height = ratio >= 1 ? Math.max(1, Math.round(maxSize / ratio)) : maxSize;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);

  return {
    width,
    height,
    imageData: ctx.getImageData(0, 0, width, height),
    thumbnailDataUrl: canvas.toDataURL("image/jpeg", 0.74),
  };
}

function extractImageMetrics(sample) {
  const { data } = sample.imageData;
  const total = sample.width * sample.height;
  const luminance = new Float32Array(total);
  let sumL = 0;
  let sumS = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let clippedDark = 0;
  let clippedBright = 0;
  const histogram = new Array(256).fill(0);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const s = max === 0 ? 0 : (max - min) / max;
    luminance[p] = l;
    histogram[Math.round(l)] += 1;
    sumL += l;
    sumS += s;
    sumR += r;
    sumG += g;
    sumB += b;
    if (l < 8) clippedDark += 1;
    if (l > 247) clippedBright += 1;
  }

  const meanL = sumL / total;
  let variance = 0;
  let edgeEnergy = 0;
  let edgeCount = 0;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;

  for (let y = 1; y < sample.height - 1; y += 1) {
    for (let x = 1; x < sample.width - 1; x += 1) {
      const index = y * sample.width + x;
      const center = luminance[index];
      variance += (center - meanL) ** 2;
      const gx = luminance[index + 1] - luminance[index - 1];
      const gy = luminance[index + sample.width] - luminance[index - sample.width];
      const edge = Math.sqrt(gx * gx + gy * gy);
      edgeEnergy += edge;
      edgeCount += 1;
      const weight = Math.max(0, edge - 6);
      weightedX += x * weight;
      weightedY += y * weight;
      totalWeight += weight;
    }
  }

  variance /= Math.max(1, edgeCount);
  const stdDev = Math.sqrt(variance);
  const p5 = percentileFromHistogram(histogram, total, 0.05);
  const p95 = percentileFromHistogram(histogram, total, 0.95);
  const dynamicRangeRaw = p95 - p5;
  const avgSaturation = sumS / total;
  const avgR = sumR / total;
  const avgG = sumG / total;
  const avgB = sumB / total;
  const colorCast = Math.max(Math.abs(avgR - avgG), Math.abs(avgB - avgG), Math.abs(avgR - avgB));
  const clippedRatio = (clippedDark + clippedBright) / total;
  const edgeMean = edgeEnergy / Math.max(1, edgeCount);
  const centerX = totalWeight ? weightedX / totalWeight / sample.width : 0.5;
  const centerY = totalWeight ? weightedY / totalWeight / sample.height : 0.5;
  const thirdDistance = Math.min(...[1 / 3, 2 / 3].flatMap((x) => [1 / 3, 2 / 3].map((y) => Math.hypot(centerX - x, centerY - y))));
  const centerDistance = Math.hypot(centerX - 0.5, centerY - 0.5);
  const balance = clamp(100 - centerDistance * 145, 0, 100);
  const thirds = clamp(100 - thirdDistance * 165, 0, 100);
  const hash = buildPerceptualHash(luminance, sample.width, sample.height);

  return {
    sharpness: clamp(Math.round(edgeMean * 3.6), 0, 100),
    exposure: clamp(Math.round(100 - Math.abs(meanL - 132) * 0.78 - clippedRatio * 165), 0, 100),
    dynamicRange: clamp(Math.round(dynamicRangeRaw * 0.58), 0, 100),
    contrast: clamp(Math.round(stdDev * 2.25), 0, 100),
    color: clamp(Math.round(72 + avgSaturation * 72 - colorCast * 0.42 - clippedRatio * 80), 0, 100),
    composition: clamp(Math.round(balance * 0.48 + thirds * 0.42 + Math.min(100, edgeMean * 2.6) * 0.1), 0, 100),
    hash,
  };
}

function percentileFromHistogram(histogram, total, percentile) {
  const target = total * percentile;
  let count = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    count += histogram[i];
    if (count >= target) return i;
  }
  return 255;
}

function buildPerceptualHash(luminance, width, height) {
  const grid = 8;
  const values = [];
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const startX = Math.floor((gx / grid) * width);
      const endX = Math.max(startX + 1, Math.floor(((gx + 1) / grid) * width));
      const startY = Math.floor((gy / grid) * height);
      const endY = Math.max(startY + 1, Math.floor(((gy + 1) / grid) * height));
      let sum = 0;
      let count = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          sum += luminance[y * width + x];
          count += 1;
        }
      }
      values.push(sum / count);
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return values.map((value) => (value >= median ? "1" : "0")).join("");
}

function computeDuplicateRisk(photo, hash) {
  let minDistance = 64;
  state.photos.forEach((other) => {
    if (other.id === photo.id || !other.hash) return;
    minDistance = Math.min(minDistance, hammingDistance(hash, other.hash));
  });

  if (minDistance <= 5) return 88;
  if (minDistance <= 10) return 64;
  if (minDistance <= 16) return 36;
  return 6;
}

function hammingDistance(a, b) {
  let distance = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance + Math.abs(a.length - b.length);
}

function finalizeAnalysis(analysis) {
  const status = analysis.finalScore >= 82 ? "keep" : analysis.finalScore >= 66 ? "maybe" : "reject";
  return {
    ...analysis,
    finalScore: clamp(Math.round(analysis.finalScore), 0, 100),
    status,
    notes: analysis.notes?.length ? analysis.notes.slice(0, 5) : buildScoreNotes(analysis),
  };
}

function buildScoreNotes(metrics) {
  const notes = [];
  if (metrics.sharpness >= 78) notes.push("主体边缘清晰，技术质量较稳。");
  if (metrics.exposure >= 76) notes.push("曝光分布健康，高光和暗部保留较好。");
  if (metrics.dynamicRange >= 70) notes.push("动态范围较好，后期调整空间充足。");
  if (metrics.composition >= 76) notes.push("主体位置和画面重心比较舒服。");
  if (metrics.color >= 76) notes.push("色彩干净，适合继续套用风格。");
  if (metrics.sharpness < 55) notes.push("清晰度偏弱，可能存在虚焦或运动模糊。");
  if (metrics.exposure < 55) notes.push("曝光不够稳定，建议检查过曝或欠曝区域。");
  if (metrics.composition < 55) notes.push("画面重心略散，裁剪后可能更稳。");
  if (metrics.color < 55) notes.push("色彩质量偏弱，可能有偏色或饱和度问题。");
  if (metrics.duplicate >= 60) notes.push("疑似与同组照片重复，建议对比后只保留一张。");
  return notes.slice(0, 5);
}

function mergeCloudScore(local, cloud, photo) {
  if (!cloud) return local;
  const finalScore = clamp(Math.round(Number(cloud.finalScore ?? local.finalScore)), 0, 100);
  return finalizeAnalysis({
    ...local,
    finalScore,
    sharpness: normalizeMetric(cloud.metrics?.sharpness, local.sharpness),
    exposure: normalizeMetric(cloud.metrics?.exposure, local.exposure),
    composition: normalizeMetric(cloud.metrics?.composition, local.composition),
    color: normalizeMetric(cloud.metrics?.color, local.color),
    expression: normalizeMetric(cloud.metrics?.expression, local.expression),
    dynamicRange: normalizeMetric(cloud.metrics?.dynamicRange, local.dynamicRange),
    duplicate: normalizeMetric(cloud.metrics?.duplicate, local.duplicate),
    confidence: normalizeMetric(cloud.confidence, 0.84),
    source: `${providerLabel(state.settings.provider)} + 本地指标`,
    notes: Array.isArray(cloud.notes) && cloud.notes.length ? cloud.notes : [`大模型已复核 ${photo.name}。`, ...local.notes],
  });
}

function normalizeMetric(value, fallback) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback ?? null;
  return clamp(Math.round(Number(value)), 0, 100);
}

function createSamplePhoto(sample, index) {
  const analysis = fallbackAnalyzePhoto(sample);
  return {
    id: `sample-${index}-${Date.now()}`,
    name: sample.name,
    type: sample.type,
    seed: sample.seed,
    size: 960 * 640,
    scoreBias: sample.scoreBias,
    src: createSampleImage(sample),
    file: null,
    score: analysis.finalScore,
    analysis,
    status: analysis.status,
    edit: cloneEdit(),
    aiPlan: presets.clean,
    isSample: true,
    hash: null,
    thumbnailDataUrl: null,
  };
}

function createFilePhoto(file, index) {
  const type = inferPhotoType(file.name);
  const input = {
    name: file.name,
    size: file.size,
    type,
    seed: file.name.length + index * 7 + Math.round(file.size / 1024),
  };
  const analysis = fallbackAnalyzePhoto(input);

  return {
    id: `file-${index}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    type,
    seed: input.seed,
    size: file.size,
    src: URL.createObjectURL(file),
    file,
    score: analysis.finalScore,
    analysis,
    status: analysis.status,
    edit: cloneEdit(),
    aiPlan: presets.clean,
    isSample: false,
    hash: null,
    thumbnailDataUrl: null,
  };
}

function createSampleImage(sample) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  const palette = samplePalette(sample.type, sample.seed);

  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, palette.a);
  bg.addColorStop(0.54, palette.b);
  bg.addColorStop(1, palette.c);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLightFalloff(ctx, canvas.width, canvas.height);
  if (sample.type === "landscape") drawLandscape(ctx);
  if (sample.type === "product") drawProduct(ctx, palette);
  if (sample.type === "portrait") drawPortrait(ctx, palette, sample.name.includes("夜景"));
  drawFilmGrain(ctx, sample.seed);
  return canvas.toDataURL("image/png", 0.88);
}

function samplePalette(type, seed) {
  if (type === "landscape") return { a: "#7da3bf", b: "#f0b76a", c: "#334d63", ink: "#263c44", skin: "#f1c6a0" };
  if (type === "product") return { a: "#fbfaf5", b: "#dcece7", c: "#91a6b3", ink: "#38484d", skin: "#f2d4ba" };
  if (seed === 46) return { a: "#263757", b: "#b84070", c: "#39a6a1", ink: "#1d2434", skin: "#f0b08d" };
  if (seed === 18) return { a: "#d1ddd5", b: "#ca7b5f", c: "#273b42", ink: "#293537", skin: "#e8b98f" };
  return { a: "#d9eee8", b: "#f4dfc5", c: "#63857e", ink: "#2f3d3a", skin: "#efc19b" };
}

function drawLightFalloff(ctx, width, height) {
  const glow = ctx.createRadialGradient(width * 0.36, height * 0.28, 30, width * 0.36, height * 0.28, width * 0.72);
  glow.addColorStop(0, "rgba(255,255,255,0.5)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const shade = ctx.createLinearGradient(0, height * 0.2, 0, height);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.24)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

function drawPortrait(ctx, palette, night) {
  ctx.save();
  ctx.translate(480, 332);

  ctx.fillStyle = night ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.28)";
  roundRect(ctx, -300, -210, 600, 420, 28);
  ctx.fill();

  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.ellipse(0, 120, 160, 190, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.ellipse(0, -70, 104, 126, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(0, -115, 105, Math.PI * 0.98, Math.PI * 2.04);
  ctx.quadraticCurveTo(98, -60, 74, 0);
  ctx.quadraticCurveTo(28, -35, -14, -22);
  ctx.quadraticCurveTo(-82, -14, -94, -72);
  ctx.fill();

  ctx.fillStyle = "rgba(49, 45, 44, 0.88)";
  ctx.beginPath();
  ctx.ellipse(-38, -64, 9, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(38, -64, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(110, 55, 48, 0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, -22, 30, 0.12, Math.PI - 0.12);
  ctx.stroke();

  ctx.fillStyle = night ? "rgba(58, 166, 161, 0.36)" : "rgba(47, 123, 115, 0.28)";
  ctx.beginPath();
  ctx.ellipse(-112, 36, 42, 74, -0.2, 0, Math.PI * 2);
  ctx.ellipse(112, 36, 42, 74, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawLandscape(ctx) {
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.arc(710, 146, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(38, 60, 68, 0.62)";
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.lineTo(210, 220);
  ctx.lineTo(380, 390);
  ctx.lineTo(560, 190);
  ctx.lineTo(960, 430);
  ctx.lineTo(960, 640);
  ctx.lineTo(0, 640);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.moveTo(210, 220);
  ctx.lineTo(278, 288);
  ctx.lineTo(178, 288);
  ctx.closePath();
  ctx.moveTo(560, 190);
  ctx.lineTo(642, 238);
  ctx.lineTo(504, 254);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(42, 74, 82, 0.55)";
  ctx.fillRect(0, 464, 960, 176);
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = 3;
  for (let y = 492; y < 618; y += 32) {
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.bezierCurveTo(260, y - 18, 420, y + 18, 620, y);
    ctx.bezierCurveTo(720, y + 9, 820, y - 8, 910, y + 4);
    ctx.stroke();
  }
}

function drawProduct(ctx, palette) {
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  roundRect(ctx, 210, 130, 540, 390, 22);
  ctx.fill();

  ctx.fillStyle = "rgba(44, 57, 62, 0.12)";
  ctx.beginPath();
  ctx.ellipse(480, 486, 190, 38, 0, 0, Math.PI * 2);
  ctx.fill();

  const bottle = ctx.createLinearGradient(360, 160, 600, 500);
  bottle.addColorStop(0, "rgba(255,255,255,0.86)");
  bottle.addColorStop(0.45, "rgba(159, 199, 196, 0.82)");
  bottle.addColorStop(1, "rgba(71, 99, 111, 0.74)");
  ctx.fillStyle = bottle;
  roundRect(ctx, 370, 210, 220, 270, 34);
  ctx.fill();

  ctx.fillStyle = palette.ink;
  roundRect(ctx, 420, 154, 120, 64, 10);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  roundRect(ctx, 420, 314, 120, 74, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(47, 123, 115, 0.76)";
  ctx.fillRect(444, 342, 72, 8);
  ctx.fillRect(456, 362, 48, 6);
}

function drawFilmGrain(ctx, seed) {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 20) {
    const noise = (stableNoise(seed, i) - 0.5) * 10;
    data[i] = clamp(data[i] + noise, 0, 255);
    data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
    data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function inferPhotoType(name) {
  const lower = name.toLowerCase();
  if (lower.includes("product") || lower.includes("商品") || lower.includes("sku")) return "product";
  if (lower.includes("landscape") || lower.includes("风景") || lower.includes("view")) return "landscape";
  return "portrait";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function selectedPhoto() {
  return state.photos.find((photo) => photo.id === state.selectedId) ?? null;
}

function filteredPhotos() {
  const statusMap = {
    select: "keep",
    maybe: "maybe",
    reject: "reject",
  };

  let list = state.photos.filter((photo) => {
    if (photo.score < state.minScore) return false;
    if (state.onlyFaces && photo.type !== "portrait") return false;
    if (state.onlyEdited && !isEdited(photo)) return false;
    if (state.view && statusMap[state.view] && photo.status !== statusMap[state.view]) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    if (state.sort === "score-asc") return a.score - b.score;
    if (state.sort === "name-asc") return a.name.localeCompare(b.name, "zh-CN");
    if (state.sort === "edited") return Number(isEdited(b)) - Number(isEdited(a)) || b.score - a.score;
    return b.score - a.score;
  });

  return list;
}

function isEdited(photo) {
  return Object.entries(defaultEdit).some(([key, value]) => photo.edit[key] !== value);
}

function render() {
  renderStats();
  renderProviderSummary();
  renderGallery();
  renderSelectedPhoto();
}

function renderStats() {
  const total = state.photos.length;
  const avg = total ? Math.round(state.photos.reduce((sum, photo) => sum + photo.score, 0) / total) : 0;
  const keep = state.photos.filter((photo) => photo.status === "keep").length;
  const maybe = state.photos.filter((photo) => photo.status === "maybe").length;
  const reject = state.photos.filter((photo) => photo.status === "reject").length;
  const edited = state.photos.filter(isEdited).length;

  els.statTotal.textContent = total;
  els.statAverage.textContent = avg;
  els.statRecommended.textContent = keep;
  els.statEdited.textContent = edited;
  els.countKeep.textContent = keep;
  els.countMaybe.textContent = maybe;
  els.countReject.textContent = reject;
  els.galleryHint.textContent = total ? `正在查看 ${filteredPhotos().length} / ${total} 张。` : "导入照片或载入示例开始。";
}

function renderProviderSummary() {
  if (state.settings.aiMode === "local") {
    els.providerSummary.textContent = "当前使用本地像素评分，不上传照片。";
    return;
  }

  if (!state.settings.apiKey || !state.settings.uploadConsent) {
    els.providerSummary.textContent = "云端 AI 未完成授权，仍使用本地评分。";
    return;
  }

  els.providerSummary.textContent = `云端 AI 已配置：${providerLabel(state.settings.provider)}。`;
}

function renderGallery() {
  const list = filteredPhotos();
  els.gallery.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>没有符合条件的照片</strong><span>放宽分数或切换左侧分类看看。</span>";
    els.gallery.append(empty);
    return;
  }

  list.forEach((photo) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `photo-card ${photo.id === state.selectedId ? "active" : ""}`;
    card.dataset.id = photo.id;
    card.innerHTML = `
      <span class="status-pill">${statusLabel(photo.status)}</span>
      <img src="${photo.src}" alt="${escapeHtml(photo.name)}">
      <span class="photo-card-meta">
        <span class="photo-card-name">${escapeHtml(photo.name)}</span>
        <span class="score-pill">${photo.score}</span>
        <span class="photo-card-sub">${typeLabel(photo.type)} / ${isEdited(photo) ? "已编辑" : "未编辑"} / ${escapeHtml(photo.analysis.source ?? "评分")}</span>
      </span>
    `;
    card.addEventListener("click", () => {
      state.selectedId = photo.id;
      render();
    });
    els.gallery.append(card);
  });
}

function renderSelectedPhoto() {
  const photo = selectedPhoto();
  if (!photo) {
    els.photoTitle.textContent = "未选择照片";
    els.photoMeta.textContent = "选择一张照片查看评分和编辑效果。";
    els.previewStage.className = "preview-stage empty";
    els.previewImage.removeAttribute("src");
    els.previewImage.style.filter = "";
    els.scoreValue.textContent = "--";
    els.scoreLabel.textContent = "AI 评分";
    els.scoreReason.textContent = "导入照片后会显示推荐原因。";
    els.aiNotes.innerHTML = "";
    syncControls(defaultEdit);
    return;
  }

  els.photoTitle.textContent = photo.name;
  els.photoMeta.textContent = `${typeLabel(photo.type)} / ${statusLabel(photo.status)} / ${isEdited(photo) ? "已编辑" : "未编辑"} / ${photo.analysis.source ?? "评分"}`;
  els.previewStage.className = "preview-stage has-photo";
  els.previewImage.src = photo.src;
  els.previewImage.style.filter = state.previewMode === "after" ? filterFromEdit(photo.edit) : "";
  els.scoreValue.textContent = photo.score;
  els.scoreLabel.textContent = scoreTitle(photo.score);
  els.scoreReason.textContent = scoreReason(photo);
  els.aiNotes.innerHTML = [
    metricLine(photo.analysis),
    ...photo.analysis.notes,
  ]
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
  syncControls(photo.edit);
}

function metricLine(analysis) {
  return `指标：清晰 ${analysis.sharpness ?? "--"} / 曝光 ${analysis.exposure ?? "--"} / 构图 ${analysis.composition ?? "--"} / 色彩 ${analysis.color ?? "--"} / 动态 ${analysis.dynamicRange ?? "--"}`;
}

function filterFromEdit(edit) {
  const brightness = 1 + edit.exposure / 160;
  const contrast = 1 + edit.contrast / 140;
  const saturate = 1 + edit.saturation / 120;
  const warm = edit.temperature / 100;
  const beauty = edit.beauty / 280;
  const sepia = Math.max(0, warm) * 0.16;
  const hue = warm < 0 ? warm * 8 : warm * 3;
  return `brightness(${brightness + beauty}) contrast(${contrast}) saturate(${saturate}) sepia(${sepia}) hue-rotate(${hue}deg)`;
}

function syncControls(edit) {
  document.querySelectorAll("[data-edit]").forEach((input) => {
    input.value = edit[input.dataset.edit] ?? 0;
  });
  document.querySelectorAll("[data-edit-value]").forEach((value) => {
    value.textContent = edit[value.dataset.editValue] ?? 0;
  });
}

function statusLabel(status) {
  return {
    keep: "保留",
    maybe: "待定",
    reject: "淘汰",
  }[status] ?? status;
}

function typeLabel(type) {
  return {
    portrait: "人像",
    landscape: "风景",
    product: "商品",
  }[type] ?? "照片";
}

function providerLabel(provider) {
  return {
    "local-pixel": "本地像素评分",
    openai: "ChatGPT / OpenAI",
    deepseek: "DeepSeek",
    claude: "Claude",
    kimi: "Kimi",
    "openai-compatible": "OpenAI 兼容接口",
  }[provider] ?? provider;
}

function scoreTitle(score) {
  if (score >= 88) return "强烈推荐";
  if (score >= 78) return "值得保留";
  if (score >= 66) return "需要对比";
  return "建议淘汰";
}

function scoreReason(photo) {
  if (photo.score >= 82) return "系统判断这张照片技术质量和观感都比较稳定，适合作为精选。";
  if (photo.score >= 66) return "照片有可用价值，但建议和同组照片对比后再决定。";
  return "照片存在清晰度、曝光、构图或重复风险问题，除非内容很重要，否则可以淘汰。";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectFirstVisible() {
  const first = filteredPhotos()[0];
  state.selectedId = first?.id ?? state.photos[0]?.id ?? null;
}

function applyPreset(key) {
  const photo = selectedPhoto();
  const preset = presets[key];
  if (!photo || !preset) return;
  photo.edit = pickEdit(preset);
  photo.aiPlan = preset;
  photo.analysis.notes = [...preset.notes];
  state.previewMode = "after";
  setPreviewModeButtons();
  announce(`已应用「${preset.label}」。`);
  render();
}

function planFromPrompt(prompt) {
  const text = prompt.trim().toLowerCase();
  const edit = cloneEdit();
  const notes = [];

  if (!text) return null;
  if (containsAny(text, ["清透", "日系", "通透", "clean", "bright"])) {
    Object.assign(edit, pickEdit(presets.clean));
    notes.push("按清透方向提高亮度、降低硬对比，让画面更轻。");
  }
  if (containsAny(text, ["胶片", "复古", "暖", "film", "warm"])) {
    Object.assign(edit, pickEdit(presets.film));
    notes.push("增加暖色和中等对比，模拟温和胶片观感。");
  }
  if (containsAny(text, ["夜景", "霓虹", "暗部", "night"])) {
    Object.assign(edit, pickEdit(presets.night));
    notes.push("增强夜景反差和色彩，同时控制偏色。");
  }
  if (containsAny(text, ["商品", "白底", "棚拍", "干净", "product"])) {
    Object.assign(edit, pickEdit(presets.studio));
    notes.push("压低杂色并提亮主体，适合干净交付。");
  }
  if (containsAny(text, ["自然", "不要太假", "别太假", "保留纹理"])) {
    edit.beauty = Math.min(edit.beauty, 16);
    edit.contrast = Math.min(edit.contrast, 10);
    notes.push("美颜强度已收敛，优先保留皮肤纹理。");
  }
  if (containsAny(text, ["皮肤", "美颜", "磨皮", "肤色"])) {
    edit.beauty = containsAny(text, ["轻", "自然"]) ? 18 : 28;
    notes.push("面部处理以提亮和轻微肤色均匀为主。");
  }
  if (containsAny(text, ["冷", "蓝", "cool"])) {
    edit.temperature = clamp(edit.temperature - 18, -100, 100);
    notes.push("降低色温，让背景更冷静。");
  }
  if (containsAny(text, ["白", "亮", "提亮"])) {
    edit.exposure = clamp(edit.exposure + 14, -100, 100);
    notes.push("提高曝光，但保留高光层次。");
  }
  if (containsAny(text, ["高级", "质感", "克制"])) {
    edit.contrast = clamp(edit.contrast + 8, -100, 100);
    edit.saturation = clamp(edit.saturation - 8, -100, 100);
    notes.push("减少艳丽感，增加一点质感对比。");
  }

  if (!notes.length) {
    Object.assign(edit, pickEdit(presets.clean));
    notes.push("已按通用自然修图方案生成，适合大多数人像和生活照片。");
  }

  return {
    ...edit,
    label: "自定义 AI 方案",
    notes: notes.slice(0, 4),
  };
}

function normalizeEditPlan(plan, fallback = null) {
  const base = fallback ?? {
    ...defaultEdit,
    label: "AI 修图方案",
    notes: ["已按当前照片和提示词生成可编辑参数。"],
  };

  return {
    exposure: normalizeEditValue(plan?.exposure, base.exposure, -100, 100),
    contrast: normalizeEditValue(plan?.contrast, base.contrast, -100, 100),
    temperature: normalizeEditValue(plan?.temperature, base.temperature, -100, 100),
    saturation: normalizeEditValue(plan?.saturation, base.saturation, -100, 100),
    beauty: normalizeEditValue(plan?.beauty, base.beauty, 0, 100),
    label: String(plan?.label || base.label || "AI 修图方案").slice(0, 32),
    notes: normalizePlanNotes(plan?.notes, base.notes),
  };
}

function normalizeEditValue(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(Math.round(number), min, max);
}

function normalizePlanNotes(notes, fallback = []) {
  const normalized = Array.isArray(notes) ? notes.map((note) => String(note).trim()).filter(Boolean) : [];
  return (normalized.length ? normalized : fallback).slice(0, 4);
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function pickEdit(source) {
  return {
    exposure: source.exposure,
    contrast: source.contrast,
    temperature: source.temperature,
    saturation: source.saturation,
    beauty: source.beauty,
  };
}

async function importFiles(files) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    announce("没有找到可导入的图片文件。");
    return;
  }

  revokeObjectUrls();
  state.photos = imageFiles.map(createFilePhoto);
  state.view = "select";
  setActiveViewButton("select");
  selectFirstVisible();
  render();
  await rerunLocalScoring(`已导入 ${imageFiles.length} 张照片，并完成本地图像评分。`);
}

function revokeObjectUrls() {
  state.photos.forEach((photo) => {
    if (!photo.isSample && photo.src) URL.revokeObjectURL(photo.src);
  });
}

function setActiveViewButton(view) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function currentVisionProvider() {
  if (state.settings.aiMode === "cloud" && state.settings.provider !== "local-pixel") {
    return cloudVisionProvider;
  }
  return localPixelProvider;
}

function currentRetouchProvider() {
  if (state.settings.aiMode === "cloud" && state.settings.provider !== "local-pixel") {
    return cloudRetouchProvider;
  }
  return localRetouchProvider;
}

function ensureCloudReady(message) {
  if (!state.settings.apiKey || !state.settings.uploadConsent) {
    throw new Error(message);
  }
}

async function ensurePhotoThumbnail(photo) {
  if (photo.thumbnailDataUrl) return;
  const analysis = await scorePhotoLocally(photo);
  photo.thumbnailDataUrl = photo.thumbnailDataUrl || null;
  photo.hash = photo.hash || null;
  photo.analysis = analysis;
  photo.score = analysis.finalScore;
  photo.status = analysis.status;
}

async function rerunLocalScoring(message = "已完成本地图像评分。") {
  if (!state.photos.length) return;
  setBusy(true);
  try {
    const scores = await localPixelProvider.scoreBatch(state.photos);
    applyScores(scores);
    selectFirstVisible();
    announce(message);
  } finally {
    setBusy(false);
    render();
  }
}

async function rerunAiScoring() {
  if (!state.photos.length) {
    announce("请先导入照片或载入示例。");
    return;
  }

  setBusy(true);
  const provider = currentVisionProvider();

  try {
    const scores = await provider.scoreBatch(state.photos);
    applyScores(scores);
    selectFirstVisible();
    announce(`已使用${provider.label}完成 ${state.photos.length} 张评分。`);
  } catch (error) {
    announce(error.message);
  } finally {
    setBusy(false);
    render();
  }
}

function applyScores(scores) {
  state.photos = state.photos.map((photo, index) => ({
    ...photo,
    score: scores[index].finalScore,
    status: scores[index].status,
    analysis: scores[index],
  }));
}

function applyEditToBatch(target) {
  const source = selectedPhoto();
  if (!source) {
    announce("请先选择一张照片。");
    return;
  }

  const targets = target === "keep" ? state.photos.filter((photo) => photo.status === "keep") : filteredPhotos();
  const sourceEdit = cloneEdit(source.edit);
  let count = 0;

  targets.forEach((photo) => {
    if (photo.id === source.id) return;
    photo.edit = cloneEdit(sourceEdit);
    photo.aiPlan = source.aiPlan;
    photo.analysis.notes = [`已同步「${source.name}」的编辑参数。`, ...photo.analysis.notes].slice(0, 5);
    count += 1;
  });

  announce(`已将当前参数同步到 ${count} 张照片。`);
  render();
}

async function exportCurrentImage() {
  const photo = selectedPhoto();
  if (!photo) {
    announce("请先选择一张照片。");
    return;
  }

  setBusy(true);
  try {
    const blob = await renderPhotoToBlob(photo, "image/png");
    downloadBlob(blob, `${fileBaseName(photo.name)}_photopilot.png`);
    els.exportSummary.textContent = `已导出 ${photo.name} 的效果图，原图未被覆盖。`;
  } catch (error) {
    announce(`导出失败：${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function exportKeepImages() {
  const photos = state.photos.filter((photo) => photo.status === "keep");
  if (!photos.length) {
    announce("当前没有精选照片可导出。");
    return;
  }

  setBusy(true);
  let success = 0;
  try {
    for (const photo of photos) {
      const blob = await renderPhotoToBlob(photo, "image/png");
      downloadBlob(blob, `${fileBaseName(photo.name)}_photopilot.png`);
      success += 1;
      els.exportSummary.textContent = `正在导出精选图 ${success} / ${photos.length}，原图不会被覆盖。`;
      await delay(180);
    }
    announce(`已导出 ${success} 张精选效果图。`);
    els.exportSummary.textContent = `已导出 ${success} 张精选效果图，原图未被覆盖。`;
  } catch (error) {
    announce(`批量导出中断：${error.message}`);
    els.exportSummary.textContent = `已导出 ${success} / ${photos.length} 张，失败原因：${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function renderPhotoToBlob(photo, mimeType) {
  const image = await loadImage(photo.src);
  const canvas = document.createElement("canvas");
  const maxSide = 4096;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.filter = filterFromEdit(photo.edit);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器未能生成图片。"));
    }, mimeType, 0.94);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取当前图片。"));
    image.src = src;
  });
}

function exportProjectRecipe() {
  const project = {
    app: "PhotoPilot AI",
    version: "0.3",
    exportedAt: new Date().toISOString(),
    settings: {
      aiMode: state.settings.aiMode,
      provider: state.settings.provider,
      uploadConsent: state.settings.uploadConsent,
    },
    photos: state.photos.map((photo) => ({
      id: photo.id,
      name: photo.name,
      type: photo.type,
      score: photo.score,
      status: photo.status,
      analysis: {
        source: photo.analysis.source,
        sharpness: photo.analysis.sharpness,
        exposure: photo.analysis.exposure,
        composition: photo.analysis.composition,
        color: photo.analysis.color,
        contrast: photo.analysis.contrast,
        dynamicRange: photo.analysis.dynamicRange,
        expression: photo.analysis.expression,
        duplicate: photo.analysis.duplicate,
        confidence: photo.analysis.confidence,
        notes: photo.analysis.notes,
      },
      edit: photo.edit,
      aiPlan: photo.aiPlan?.label ?? "",
      aiPlanNotes: photo.aiPlan?.notes ?? [],
    })),
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `photopilot-project-${formatDateSlug(new Date())}.json`);
  els.exportSummary.textContent = `已导出 ${state.photos.length} 张照片的项目方案 JSON。`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function fileBaseName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-") || "photopilot";
}

function formatDateSlug(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function announce(message) {
  els.appMessage.textContent = message;
}

function setBusy(isBusy) {
  state.isBusy = isBusy;
  [
    els.runAiButton,
    els.promptButton,
    els.exportImageButton,
    els.exportKeepButton,
    els.exportRecipeButton,
    els.batchVisibleButton,
    els.batchKeepButton,
  ].forEach((button) => {
    button.disabled = isBusy;
  });
}

function setPreviewModeButtons() {
  els.beforeButton.classList.toggle("active", state.previewMode === "before");
  els.afterButton.classList.toggle("active", state.previewMode === "after");
}

function openSettings() {
  els.aiMode.value = state.settings.aiMode;
  els.providerSelect.value = state.settings.provider;
  els.apiKeyInput.value = state.settings.apiKey;
  els.uploadConsent.checked = state.settings.uploadConsent;
  els.settingsModal.hidden = false;
  els.aiMode.focus();
}

function closeSettings() {
  els.settingsModal.hidden = true;
}

function commitSettings() {
  state.settings = {
    aiMode: els.aiMode.value,
    provider: els.providerSelect.value,
    apiKey: els.apiKeyInput.value.trim(),
    uploadConsent: els.uploadConsent.checked,
  };
  saveSettings();
  renderProviderSummary();
  closeSettings();
  announce(state.settings.aiMode === "local" ? "已切换为本地像素评分。" : `已保存 ${providerLabel(state.settings.provider)} 设置。`);
}

els.importButton.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", (event) => {
  importFiles(event.target.files ?? []);
  event.target.value = "";
});

els.sampleButton.addEventListener("click", async () => {
  revokeObjectUrls();
  state.photos = samplePhotos.map(createSamplePhoto);
  state.view = "select";
  setActiveViewButton("select");
  selectFirstVisible();
  render();
  await rerunLocalScoring("已载入示例照片，并完成本地图像评分。");
});

els.runAiButton.addEventListener("click", rerunAiScoring);

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    setActiveViewButton(state.view);
    selectFirstVisible();
    render();
  });
});

els.sortSelect.addEventListener("change", () => {
  state.sort = els.sortSelect.value;
  render();
});

els.scoreFilter.addEventListener("input", () => {
  state.minScore = Number(els.scoreFilter.value);
  els.scoreFilterValue.textContent = `${state.minScore}+`;
  selectFirstVisible();
  render();
});

els.showOnlyFaces.addEventListener("change", () => {
  state.onlyFaces = els.showOnlyFaces.checked;
  selectFirstVisible();
  render();
});

els.showOnlyEdited.addEventListener("change", () => {
  state.onlyEdited = els.showOnlyEdited.checked;
  selectFirstVisible();
  render();
});

document.querySelectorAll("[data-status]").forEach((button) => {
  button.addEventListener("click", () => {
    const photo = selectedPhoto();
    if (!photo) return;
    photo.status = button.dataset.status;
    announce(`已将 ${photo.name} 标记为${statusLabel(photo.status)}。`);
    render();
  });
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

document.querySelectorAll("[data-edit]").forEach((input) => {
  input.addEventListener("input", () => {
    const photo = selectedPhoto();
    if (!photo) return;
    photo.edit[input.dataset.edit] = Number(input.value);
    state.previewMode = "after";
    setPreviewModeButtons();
    renderSelectedPhoto();
    renderStats();
    renderGallery();
  });
});

els.beforeButton.addEventListener("click", () => {
  state.previewMode = "before";
  setPreviewModeButtons();
  renderSelectedPhoto();
});

els.afterButton.addEventListener("click", () => {
  state.previewMode = "after";
  setPreviewModeButtons();
  renderSelectedPhoto();
});

els.copyBestButton.addEventListener("click", () => {
  const photo = selectedPhoto();
  if (!photo) return;
  const preferred = photo.type === "product" ? "studio" : photo.type === "landscape" ? "film" : "clean";
  applyPreset(preferred);
});

els.resetEditsButton.addEventListener("click", () => {
  const photo = selectedPhoto();
  if (!photo) return;
  photo.edit = cloneEdit();
  photo.analysis.notes = ["已重置编辑参数，回到原始预览。", ...photo.analysis.notes].slice(0, 5);
  announce("已重置当前照片的编辑参数。");
  render();
});

els.promptButton.addEventListener("click", async () => {
  const photo = selectedPhoto();
  if (!photo) return;
  const prompt = els.promptInput.value.trim();
  if (!prompt) {
    els.promptInput.focus();
    announce("先写一句想要的修图方向。");
    return;
  }

  setBusy(true);
  try {
    await ensurePhotoThumbnail(photo);
    const provider = currentRetouchProvider();
    const plan = await provider.createPlan({ photo, prompt });
    photo.edit = pickEdit(plan);
    photo.aiPlan = plan;
    photo.analysis.notes = plan.notes;
    state.previewMode = "after";
    setPreviewModeButtons();
    announce(`已使用${provider.label}生成调色方案。`);
  } catch (error) {
    const fallback = planFromPrompt(prompt);
    if (fallback) {
      photo.edit = pickEdit(fallback);
      photo.aiPlan = fallback;
      photo.analysis.notes = [`云端方案暂不可用：${error.message}`, ...fallback.notes].slice(0, 4);
      state.previewMode = "after";
      setPreviewModeButtons();
      announce("已回退到本地提示词方案。");
    } else {
      announce(error.message);
    }
  } finally {
    setBusy(false);
    render();
  }
});

els.batchVisibleButton.addEventListener("click", () => applyEditToBatch("visible"));
els.batchKeepButton.addEventListener("click", () => applyEditToBatch("keep"));
els.exportImageButton.addEventListener("click", exportCurrentImage);
els.exportKeepButton.addEventListener("click", exportKeepImages);
els.exportRecipeButton.addEventListener("click", exportProjectRecipe);
els.settingsButton.addEventListener("click", openSettings);
els.closeSettingsButton.addEventListener("click", closeSettings);
els.cancelSettingsButton.addEventListener("click", closeSettings);
els.saveSettingsButton.addEventListener("click", commitSettings);

document.querySelectorAll("[data-close-settings]").forEach((element) => {
  element.addEventListener("click", closeSettings);
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === "1") setStatusByKey("keep");
  if (event.key === "2") setStatusByKey("maybe");
  if (event.key === "3") setStatusByKey("reject");
  if (event.key === "Escape" && !els.settingsModal.hidden) closeSettings();
});

function setStatusByKey(status) {
  const photo = selectedPhoto();
  if (!photo) return;
  photo.status = status;
  announce(`已将 ${photo.name} 标记为${statusLabel(status)}。`);
  render();
}

["dragenter", "dragover"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.previewStage.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.previewStage.classList.remove("drag-over");
  });
});

document.addEventListener("drop", (event) => {
  importFiles(event.dataTransfer?.files ?? []);
});

state.photos = samplePhotos.map(createSamplePhoto);
selectFirstVisible();
setPreviewModeButtons();
render();
rerunLocalScoring("示例照片已完成本地图像评分。");
