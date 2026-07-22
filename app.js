import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { unzip } from './vendor/fflate/fflate.module.js';
import { trackUsage } from './analytics.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STEP_PATTERN = /\.(?:step|stp)$/i;
const ZIP_PATTERN = /\.zip$/i;
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
const MAX_EXPANDED_STEP_BYTES = 1500 * 1024 * 1024;
const MAX_STEP_FILES = 250;
const MAX_ARCHIVE_ENTRIES = 2500;
const CATEGORY_COLORS = ['#f5b657', '#6da8ff', '#69d695', '#bf8cff', '#ff7d8a', '#5ed5d1', '#f08fc7', '#a9bd6e'];
const PART_COLORS = [
  '#5b8cff', '#f2a65a', '#a78bfa', '#46c2a4', '#ff7d8a', '#a7b0be',
  '#f5d05f', '#5ec7d7', '#e889c4', '#86bf67', '#e37f62', '#7f9dd8',
  '#c8925d', '#75c4a8', '#bf80d7', '#d2bb69', '#5eb4ed', '#ef8fa0'
];

const elements = {
  uploadScreen: $('#upload-screen'),
  viewerApp: $('#viewer-app'),
  zipInput: $('#zip-input'),
  chooseZip: $('#choose-zip'),
  dropZone: $('#drop-zone'),
  uploadError: $('#upload-error'),
  uploadStatus: $('#upload-status'),
  uploadStatusText: $('#upload-status-text'),
  uploadProgress: $('#upload-progress'),
  newProject: $('#new-project'),
  loadRetry: $('#load-retry'),
  canvas: $('#viewer-canvas'),
  stage: $('#viewer-stage'),
  loadCard: $('#load-card'),
  loadTitle: $('#load-title'),
  loadMessage: $('#load-message'),
  loadProgress: $('#load-progress'),
  modelSummary: $('#model-summary'),
  projectTitle: $('#project-title'),
  stepFileSelect: $('#step-file-select'),
  categoryFilters: $('#category-filters'),
  partList: $('#part-list'),
  partSearch: $('#part-search'),
  visiblePartCount: $('#visible-part-count'),
  selectionId: $('#selection-id'),
  selectionName: $('#selection-name'),
  selectionRole: $('#selection-role'),
  selectionSwatch: $('#selection-swatch'),
  selectionData: $('#selection-data'),
  download: $('#part-download'),
  explodeRange: $('#explode-range'),
  explodeOutput: $('#explode-output'),
  stageMessage: $('#stage-message'),
  geometryMetrics: $('#geometry-metrics'),
  geometryStatus: $('#geometry-status'),
  measurementReadout: $('#measurement-readout'),
  measurementDistance: $('#measurement-distance'),
  measurementDelta: $('#measurement-delta'),
  measurementPoints: $('#measurement-points'),
  archiveData: $('#archive-data')
};

const state = {
  archiveFile: null,
  projectName: '',
  stepFiles: [],
  activeFile: null,
  detectionReason: '',
  manifest: null,
  partsByKey: new Map(),
  nodePartKeys: new WeakMap(),
  partGroups: new Map(),
  meshes: [],
  occurrenceGroups: [],
  geometryCache: new Map(),
  hashCache: new Map(),
  downloadUrls: new Map(),
  selectedKey: null,
  hiddenKeys: new Set(),
  isolateKey: null,
  category: 'all',
  search: '',
  partColorMode: true,
  wireframe: false,
  explode: 0,
  ready: false,
  selectionHelper: null,
  modelBounds: new THREE.Box3(),
  messageTimer: null,
  loadToken: 0,
  currentWorker: null,
  detailToken: 0,
  measurement: {
    enabled: false,
    points: [],
    group: null
  }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1219);
scene.fog = new THREE.FogExp2(0x0d1219, 0.00085);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
camera.up.set(0, 0, 1);

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.screenSpacePanning = true;
controls.minDistance = 0.01;
controls.maxDistance = 5000;

const modelRoot = new THREE.Group();
modelRoot.name = 'Uploaded STEP model';
scene.add(modelRoot);

scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x273142, 2.15));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(280, -240, 380);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8db5ff, 1.35);
fillLight.position.set(-260, 160, 110);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffc878, 1.2);
rimLight.position.set(80, 260, 250);
scene.add(rimLight);

const grid = new THREE.GridHelper(10, 20, 0x3f4e62, 0x202a37);
grid.rotation.x = Math.PI / 2;
grid.material.opacity = 0.38;
grid.material.transparent = true;
scene.add(grid);

const axes = new THREE.AxesHelper(1);
scene.add(axes);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;

function resizeRenderer() {
  const { width, height } = elements.stage.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resizeRenderer).observe(elements.stage);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

function formatNumber(value, maximumFractionDigits = 3) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function formatVector(vector) {
  if (!vector) return '—';
  return `X ${formatNumber(vector.x)} · Y ${formatNumber(vector.y)} · Z ${formatNumber(vector.z)} mm`;
}

function setUploadStatus(percent, message) {
  elements.uploadStatus.hidden = false;
  elements.uploadProgress.style.width = `${Math.max(4, Math.min(100, percent))}%`;
  elements.uploadStatusText.textContent = message;
}

function setLoadProgress(percent, title, message) {
  elements.loadProgress.style.width = `${Math.max(4, Math.min(100, percent))}%`;
  if (title) elements.loadTitle.textContent = title;
  if (message) elements.loadMessage.textContent = message;
}

function showMessage(message) {
  window.clearTimeout(state.messageTimer);
  elements.stageMessage.textContent = message;
  elements.stageMessage.classList.add('is-visible');
  state.messageTimer = window.setTimeout(() => elements.stageMessage.classList.remove('is-visible'), 1900);
}

function projectNameFromArchive(filename) {
  return filename.replace(/\.zip$/i, '').replace(/\.step$/i, '').trim() || 'STEP Project';
}

function displayNameFromPath(path) {
  return path.split('/').at(-1).replace(STEP_PATTERN, '');
}

function detectStepSchema(data) {
  const headerBytes = data.subarray(0, Math.min(data.byteLength, 262_144));
  const header = new TextDecoder('utf-8').decode(headerBytes);
  const identifier = header.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1]?.trim() ?? '';
  const normalized = identifier.toUpperCase();
  if (normalized.includes('AP242') || normalized.includes('MANAGED_MODEL_BASED_3D_ENGINEERING')) {
    return { label: 'AP242', identifier };
  }
  if (normalized.includes('AP214') || normalized.includes('AUTOMOTIVE_DESIGN')) {
    return { label: 'AP214', identifier };
  }
  if (normalized.includes('AP203') || normalized.includes('CONFIG_CONTROL_DESIGN')) {
    return { label: 'AP203', identifier };
  }
  return { label: identifier ? 'Other' : 'Unknown', identifier };
}

function schemaDisplay(schema) {
  if (schema?.label === 'Unknown') return 'STEP schema 未辨識';
  if (schema?.label === 'Other') return '其他 STEP schema';
  return `STEP ${schema?.label ?? 'schema 未辨識'}`;
}

function analyticsFailureCode(error) {
  const message = String(error?.message ?? error).toLocaleLowerCase('zh-Hant');
  if (message.includes('加密')) return 'encrypted';
  if (message.includes('zip64')) return 'zip64';
  if (message.includes('找不到 .step') || message.includes('找不到可讀取')) return 'no_step';
  if (message.includes('沒有可顯示') || message.includes('有效幾何')) return 'no_geometry';
  if (message.includes('webassembly') || message.includes('解析')) return 'parse_failed';
  if (message.includes('記憶體') || message.includes('超過')) return 'size_limit';
  if (message.includes('壓縮')) return 'compression';
  if (message.includes('zip')) return 'archive_invalid';
  return 'unknown';
}

function canonicalName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\.(?:step|stp)$/i, '')
    .replace(/[^a-z0-9\p{L}\p{N}]+/gu, '');
}

function safeNodeName(value, fallbackIndex) {
  const name = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return name || `Unnamed part ${fallbackIndex}`;
}

function inspectZip(buffer) {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`ZIP 超過 ${formatBytes(MAX_ARCHIVE_BYTES)}，瀏覽器可能沒有足夠記憶體處理。`);
  }

  const view = new DataView(buffer);
  let eocd = -1;
  const minimum = Math.max(0, view.byteLength - 65_558);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('檔案不是有效的 ZIP，或 ZIP 已損毀。');

  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error('目前不支援 ZIP64；請將專案拆成小於 500 MB 的一般 ZIP。');
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`ZIP 內檔案超過 ${MAX_ARCHIVE_ENTRIES} 個，已停止處理。`);
  }

  const decoder = new TextDecoder('utf-8');
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('ZIP 中央目錄不完整，無法安全讀取。');
    }
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const originalSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > view.byteLength) throw new Error('ZIP 檔名資料不完整。');

    const path = decoder.decode(new Uint8Array(buffer, nameStart, nameLength)).replaceAll('\\', '/');
    const pathParts = path.split('/');
    if (path.startsWith('/') || /^[a-z]:/i.test(path) || pathParts.includes('..')) {
      throw new Error('ZIP 包含不安全的檔案路徑，已停止處理。');
    }
    if (STEP_PATTERN.test(path) && !path.endsWith('/')) {
      if (flags & 0x1) throw new Error(`STEP 檔「${path}」已加密，瀏覽器無法讀取。`);
      if (![0, 8].includes(compression)) throw new Error(`STEP 檔「${path}」使用不支援的 ZIP 壓縮方法。`);
      if (originalSize === 0xffffffff || compressedSize === 0xffffffff) throw new Error('ZIP64 STEP entry 目前不支援。');
      if (originalSize > 10_000_000 && compressedSize > 0 && originalSize / compressedSize > 250) {
        throw new Error(`STEP 檔「${path}」的壓縮比異常，已停止處理。`);
      }
      entries.push({ path, compressedSize, originalSize });
    }
    offset = nameEnd + extraLength + commentLength;
  }

  if (!entries.length) throw new Error('ZIP 內找不到 .step 或 .stp 檔。請確認專案內容後再試一次。');
  if (entries.length > MAX_STEP_FILES) throw new Error(`ZIP 內 STEP 檔超過 ${MAX_STEP_FILES} 個，已停止處理。`);
  const totalOriginalSize = entries.reduce((sum, entry) => sum + entry.originalSize, 0);
  if (totalOriginalSize > MAX_EXPANDED_STEP_BYTES) {
    throw new Error(`STEP 解壓縮後超過 ${formatBytes(MAX_EXPANDED_STEP_BYTES)}，瀏覽器可能沒有足夠記憶體處理。`);
  }
  return entries;
}

function extractStepFiles(buffer, zipEntries) {
  const allowedPaths = new Set(zipEntries.map((entry) => entry.path));
  return new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), {
      filter: (entry) => allowedPaths.has(entry.name)
    }, (error, files) => {
      if (error) {
        reject(new Error(`ZIP 解壓縮失敗：${error.message || '格式不相容'}`));
        return;
      }
      const metadata = new Map(zipEntries.map((entry) => [entry.path, entry]));
      const stepFiles = Object.entries(files)
        .filter(([path]) => STEP_PATTERN.test(path))
        .map(([path, data]) => ({
          path,
          name: path.split('/').at(-1),
          base: displayNameFromPath(path),
          bytes: data.byteLength,
          data,
          schema: detectStepSchema(data),
          compressedSize: metadata.get(path)?.compressedSize ?? null
        }));
      resolve(stepFiles);
    });
  });
}

function choosePrimaryStep(stepFiles, archiveName) {
  const archiveBase = canonicalName(projectNameFromArchive(archiveName));
  const assemblyPattern = /(?:assembly|assy|assemblage|main|master|complete|full|top|組立|總成|总成|整機|整机)/i;
  const ranked = stepFiles.map((entry) => {
    const entryBase = canonicalName(entry.base);
    let score = entry.bytes;
    let reason = 'ZIP 內檔案大小最大';
    if (archiveBase && entryBase === archiveBase) {
      score += 2_000_000_000_000;
      reason = '檔名與 ZIP 專案名稱相同';
    } else if (assemblyPattern.test(entry.base)) {
      score += 1_000_000_000_000;
      reason = '檔名符合主組立命名';
    }
    return { entry, score, reason };
  }).sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
  return ranked[0];
}

async function handleZipFile(file) {
  clearUploadError();
  if (!file || !ZIP_PATTERN.test(file.name)) {
    showUploadError('只接受副檔名為 .zip 的檔案；STEP 檔請先放進 ZIP。');
    return;
  }

  try {
    setUploadStatus(8, `正在檢查 ${file.name}`);
    const buffer = await file.arrayBuffer();
    const zipEntries = inspectZip(buffer);
    setUploadStatus(28, `找到 ${zipEntries.length} 個 STEP 檔，正在本機解壓縮`);
    const stepFiles = await extractStepFiles(buffer, zipEntries);
    if (!stepFiles.length) throw new Error('ZIP 解壓縮後找不到可讀取的 STEP 檔。');

    const primary = choosePrimaryStep(stepFiles, file.name);
    resetArchiveState();
    state.archiveFile = file;
    state.projectName = projectNameFromArchive(file.name);
    state.stepFiles = stepFiles.sort((a, b) => a.path.localeCompare(b.path));
    state.detectionReason = primary.reason;
    populateStepFileSelect(primary.entry);
    trackUsage('zip_accepted', { schema: primary.entry.schema.label });
    setUploadStatus(100, `已選擇主模型：${primary.entry.name}`);
    showViewer();
    await loadStepFile(primary.entry);
  } catch (error) {
    console.error(error);
    trackUsage('archive_rejected', { failure: analyticsFailureCode(error) });
    showUploadError(error instanceof Error ? error.message : '無法讀取這個 ZIP。');
  } finally {
    elements.zipInput.value = '';
  }
}

function showUploadError(message) {
  elements.uploadStatus.hidden = true;
  elements.uploadError.textContent = message;
  elements.uploadError.hidden = false;
}

function clearUploadError() {
  elements.uploadError.hidden = true;
  elements.uploadError.textContent = '';
}

function showViewer() {
  elements.uploadScreen.hidden = true;
  elements.viewerApp.hidden = false;
  elements.projectTitle.textContent = state.projectName;
  elements.loadRetry.hidden = true;
  elements.loadCard.classList.remove('is-hidden', 'is-error');
  requestAnimationFrame(resizeRenderer);
}

function showUploadScreen() {
  resetArchiveState();
  elements.viewerApp.hidden = true;
  elements.uploadScreen.hidden = false;
  elements.uploadStatus.hidden = true;
  clearUploadError();
  elements.chooseZip.focus({ preventScroll: true });
}

function populateStepFileSelect(primaryEntry) {
  const ordered = [primaryEntry, ...state.stepFiles.filter((entry) => entry.path !== primaryEntry.path)];
  elements.stepFileSelect.replaceChildren(...ordered.map((entry, index) => {
    const option = document.createElement('option');
    option.value = entry.path;
    option.textContent = `${index === 0 ? '自動選擇 · ' : ''}[${entry.schema.label}] ${entry.path} · ${formatBytes(entry.bytes)}`;
    return option;
  }));
  elements.stepFileSelect.value = primaryEntry.path;
}

function resetArchiveState() {
  state.loadToken += 1;
  state.currentWorker?.terminate();
  state.currentWorker = null;
  clearModel();
  state.downloadUrls.forEach((url) => URL.revokeObjectURL(url));
  state.downloadUrls.clear();
  state.archiveFile = null;
  state.projectName = '';
  state.stepFiles = [];
  state.activeFile = null;
  state.detectionReason = '';
  state.hashCache.clear();
  elements.stepFileSelect.replaceChildren();
}

function clearModel() {
  state.ready = false;
  state.detailToken += 1;
  resetMeasurementPoints();
  state.measurement.enabled = false;
  modelRoot.traverse((object) => {
    if (object === modelRoot) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
  modelRoot.clear();
  if (state.selectionHelper) {
    scene.remove(state.selectionHelper);
    state.selectionHelper.geometry.dispose();
    state.selectionHelper.material.dispose();
    state.selectionHelper = null;
  }
  state.manifest = null;
  state.partsByKey = new Map();
  state.nodePartKeys = new WeakMap();
  state.partGroups.clear();
  state.meshes = [];
  state.occurrenceGroups = [];
  state.geometryCache.clear();
  state.selectedKey = null;
  state.hiddenKeys.clear();
  state.isolateKey = null;
  state.category = 'all';
  state.search = '';
  state.explode = 0;
  state.modelBounds.makeEmpty();
  elements.partSearch.value = '';
  elements.explodeRange.value = '0';
  elements.explodeOutput.value = '0%';
  elements.measurementReadout.hidden = true;
  $('[data-action="toggle-measure"]').setAttribute('aria-pressed', 'false');
  elements.canvas.dataset.measuring = 'false';
}

function parseStepInWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./vendor/occt-import-js/occt-import-js-worker.js');
    state.currentWorker = worker;
    worker.addEventListener('message', (event) => {
      if (state.currentWorker === worker) state.currentWorker = null;
      worker.terminate();
      if (event.data?.__error) reject(new Error(event.data.__error));
      else resolve(event.data);
    }, { once: true });
    worker.addEventListener('error', (event) => {
      if (state.currentWorker === worker) state.currentWorker = null;
      worker.terminate();
      reject(new Error(event.message || 'STEP WebAssembly 解析失敗'));
    }, { once: true });
    const transferable = data.slice();
    worker.postMessage({
      format: 'step',
      buffer: transferable,
      params: {
        linearUnit: 'millimeter',
        linearDeflectionType: 'bounding_box_ratio',
        linearDeflection: 0.002,
        angularDeflection: 0.5
      }
    }, [transferable.buffer]);
  });
}

async function loadStepFile(entry) {
  const token = ++state.loadToken;
  clearModel();
  state.activeFile = entry;
  elements.stepFileSelect.value = entry.path;
  elements.stepFileSelect.disabled = true;
  elements.modelSummary.textContent = '解析中';
  elements.loadCard.classList.remove('is-hidden', 'is-error');
  elements.loadRetry.hidden = true;
  setLoadProgress(8, '正在準備主模型', `${schemaDisplay(entry.schema)} · ${entry.path} · ${formatBytes(entry.bytes)}`);

  try {
    const startedAt = performance.now();
    setLoadProgress(34, '正在解析 STEP 幾何', 'Open Cascade WebAssembly 正在本機建立 tessellation。');
    const [result] = await Promise.all([
      parseStepInWorker(entry.data),
      hashForEntry(entry)
    ]);
    if (token !== state.loadToken) return;
    if (!result?.success || !result.root || !Array.isArray(result.meshes)) {
      throw new Error('STEP 解析器沒有回傳有效幾何；請確認檔案未損毀且為標準 STEP。');
    }

    setLoadProgress(76, '正在建立互動組立', `已解析 ${result.meshes.length} 個 mesh，正在建立零件樹。`);
    state.manifest = buildManifest(result, entry);
    buildHierarchy(result.root, result, modelRoot, new Map());
    if (!state.meshes.length) throw new Error('STEP 已讀取，但沒有可顯示的曲面或實體 mesh。');

    prepareExplodedView();
    buildFilters();
    renderPartList();
    applyColorMode();
    applyWireframe(false);
    applyVisibility();
    setView('iso');
    renderArchiveData();
    updateDetails();

    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    state.ready = true;
    trackUsage('model_opened', { schema: entry.schema.label });
    elements.modelSummary.textContent = `${state.manifest.parts.length} 種 · ${state.manifest.assembly.occurrences} 件 · ${state.meshes.length} mesh`;
    setLoadProgress(100, '模型已就緒', `本機解析完成，用時 ${elapsedSeconds} 秒。`);
    window.setTimeout(() => elements.loadCard.classList.add('is-hidden'), 320);
  } catch (error) {
    if (token !== state.loadToken) return;
    console.error(error);
    trackUsage('model_failed', { schema: entry.schema.label, failure: analyticsFailureCode(error) });
    elements.modelSummary.textContent = '解析失敗';
    elements.loadCard.classList.remove('is-hidden');
    elements.loadCard.classList.add('is-error');
    elements.loadRetry.hidden = false;
    const detail = error instanceof Error ? error.message : '未知錯誤';
    setLoadProgress(100, `無法開啟 ${schemaDisplay(entry.schema)}`, `${detail} 建議重新匯出為 AP214 或 AP242 的 B-rep solid／assembly。`);
  } finally {
    if (token === state.loadToken) elements.stepFileSelect.disabled = false;
  }
}

function buildManifest(result, entry) {
  const partRecords = new Map();
  let unnamedIndex = 0;

  function visit(node, lineage = []) {
    const nodeName = safeNodeName(node?.name, ++unnamedIndex);
    const currentLineage = [...lineage, nodeName];
    const meshIndexes = Array.isArray(node?.meshes) ? node.meshes : [];
    if (meshIndexes.length) {
      const key = nodeName.toLocaleLowerCase('en-US');
      const branch = currentLineage.length > 2 ? currentLineage[1] : 'Parts';
      if (!partRecords.has(key)) {
        partRecords.set(key, {
          key,
          name: nodeName,
          branches: new Map(),
          quantityInAssembly: 0,
          meshCount: 0,
          fileEntry: null,
          category: 'parts'
        });
      }
      const record = partRecords.get(key);
      record.quantityInAssembly += 1;
      record.meshCount += meshIndexes.length;
      record.branches.set(branch, (record.branches.get(branch) ?? 0) + 1);
      state.nodePartKeys.set(node, key);
    }
    (node?.children ?? []).forEach((child) => visit(child, currentLineage));
  }
  visit(result.root);

  const allBranches = new Set();
  partRecords.forEach((part) => part.branches.forEach((_, branch) => allBranches.add(branch)));
  const useBranches = allBranches.size >= 2 && allBranches.size <= CATEGORY_COLORS.length && allBranches.size < partRecords.size;
  const categories = {};
  if (useBranches) {
    [...allBranches].sort().forEach((branch, index) => {
      const key = `branch-${index}`;
      categories[key] = { label: branch, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length], branch };
    });
  } else {
    categories.parts = { label: '全部零件', color: CATEGORY_COLORS[0], branch: null };
  }

  const categoryByBranch = new Map(Object.entries(categories).map(([key, category]) => [category.branch, key]));
  const parts = [...partRecords.values()].map((part) => {
    const primaryBranch = [...part.branches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    part.category = useBranches ? categoryByBranch.get(primaryBranch) : 'parts';
    part.fileEntry = findMatchingStepFile(part.name);
    part.sourceId = part.fileEntry?.path ?? 'Assembly node';
    part.role = part.fileEntry
      ? 'ZIP 內找到名稱相符的個別 STEP；幾何與數量由目前主模型推導。'
      : '目前主模型中的 STEP 節點；ZIP 內未找到同名個別 STEP。';
    return part;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  assignPartColors(parts);

  state.partsByKey = new Map(parts.map((part) => [part.key, part]));
  return {
    categories,
    parts,
    assembly: {
      name: String(result.root?.name ?? '').trim() || entry.base,
      sourceId: entry.path,
      bytes: entry.bytes,
      distinctPartTypes: parts.length,
      occurrences: parts.reduce((sum, part) => sum + part.quantityInAssembly, 0),
      meshCount: result.meshes.length,
      schema: entry.schema,
      fileEntry: entry
    }
  };
}

function assignPartColors(parts) {
  const colorBySource = new Map();
  parts.forEach((part) => {
    const sourceKey = part.fileEntry ? `file:${part.fileEntry.path}` : `node:${part.key}`;
    if (!colorBySource.has(sourceKey)) colorBySource.set(sourceKey, partColorAt(colorBySource.size));
    part.color = colorBySource.get(sourceKey);
    part.colorBasis = part.fileEntry ? '依 STEP 檔' : '依零件節點';
  });
}

function partColorAt(index) {
  if (index < PART_COLORS.length) return PART_COLORS[index];
  const hue = ((index - PART_COLORS.length) * 137.508 + 31) % 360;
  const color = new THREE.Color().setHSL(hue / 360, 0.62, 0.62, THREE.SRGBColorSpace);
  return `#${color.getHexString(THREE.SRGBColorSpace)}`;
}

function findMatchingStepFile(partName) {
  const target = canonicalName(partName);
  if (!target) return null;
  const exact = state.stepFiles.find((entry) => canonicalName(entry.base) === target);
  if (exact) return exact;
  if (target.length < 4) return null;
  return state.stepFiles.find((entry) => {
    const candidate = canonicalName(entry.base);
    return candidate.length >= 4 && (candidate.includes(target) || target.includes(candidate));
  }) ?? null;
}

function partColor(part) {
  return part?.color ?? state.manifest?.categories?.[part?.category]?.color ?? '#a7b0be';
}

function buildFilters() {
  const categories = [
    ['all', '全部'],
    ...Object.entries(state.manifest.categories).map(([key, value]) => [key, value.label])
  ];
  elements.categoryFilters.replaceChildren(...categories.map(([key, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.dataset.category = key;
    button.textContent = label;
    button.setAttribute('aria-pressed', key === state.category ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.category = key;
      state.isolateKey = null;
      if (state.selectedKey && key !== 'all' && state.partsByKey.get(state.selectedKey)?.category !== key) clearSelection();
      updateFilterButtons();
      renderPartList();
      applyVisibility();
      showMessage(key === 'all' ? '顯示全部分類' : `只顯示：${label}`);
    });
    return button;
  }));
}

function updateFilterButtons() {
  $$('.filter-chip', elements.categoryFilters).forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.category === state.category ? 'true' : 'false');
  });
}

function filteredParts() {
  const normalizedSearch = state.search.trim().toLocaleLowerCase('zh-Hant');
  return state.manifest.parts.filter((part) => {
    const inCategory = state.category === 'all' || part.category === state.category;
    const haystack = `${part.name} ${part.sourceId}`.toLocaleLowerCase('zh-Hant');
    return inCategory && (!normalizedSearch || haystack.includes(normalizedSearch));
  });
}

function renderPartList() {
  const parts = filteredParts();
  const items = parts.map((part) => {
    const item = document.createElement('li');
    item.className = 'part-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'part-button';
    button.dataset.partKey = part.key;
    button.style.setProperty('--part-color', partColor(part));
    button.setAttribute('aria-pressed', part.key === state.selectedKey ? 'true' : 'false');
    button.setAttribute('aria-label', `${part.name}，組立數量 ${part.quantityInAssembly}`);
    button.innerHTML = `
      <span class="part-dot" aria-hidden="true"></span>
      <span class="part-copy"><span class="part-name"></span><span class="part-id"></span></span>
      <span class="part-quantity"></span>`;
    $('.part-name', button).textContent = part.name;
    $('.part-id', button).textContent = part.sourceId;
    $('.part-quantity', button).textContent = `×${part.quantityInAssembly}`;
    button.addEventListener('click', () => {
      selectPart(part.key);
      closePanelOnMobile('navigator-panel');
    });
    item.append(button);
    return item;
  });

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-list';
    empty.textContent = '沒有符合的零件';
    items.push(empty);
  }
  elements.partList.replaceChildren(...items);
  elements.visiblePartCount.textContent = `${parts.length} / ${state.manifest.parts.length}`;
}

function createMesh(meshData, part, meshIndex) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
  if (meshData.attributes.normal?.array?.length) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (meshData.index?.array?.length) geometry.setIndex(meshData.index.array);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const assigned = new THREE.Color(partColor(part));
  const source = meshData.color
    ? new THREE.Color(meshData.color[0], meshData.color[1], meshData.color[2])
    : new THREE.Color(0xb5becb);
  const material = new THREE.MeshStandardMaterial({
    color: state.partColorMode ? assigned : source,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = meshData.name || `${part?.name ?? 'Unnamed'} mesh ${meshIndex + 1}`;
  mesh.userData = {
    part,
    partKey: part?.key,
    partColor: assigned,
    sourceColor: source,
    meshIndex
  };
  state.meshes.push(mesh);
  return mesh;
}

function buildHierarchy(node, result, parent, occurrenceCounters) {
  const group = new THREE.Group();
  group.name = safeNodeName(node?.name, 0);
  parent.add(group);
  const partKey = state.nodePartKeys.get(node);
  const part = state.partsByKey.get(partKey);
  const meshIndexes = Array.isArray(node?.meshes) ? node.meshes : [];
  if (part && meshIndexes.length) {
    const occurrenceIndex = (occurrenceCounters.get(partKey) ?? 0) + 1;
    occurrenceCounters.set(partKey, occurrenceIndex);
    group.userData.partKey = partKey;
    group.userData.occurrenceIndex = occurrenceIndex;
    meshIndexes.forEach((meshIndex) => group.add(createMesh(result.meshes[meshIndex], part, meshIndex)));
    if (!state.partGroups.has(partKey)) state.partGroups.set(partKey, []);
    state.partGroups.get(partKey).push(group);
    state.occurrenceGroups.push(group);
  }
  (node?.children ?? []).forEach((child) => buildHierarchy(child, result, group, occurrenceCounters));
}

function prepareExplodedView() {
  modelRoot.updateWorldMatrix(true, true);
  state.modelBounds.copy(new THREE.Box3().setFromObject(modelRoot));
  if (state.modelBounds.isEmpty()) return;
  const assemblyCenter = state.modelBounds.getCenter(new THREE.Vector3());
  const diagonal = Math.max(state.modelBounds.getSize(new THREE.Vector3()).length(), 0.001);

  state.occurrenceGroups.forEach((group, index) => {
    const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
    const direction = center.sub(assemblyCenter);
    if (direction.lengthSq() < 0.000001) {
      const angle = (index / Math.max(state.occurrenceGroups.length, 1)) * Math.PI * 2;
      direction.set(Math.cos(angle), Math.sin(angle), (index % 3) - 1);
    }
    group.userData.basePosition = group.position.clone();
    group.userData.explodeDirection = direction.normalize();
  });

  const size = state.modelBounds.getSize(new THREE.Vector3());
  const gridScale = Math.max(size.x, size.y, diagonal * 0.2) * 0.16;
  grid.scale.setScalar(Math.max(gridScale, 0.01));
  grid.position.set(assemblyCenter.x, assemblyCenter.y, state.modelBounds.min.z - diagonal * 0.006);
  axes.scale.setScalar(diagonal * 0.08);
  axes.position.set(state.modelBounds.min.x - diagonal * 0.04, state.modelBounds.min.y - diagonal * 0.04, state.modelBounds.min.z);
  scene.fog.density = 0.42 / diagonal;
}

function isVisibleInHierarchy(object) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function visibleBox(root = modelRoot) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  root.traverse((object) => {
    if (!object.isMesh || !isVisibleInHierarchy(object)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    meshBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
    box.union(meshBox);
  });
  return box;
}

function selectedBox() {
  if (!state.selectedKey) return null;
  const groups = state.partGroups.get(state.selectedKey) ?? [];
  const result = new THREE.Box3();
  groups.forEach((group) => {
    if (isVisibleInHierarchy(group)) result.union(new THREE.Box3().setFromObject(group));
  });
  return result.isEmpty() ? null : result;
}

function fitBox(box, direction = null) {
  if (!box || box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.001);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (radius / Math.sin(fov / 2)) * 1.12;
  const viewDirection = direction?.clone().normalize() ?? camera.position.clone().sub(controls.target).normalize();
  if (viewDirection.lengthSq() < 0.01) viewDirection.set(1, -1, 0.75).normalize();
  camera.position.copy(center).addScaledVector(viewDirection, distance);
  camera.near = Math.max(distance / 1000, 0.0001);
  camera.far = Math.max(distance * 12, 10);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = Math.max(radius * 0.03, 0.0001);
  controls.maxDistance = distance * 8;
  controls.update();
}

function fitAll(direction = null) {
  fitBox(visibleBox(), direction);
}

function fitSelection() {
  const box = selectedBox();
  if (!box) {
    showMessage('請先選取一個可見零件');
    return;
  }
  fitBox(box);
}

function setView(view) {
  const directions = {
    front: new THREE.Vector3(0, -1, 0),
    top: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    iso: new THREE.Vector3(1, -1, 0.82)
  };
  camera.up.set(0, view === 'top' ? 1 : 0, view === 'top' ? 0 : 1);
  fitAll(directions[view] ?? directions.iso);
}

function setMaterialSelection() {
  state.meshes.forEach((mesh) => {
    const selected = Boolean(state.selectedKey && mesh.userData.partKey === state.selectedKey);
    mesh.material.emissive.set(selected ? partColor(mesh.userData.part) : '#000000');
    mesh.material.emissiveIntensity = selected ? 0.42 : 0;
    mesh.material.roughness = selected ? 0.48 : 0.72;
  });
  if (state.selectionHelper) {
    scene.remove(state.selectionHelper);
    state.selectionHelper.geometry.dispose();
    state.selectionHelper.material.dispose();
    state.selectionHelper = null;
  }
  const box = selectedBox();
  if (box) {
    state.selectionHelper = new THREE.Box3Helper(box, new THREE.Color(partColor(state.partsByKey.get(state.selectedKey))));
    state.selectionHelper.material.transparent = true;
    state.selectionHelper.material.opacity = 0.72;
    scene.add(state.selectionHelper);
  }
}

function selectPart(key) {
  if (!state.partsByKey.has(key)) return;
  state.selectedKey = state.selectedKey === key ? null : key;
  if (state.selectedKey) state.hiddenKeys.delete(state.selectedKey);
  applyVisibility();
  setMaterialSelection();
  updateDetails(state.selectedKey ? state.partsByKey.get(state.selectedKey) : null);
  renderPartList();
}

function clearSelection() {
  state.selectedKey = null;
  setMaterialSelection();
  if (state.manifest) updateDetails();
  if (state.manifest) renderPartList();
}

function applyVisibility() {
  state.partGroups.forEach((groups, key) => {
    const part = state.partsByKey.get(key);
    const categoryMatches = state.category === 'all' || part?.category === state.category;
    const isolateMatches = !state.isolateKey || state.isolateKey === key;
    const visible = categoryMatches && isolateMatches && !state.hiddenKeys.has(key);
    groups.forEach((group) => { group.visible = visible; });
  });
  setMaterialSelection();
}

function isolateSelected() {
  if (!state.selectedKey) {
    showMessage('請先選取要隔離的零件');
    return;
  }
  state.category = 'all';
  state.isolateKey = state.selectedKey;
  state.hiddenKeys.delete(state.selectedKey);
  updateFilterButtons();
  renderPartList();
  applyVisibility();
  fitSelection();
  showMessage(`已隔離：${state.partsByKey.get(state.selectedKey).name}`);
}

function hideSelected() {
  if (!state.selectedKey) {
    showMessage('請先選取要隱藏的零件');
    return;
  }
  const hiddenKey = state.selectedKey;
  state.hiddenKeys.add(hiddenKey);
  if (state.isolateKey === hiddenKey) state.isolateKey = null;
  const hiddenName = state.partsByKey.get(hiddenKey).name;
  clearSelection();
  applyVisibility();
  showMessage(`已隱藏：${hiddenName}`);
}

function showAll() {
  state.hiddenKeys.clear();
  state.isolateKey = null;
  state.category = 'all';
  updateFilterButtons();
  renderPartList();
  applyVisibility();
  fitAll();
  showMessage('已恢復全部零件');
}

function applyColorMode() {
  state.meshes.forEach((mesh) => {
    const color = state.partColorMode ? mesh.userData.partColor : mesh.userData.sourceColor;
    mesh.material.color.copy(color);
    mesh.material.needsUpdate = true;
  });
  const button = $('[data-action="toggle-color"]');
  button.setAttribute('aria-pressed', state.partColorMode ? 'true' : 'false');
  button.textContent = state.partColorMode ? '零件色' : 'STEP 原色';
  setMaterialSelection();
}

function applyWireframe(announce = true) {
  state.meshes.forEach((mesh) => {
    mesh.material.wireframe = state.wireframe;
    mesh.material.needsUpdate = true;
  });
  $('[data-action="toggle-wireframe"]').setAttribute('aria-pressed', state.wireframe ? 'true' : 'false');
  if (announce) showMessage(state.wireframe ? '顯示 tessellation 三角網格' : '關閉三角網格');
}

function applyExplode(value) {
  state.explode = value;
  const distance = state.modelBounds.getSize(new THREE.Vector3()).length() * 0.22 * value;
  state.occurrenceGroups.forEach((group) => {
    group.position.copy(group.userData.basePosition).addScaledVector(group.userData.explodeDirection, distance);
  });
  modelRoot.updateWorldMatrix(true, true);
  setMaterialSelection();
}

function disposeMeasurementObjects() {
  if (!state.measurement.group) return;
  scene.remove(state.measurement.group);
  state.measurement.group.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
  state.measurement.group = null;
}

function resetMeasurementPoints() {
  disposeMeasurementObjects();
  state.measurement.points = [];
  if (state.measurement.enabled) {
    elements.measurementReadout.hidden = false;
    elements.measurementDistance.textContent = '請在模型上選第 1 點';
    elements.measurementDelta.textContent = '兩點直線距離；只供 review，不含公差';
    elements.measurementPoints.textContent = '';
  } else {
    elements.measurementReadout.hidden = true;
  }
}

function measurementMarker(point) {
  const diagonal = state.modelBounds.getSize(new THREE.Vector3()).length();
  const radius = Math.max(diagonal * 0.0042, 0.0001);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcb7c, depthTest: false })
  );
  marker.position.copy(point);
  marker.renderOrder = 20;
  return marker;
}

function renderMeasurement() {
  disposeMeasurementObjects();
  const group = new THREE.Group();
  group.name = 'Reference measurement';
  state.measurement.points.forEach((point) => group.add(measurementMarker(point)));
  if (state.measurement.points.length === 2) {
    const [start, end] = state.measurement.points;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, end]),
      new THREE.LineBasicMaterial({ color: 0xffcb7c, depthTest: false })
    );
    line.renderOrder = 19;
    group.add(line);
    const delta = end.clone().sub(start);
    elements.measurementDistance.textContent = `${formatNumber(delta.length())} mm`;
    elements.measurementDelta.textContent = `ΔX ${formatNumber(Math.abs(delta.x))} · ΔY ${formatNumber(Math.abs(delta.y))} · ΔZ ${formatNumber(Math.abs(delta.z))} mm`;
    elements.measurementPoints.textContent = `P1 ${formatVector(start)} → P2 ${formatVector(end)}`;
  } else {
    elements.measurementDistance.textContent = '請在模型上選第 2 點';
    elements.measurementDelta.textContent = formatVector(state.measurement.points[0]);
    elements.measurementPoints.textContent = '';
  }
  state.measurement.group = group;
  scene.add(group);
}

function addMeasurementPoint(point) {
  if (state.measurement.points.length === 2) resetMeasurementPoints();
  state.measurement.points.push(point.clone());
  renderMeasurement();
}

function setMeasurementMode(enabled) {
  state.measurement.enabled = enabled;
  $('[data-action="toggle-measure"]').setAttribute('aria-pressed', enabled ? 'true' : 'false');
  elements.canvas.dataset.measuring = enabled ? 'true' : 'false';
  if (enabled) {
    if (state.explode !== 0) {
      elements.explodeRange.value = '0';
      elements.explodeOutput.value = '0%';
      applyExplode(0);
    }
    elements.measurementReadout.hidden = false;
    if (!state.measurement.points.length) resetMeasurementPoints();
    showMessage('量測模式：依序點選模型表面兩點');
  } else {
    elements.measurementReadout.hidden = true;
    showMessage('已離開量測模式；結果仍保留');
  }
}

function updateDetails(part = null) {
  if (!state.manifest) return;
  if (!part) {
    const assembly = state.manifest.assembly;
    elements.selectionId.textContent = assembly.sourceId;
    elements.selectionName.textContent = `${assembly.name} · 模型總覽`;
    elements.selectionRole.textContent = '目前 STEP 的完整互動視圖；零件與 occurrence 由模型階層自動推導。';
    elements.selectionSwatch.style.background = 'linear-gradient(#f5b657, #7d8a9d)';
    elements.selectionData.innerHTML = `
      <div><dt>格式</dt><dd>${schemaDisplay(assembly.schema)}</dd></div>
      <div><dt>顯示單位</dt><dd>mm</dd></div>
      <div><dt>零件類型</dt><dd>${assembly.distinctPartTypes}</dd></div>
      <div><dt>Occurrence</dt><dd>${assembly.occurrences}（推導）</dd></div>
      <div><dt>Mesh</dt><dd>${assembly.meshCount}</dd></div>
      <div><dt>檔案大小</dt><dd>${formatBytes(assembly.bytes)}</dd></div>`;
    setDownload(assembly.fileEntry, `下載主模型 · ${assembly.fileEntry.name}`);
  } else {
    const category = state.manifest.categories[part.category];
    elements.selectionId.textContent = `${part.sourceId} · ${category.label}`;
    elements.selectionName.textContent = part.name;
    elements.selectionRole.textContent = part.role;
    elements.selectionSwatch.style.background = partColor(part);
    elements.selectionData.innerHTML = `
      <div><dt>組立數量</dt><dd>${part.quantityInAssembly}（推導）</dd></div>
      <div><dt>Mesh</dt><dd>${part.meshCount}</dd></div>
      <div><dt>顯示單位</dt><dd>mm</dd></div>
      <div><dt>個別 STEP</dt><dd>${part.fileEntry ? '名稱相符' : '未比對到'}</dd></div>
      <div><dt>檢視配色</dt><dd>${part.colorBasis}</dd></div>
      <div class="wide"><dt>資料狀態</dt><dd>無公差 mesh 參考值，不是製造規格</dd></div>`;
    if (part.fileEntry) setDownload(part.fileEntry, `下載個別 STEP · ${part.fileEntry.name}`);
    else disableDownload('ZIP 內無對應個別 STEP');
  }
  updateGeometryMetrics(part);
}

function setDownload(entry, label) {
  let url = state.downloadUrls.get(entry.path);
  if (!url) {
    url = URL.createObjectURL(new Blob([entry.data], { type: 'application/step' }));
    state.downloadUrls.set(entry.path, url);
  }
  elements.download.href = url;
  elements.download.download = entry.name;
  elements.download.firstChild.textContent = `${label} `;
  elements.download.classList.remove('is-disabled');
  elements.download.removeAttribute('aria-disabled');
}

function disableDownload(label) {
  elements.download.removeAttribute('href');
  elements.download.removeAttribute('download');
  elements.download.firstChild.textContent = `${label} `;
  elements.download.classList.add('is-disabled');
  elements.download.setAttribute('aria-disabled', 'true');
}

function renderArchiveData() {
  const rows = [
    ['ZIP', state.archiveFile.name],
    ['ZIP 大小', formatBytes(state.archiveFile.size)],
    ['STEP 檔', `${state.stepFiles.length} 個`],
    ['STEP schema', state.activeFile.schema.label],
    ['目前模型', state.activeFile.path],
    ['自動選擇', state.detectionReason]
  ];
  elements.archiveData.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    return row;
  }));
}

function updateGeometryMetrics(part = null) {
  const token = ++state.detailToken;
  elements.geometryStatus.querySelector('span').textContent = '計算中';
  elements.geometryMetrics.innerHTML = '<div><dt>狀態</dt><dd>正在本機計算 mesh 幾何…</dd></div>';
  geometryFor(part).then((geometry) => {
    if (token !== state.detailToken) return;
    elements.geometryStatus.querySelector('span').textContent = '瀏覽器推導';
    elements.geometryMetrics.innerHTML = `
      <div><dt>AABB min</dt><dd>${formatVector(geometry.bounds.min)}</dd></div>
      <div><dt>AABB max</dt><dd>${formatVector(geometry.bounds.max)}</dd></div>
      <div><dt>外包尺寸</dt><dd>${formatVector(geometry.envelope)}</dd></div>
      <div><dt>中心</dt><dd>${formatVector(geometry.center)}</dd></div>
      <div><dt>對角線</dt><dd>${formatNumber(geometry.diagonal)} mm</dd></div>
      <div><dt>表面積（約）</dt><dd>${formatNumber(geometry.surfaceArea, 1)} mm²</dd></div>
      <div><dt>Mesh 體積（約）</dt><dd>${formatNumber(geometry.volume, 1)} mm³</dd></div>
      <div><dt>Mesh</dt><dd>${formatNumber(geometry.meshCount, 0)}</dd></div>
      <div><dt>Vertex</dt><dd>${formatNumber(geometry.vertexCount, 0)}</dd></div>
      <div><dt>Triangle</dt><dd>${formatNumber(geometry.triangleCount, 0)}</dd></div>
      <div><dt>來源 hash</dt><dd title="${geometry.sourceHash ?? ''}">${geometry.sourceHash ? `${geometry.sourceHash.slice(0, 16)}…` : '瀏覽器環境不支援'}</dd></div>`;
  }).catch((error) => {
    if (token !== state.detailToken) return;
    console.error(error);
    elements.geometryStatus.querySelector('span').textContent = '計算失敗';
    elements.geometryMetrics.innerHTML = '<div><dt>狀態</dt><dd>無法計算幾何統計</dd></div>';
  });
}

function geometryFor(part = null) {
  const cacheKey = part?.key ?? '__assembly__';
  if (!state.geometryCache.has(cacheKey)) {
    const meshes = part ? state.meshes.filter((mesh) => mesh.userData.partKey === part.key) : state.meshes;
    const sourceEntry = part?.fileEntry ?? state.activeFile;
    state.geometryCache.set(cacheKey, calculateGeometry(meshes, sourceEntry));
  }
  return state.geometryCache.get(cacheKey);
}

async function calculateGeometry(meshes, sourceEntry) {
  await yieldToBrowser();
  modelRoot.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let surfaceArea = 0;
  let volume = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let processedSinceYield = 0;

  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    if (!position) continue;
    vertexCount += position.count;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    meshBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    bounds.union(meshBounds);

    const indexCount = index ? index.count : position.count;
    const triangles = Math.floor(indexCount / 3);
    triangleCount += triangles;
    let signedMeshVolume = 0;
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const offset = triangle * 3;
      const ai = index ? index.getX(offset) : offset;
      const bi = index ? index.getX(offset + 1) : offset + 1;
      const ci = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(position, ai).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, bi).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ci).applyMatrix4(mesh.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      surfaceArea += cross.crossVectors(ab, ac).length() * 0.5;
      signedMeshVolume += a.dot(cross.crossVectors(b, c)) / 6;
      processedSinceYield += 1;
      if (processedSinceYield >= 50_000) {
        processedSinceYield = 0;
        await yieldToBrowser();
      }
    }
    volume += Math.abs(signedMeshVolume);
  }

  const envelope = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  return {
    bounds: bounds.isEmpty() ? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()) : bounds,
    envelope,
    center,
    diagonal: envelope.length(),
    surfaceArea,
    volume,
    meshCount: meshes.length,
    vertexCount,
    triangleCount,
    sourceHash: await hashForEntry(sourceEntry)
  };
}

function yieldToBrowser() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function hashForEntry(entry) {
  if (!entry || !globalThis.crypto?.subtle) return Promise.resolve(null);
  if (!state.hashCache.has(entry.path)) {
    const promise = globalThis.crypto.subtle.digest('SHA-256', entry.data).then((digest) => (
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    ));
    state.hashCache.set(entry.path, promise);
  }
  return state.hashCache.get(entry.path);
}

function handleToolbar(action) {
  if (!state.ready) return;
  switch (action) {
    case 'fit-all': fitAll(); break;
    case 'fit-selection': fitSelection(); break;
    case 'isolate': isolateSelected(); break;
    case 'hide': hideSelected(); break;
    case 'show-all': showAll(); break;
    case 'toggle-measure': setMeasurementMode(!state.measurement.enabled); break;
    case 'clear-measure':
      resetMeasurementPoints();
      showMessage('已清除參考量測');
      break;
    case 'toggle-color':
      state.partColorMode = !state.partColorMode;
      applyColorMode();
      break;
    case 'toggle-wireframe':
      state.wireframe = !state.wireframe;
      applyWireframe();
      break;
    default: break;
  }
}

elements.chooseZip.addEventListener('click', (event) => {
  event.stopPropagation();
  elements.zipInput.click();
});
elements.dropZone.addEventListener('click', () => elements.zipInput.click());
elements.zipInput.addEventListener('change', () => handleZipFile(elements.zipInput.files?.[0]));

['dragenter', 'dragover'].forEach((type) => elements.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  elements.dropZone.classList.add('is-dragging');
}));
['dragleave', 'drop'].forEach((type) => elements.dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove('is-dragging');
}));
elements.dropZone.addEventListener('drop', (event) => {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length !== 1) {
    showUploadError('一次只能上傳一個 ZIP 專案。');
    return;
  }
  handleZipFile(files[0]);
});

elements.newProject.addEventListener('click', showUploadScreen);
elements.loadRetry.addEventListener('click', showUploadScreen);
elements.stepFileSelect.addEventListener('change', () => {
  const entry = state.stepFiles.find((candidate) => candidate.path === elements.stepFileSelect.value);
  if (entry && entry.path !== state.activeFile?.path) {
    state.detectionReason = '使用者從 ZIP 檔案清單切換';
    loadStepFile(entry);
  }
});
elements.partSearch.addEventListener('input', (event) => {
  state.search = event.currentTarget.value;
  if (state.manifest) renderPartList();
});
$$('[data-action]').forEach((button) => button.addEventListener('click', () => handleToolbar(button.dataset.action)));
$$('[data-view]').forEach((button) => button.addEventListener('click', () => state.ready && setView(button.dataset.view)));
elements.explodeRange.addEventListener('input', (event) => {
  const percent = Number(event.currentTarget.value);
  elements.explodeOutput.value = `${percent}%`;
  if (state.ready) {
    if (percent > 0 && state.measurement.enabled) setMeasurementMode(false);
    applyExplode(percent / 100);
  }
});

elements.canvas.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});
elements.canvas.addEventListener('pointerup', (event) => {
  if (!state.ready || !pointerDown) return;
  const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (movement > 5 || event.button !== 0) return;
  const bounds = elements.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(modelRoot.children, true)
    .find((intersection) => intersection.object.isMesh && isVisibleInHierarchy(intersection.object));
  if (state.measurement.enabled) {
    if (hit) addMeasurementPoint(hit.point);
    else showMessage('請點選可見的模型表面');
    return;
  }
  if (hit?.object?.userData?.partKey) selectPart(hit.object.userData.partKey);
  else clearSelection();
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === 'Escape') {
    if (state.measurement.enabled) setMeasurementMode(false);
    else if (state.ready) clearSelection();
  }
  if (!state.ready) return;
  if (event.key.toLocaleLowerCase() === 'f') fitAll();
  if (event.key.toLocaleLowerCase() === 'i') isolateSelected();
  if (event.key.toLocaleLowerCase() === 'h') hideSelected();
  if (event.key.toLocaleLowerCase() === 'm') setMeasurementMode(!state.measurement.enabled);
});

function openPanel(id) {
  $$('.panel[data-open="true"]').forEach((panel) => panel.removeAttribute('data-open'));
  $(`#${id}`).setAttribute('data-open', 'true');
}

function closePanelOnMobile(id) {
  if (window.matchMedia('(max-width: 900px)').matches) $(`#${id}`).removeAttribute('data-open');
}

$('#open-navigator').addEventListener('click', () => openPanel('navigator-panel'));
$('#open-details').addEventListener('click', () => openPanel('detail-panel'));
$$('[data-close-panel]').forEach((button) => {
  button.addEventListener('click', () => $(`#${button.dataset.closePanel}`).removeAttribute('data-open'));
});

window.addEventListener('beforeunload', () => {
  state.currentWorker?.terminate();
  state.downloadUrls.forEach((url) => URL.revokeObjectURL(url));
});

if (window.location.protocol === 'file:') {
  showUploadError('請透過 GitHub Pages 或本機 HTTP 伺服器開啟；WebAssembly 無法從 file:// 安全載入。');
}

trackUsage('page_view');
