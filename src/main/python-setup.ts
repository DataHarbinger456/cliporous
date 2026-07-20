import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Ch } from '@shared/ipc-channels';
import {
  PYTHON_MODEL_NAME,
  PYTHON_SETUP_REQUIRED_FREE_BYTES,
  type PythonSetupProgress,
  type PythonSetupStartResult,
  type PythonSetupStatus,
} from '@shared/python-setup';
import { app, BrowserWindow, net, type WebContents } from 'electron';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Root directory for the auto-managed Python env inside userData. */
function getPythonEnvDir(): string {
  const dir = join(app.getPath('userData'), 'python-env');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path to the venv inside the python-env directory. */
function getVenvDir(): string {
  return join(getPythonEnvDir(), 'venv');
}

/** Stamp proving that the exact requirements and speech model were installed. */
function getStampPath(): string {
  return join(getPythonEnvDir(), 'setup.sha256');
}

function getSetupDigest(): string | null {
  try {
    const requirements = readFileSync(getRequirementsPath());
    return createHash('sha256')
      .update(requirements)
      .update(`\nmodel=${PYTHON_MODEL_NAME}\ncontract=setup-01-v1`)
      .digest('hex');
  } catch {
    return null;
  }
}

/** Read the stamped digest from a previous successful install, or `null`. */
function readStamp(): string | null {
  try {
    return readFileSync(getStampPath(), 'utf-8').trim();
  } catch {
    return null;
  }
}

/** Persist the current requirements digest as a stamp marking install success. */
function writeStamp(digest: string): void {
  try {
    writeFileSync(getStampPath(), digest, 'utf-8');
  } catch (err) {
    console.warn('[PythonSetup] Failed to write stamp:', (err as Error).message);
  }
}

/** Path to the venv Python binary. */
function getVenvPythonPath(): string {
  const venvDir = getVenvDir();
  return process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');
}

/**
 * On Windows with embedded Python, we install packages directly into the
 * embedded distribution (no venv). This returns the embedded python.exe path
 * which is also the "active" Python for running scripts.
 */
function getEffectivePythonPath(): string {
  if (process.platform === 'win32') {
    const embeddedExe = getEmbeddedPythonExe();
    if (existsSync(embeddedExe)) return embeddedExe;
  }
  return getVenvPythonPath();
}

/** Resolve the bundled (or dev) requirements.txt path. */
function getRequirementsPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', 'requirements.txt');
  }
  return join(process.cwd(), 'python', 'requirements.txt');
}

function getModelCacheDir(): string {
  const dir = join(getPythonEnvDir(), 'models');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getPythonSetupEnv(): NodeJS.ProcessEnv {
  const modelCache = getModelCacheDir();
  return {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    NEMO_CACHE_DIR: join(modelCache, 'nemo'),
    HF_HOME: join(modelCache, 'huggingface'),
    HUGGINGFACE_HUB_CACHE: join(modelCache, 'huggingface', 'hub'),
  };
}

// ---------------------------------------------------------------------------
// Embedded Python (Windows)
// ---------------------------------------------------------------------------

const PYTHON_VERSION = '3.12.8';
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_DIR_NAME = `python-${PYTHON_VERSION}`;

function getEmbeddedPythonDir(): string {
  return join(getPythonEnvDir(), PYTHON_DIR_NAME);
}

function getEmbeddedPythonExe(): string {
  return join(getEmbeddedPythonDir(), 'python.exe');
}

class SetupCancelledError extends Error {
  constructor() {
    super('Setup canceled');
    this.name = 'SetupCancelledError';
  }
}

interface ActiveSetup {
  canceled: boolean;
  children: Set<ChildProcess>;
  requests: Set<ClientRequest>;
  partialFiles: Set<string>;
}

let activeSetup: ActiveSetup | null = null;
let setupRunPromise: Promise<void> | null = null;

function assertSetupActive(): void {
  if (activeSetup?.canceled) throw new SetupCancelledError();
}

function trackSetupProcess(process: ChildProcess): void {
  const run = activeSetup;
  if (!run) return;
  run.children.add(process);
  process.once('close', () => run.children.delete(process));
  process.once('error', () => run.children.delete(process));
  if (run.canceled) process.kill('SIGTERM');
}

/** Download a file atomically with progress reporting and setup cancellation. */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      assertSetupActive();
    } catch (error) {
      reject(error);
      return;
    }

    const run = activeSetup;
    const partialPath = `${destPath}.download`;
    rmSync(partialPath, { force: true });
    run?.partialFiles.add(partialPath);
    const protocol = url.startsWith('https') ? require('node:https') : require('node:http');
    const request = protocol.get(
      url,
      { headers: { 'User-Agent': 'BatchContent-App' } },
      (res: IncomingMessage) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          run?.partialFiles.delete(partialPath);
          rmSync(partialPath, { force: true });
          downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode}: ${url}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const file = createWriteStream(partialPath);
        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            onProgress?.(Math.round((downloadedBytes / totalBytes) * 100));
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              assertSetupActive();
              rmSync(destPath, { force: true });
              renameSync(partialPath, destPath);
              run?.partialFiles.delete(partialPath);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
        file.on('error', (error) => {
          file.close();
          reject(error);
        });
      },
    ) as ClientRequest;

    run?.requests.add(request);
    request.once('close', () => run?.requests.delete(request));
    request.once('error', reject);
    if (run?.canceled) request.destroy(new SetupCancelledError());
  });
}

/** Extract a zip file to a destination directory (cross-platform). */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  if (process.platform === 'win32') {
    // Use PowerShell's Expand-Archive on Windows
    await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ],
      { timeout: 120_000 },
    );
  } else {
    // Use unzip on macOS/Linux
    await execFileAsync('unzip', ['-o', zipPath, '-d', destDir], { timeout: 120_000 });
  }
}

/**
 * Ensure embedded Python is downloaded and extracted (Windows only).
 * On macOS/Linux this is a no-op — we use system python3.
 */
async function ensureEmbeddedPython(
  onProgress?: (stage: string, message: string, percent: number) => void,
): Promise<string> {
  if (process.platform !== 'win32') {
    return findSystemPython(onProgress);
  }

  const pythonExe = getEmbeddedPythonExe();
  if (existsSync(pythonExe)) {
    console.log('[PythonSetup] Embedded Python already exists:', pythonExe);
    return pythonExe;
  }

  const envDir = getPythonEnvDir();
  const zipPath = join(envDir, `python-${PYTHON_VERSION}-embed-amd64.zip`);

  // Download
  onProgress?.('downloading-python', 'Downloading Python runtime...', 0);
  await downloadFile(PYTHON_ZIP_URL, zipPath, (pct) => {
    onProgress?.('downloading-python', `Downloading Python runtime... ${pct}%`, pct);
  });

  // Extract
  onProgress?.('extracting', 'Extracting Python...', 0);
  const extractDir = getEmbeddedPythonDir();
  await extractZip(zipPath, extractDir);
  onProgress?.('extracting', 'Python extracted', 60);

  // Patch ._pth to enable pip (uncomment "import site")
  const pthName = `python${PYTHON_VERSION.replace(/\./g, '').slice(0, 3)}._pth`;
  const pthPath = join(extractDir, pthName);
  if (existsSync(pthPath)) {
    let pthContent = readFileSync(pthPath, 'utf-8');
    pthContent = pthContent.replace(/^#\s*import site/m, 'import site');
    writeFileSync(pthPath, pthContent, 'utf-8');
    console.log('[PythonSetup] Patched', pthName, 'to enable pip');
  }

  // Install pip via get-pip.py
  const getPipPath = join(envDir, 'get-pip.py');
  onProgress?.('extracting', 'Installing pip...', 50);
  await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath);

  await new Promise<void>((resolve, reject) => {
    assertSetupActive();
    const proc = spawn(pythonExe, [getPipPath], {
      cwd: extractDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getPythonSetupEnv(),
    });
    trackSetupProcess(proc);
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`get-pip.py failed (code ${code}): ${stderr.slice(-500)}`));
      else resolve();
    });
  });

  onProgress?.('extracting', 'Python runtime ready', 100);
  return pythonExe;
}

// ---------------------------------------------------------------------------
// System Python (macOS/Linux)
// ---------------------------------------------------------------------------

/**
 * Probe a candidate python binary and return its (major, minor) version,
 * or null if it can't be executed.
 */
function probePythonVersion(bin: string): { bin: string; major: number; minor: number } | null {
  const { execFileSync: execSync } =
    require('node:child_process') as typeof import('node:child_process');
  try {
    const output = execSync(bin, ['--version'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as string;
    const versionStr = String(output).trim();
    const match = versionStr.match(/Python (\d+)\.(\d+)/);
    const major = match?.[1];
    const minor = match?.[2];
    if (!major || !minor) return null;
    return { bin, major: Number.parseInt(major, 10), minor: Number.parseInt(minor, 10) };
  } catch {
    return null;
  }
}

/** Install the required Python runtime through Homebrew without blocking cancellation. */
async function tryInstallViaHomebrew(
  onProgress?: (stage: string, message: string, percent: number) => void,
): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  const { execFileSync: execSync } =
    require('node:child_process') as typeof import('node:child_process');
  let brewBin: string;
  try {
    brewBin = (
      execSync('command', ['-v', 'brew'], {
        encoding: 'utf-8',
        shell: '/bin/bash' as never,
        timeout: 5_000,
      }) as string
    ).trim();
    if (!brewBin) return null;
  } catch {
    return null;
  }

  onProgress?.('downloading-python', 'Installing the local Python runtime…', 1);
  try {
    await new Promise<void>((resolve, reject) => {
      assertSetupActive();
      const process = spawn(brewBin, ['install', 'python@3.12'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getPythonSetupEnv(),
      });
      trackSetupProcess(process);
      let stderr = '';
      process.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      process.on('error', reject);
      process.on('close', (code) => {
        if (activeSetup?.canceled) reject(new SetupCancelledError());
        else if (code !== 0)
          reject(new Error(`Homebrew exited with code ${code}: ${stderr.slice(-500)}`));
        else resolve();
      });
    });
  } catch (error) {
    if (error instanceof SetupCancelledError) throw error;
    console.warn('[PythonSetup] brew install python@3.12 failed:', (error as Error).message);
    return null;
  }

  for (const candidate of ['/opt/homebrew/bin/python3.12', '/usr/local/bin/python3.12']) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Find a suitable system Python binary.
 *
 * NeMo requires Python >= 3.10 — older Pythons (notably macOS's stock
 * /usr/bin/python3, which is 3.9) cannot install `nemo_toolkit[asr]` because
 * its transitive `youtokentome` dep does not build cleanly. We probe specific
 * versioned candidates first so that we don't get tricked into using whatever
 * `python3` happens to point at.
 *
 * On macOS we will offer to install `python@3.12` via Homebrew if no suitable
 * interpreter is found and `brew` is available.
 */
async function findSystemPython(
  onProgress?: (stage: string, message: string, percent: number) => void,
): Promise<string> {
  // Prefer specific 3.10+ versions over generic `python3`/`python`, which on
  // macOS commonly resolves to 3.9. Order: most-tested first.
  const candidates = ['python3.12', 'python3.11', 'python3.13', 'python3.10', 'python3', 'python'];

  for (const bin of candidates) {
    const probe = probePythonVersion(bin);
    if (probe && probe.major === 3 && probe.minor >= 10) {
      console.log(
        `[PythonSetup] Found system Python: ${probe.bin} (${probe.major}.${probe.minor})`,
      );
      return probe.bin;
    }
  }

  // None of the candidates met the >=3.10 requirement. On macOS, try to
  // install python@3.12 via Homebrew automatically.
  const brewInstalled = await tryInstallViaHomebrew(onProgress);
  if (brewInstalled) return brewInstalled;

  // Last-ditch diagnostic: report what we *did* find so the error message is
  // actionable instead of generic.
  const found =
    candidates
      .map(probePythonVersion)
      .filter((p): p is NonNullable<ReturnType<typeof probePythonVersion>> => p !== null)
      .map((p) => `${p.bin} (${p.major}.${p.minor})`)
      .join(', ') || 'none';

  throw new Error(
    `Python 3.10+ is required but not found (detected: ${found}). ` +
      (process.platform === 'darwin'
        ? 'Install via Homebrew: `brew install python@3.12`, or download from https://python.org'
        : 'Please install Python 3.10+ from https://python.org'),
  );
}

// ---------------------------------------------------------------------------
// Venv creation + pip install
// ---------------------------------------------------------------------------

/**
 * Check if we're using the Windows embedded Python (which has no venv module).
 * In that case we install packages directly into the embedded distribution.
 */
function isUsingEmbeddedPython(pythonBin: string): boolean {
  if (process.platform !== 'win32') return false;
  const embeddedExe = getEmbeddedPythonExe();
  // Normalize paths for comparison
  return pythonBin.toLowerCase() === embeddedExe.toLowerCase();
}

/**
 * Create a venv (or use embedded Python directly on Windows) and install
 * packages from requirements.txt. Sends progress updates via the callback.
 */
async function createVenvAndInstall(
  pythonBin: string,
  onProgress?: (
    stage: string,
    message: string,
    percent: number,
    pkg?: string,
    currentPkg?: number,
    totalPkgs?: number,
  ) => void,
): Promise<string> {
  const useEmbedded = isUsingEmbeddedPython(pythonBin);

  // The Python binary we'll use for pip operations
  let activePython: string;

  if (useEmbedded) {
    // Windows embedded Python: skip venv, install packages directly
    console.log('[PythonSetup] Using embedded Python directly (no venv):', pythonBin);
    onProgress?.('creating-venv', 'Using embedded Python (no venv needed)...', 100);
    activePython = pythonBin;
  } else {
    // macOS/Linux or system Python: create a proper venv
    const venvDir = getVenvDir();
    const venvPython = getVenvPythonPath();

    // If a venv already exists but was created with a Python <3.10, it cannot
    // install nemo_toolkit. Detect and nuke it so we recreate with the new
    // interpreter we just resolved.
    if (existsSync(venvPython)) {
      const existing = probePythonVersion(venvPython);
      if (!existing || existing.major !== 3 || existing.minor < 10) {
        const { rmSync } = require('node:fs') as typeof import('node:fs');
        console.warn(
          `[PythonSetup] Existing venv uses Python ${existing ? `${existing.major}.${existing.minor}` : 'unknown'} — recreating with ${pythonBin}`,
        );
        try {
          rmSync(venvDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }

    if (!existsSync(venvPython)) {
      onProgress?.('creating-venv', 'Creating virtual environment...', 0);
      console.log('[PythonSetup] Creating venv at:', venvDir);

      await new Promise<void>((resolve, reject) => {
        assertSetupActive();
        const proc = spawn(pythonBin, ['-m', 'venv', venvDir], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        trackSetupProcess(proc);
        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code !== 0)
            reject(new Error(`venv creation failed (code ${code}): ${stderr.slice(-500)}`));
          else resolve();
        });
      });

      onProgress?.('creating-venv', 'Virtual environment created', 100);
    }

    activePython = venvPython;
  }

  // Copy requirements.txt to the python-env directory for reference
  const srcReq = getRequirementsPath();
  const destReq = join(getPythonEnvDir(), 'requirements.txt');
  if (existsSync(srcReq)) {
    copyFileSync(srcReq, destReq);
  }

  // Upgrade pip first
  // Cython is included up-front because nemo_toolkit's transitive `youtokentome`
  // dep doesn't declare it as a build requirement and will fail in pip's
  // isolated build env without it. See NVIDIA-NeMo/NeMo discussion #8301.
  onProgress?.(
    'installing-packages',
    'Installing build tools (pip, setuptools, wheel, Cython)...',
    2,
  );
  await new Promise<void>((resolve, reject) => {
    assertSetupActive();
    const proc = spawn(
      activePython,
      ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', 'Cython'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getPythonSetupEnv(),
      },
    );
    trackSetupProcess(proc);
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn('[PythonSetup] pip upgrade warning:', stderr.slice(-300));
      }
      resolve();
    });
  });

  // Install packages from requirements.txt
  onProgress?.('installing-packages', 'Installing AI packages (this may take 10–30 minutes)...', 5);

  await new Promise<void>((resolve, reject) => {
    assertSetupActive();
    const proc = spawn(
      activePython,
      ['-m', 'pip', 'install', '--progress-bar', 'off', '-r', destReq],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getPythonSetupEnv(),
      },
    );
    trackSetupProcess(proc);

    let lineCount = 0;
    let stderr = '';
    let downloadingCount = 0;
    // Known heavy packages with approximate sizes for user-facing labels
    const KNOWN_PACKAGES: Record<string, string> = {
      torch: 'PyTorch (~2 GB)',
      nemo: 'NeMo ASR (~500 MB)',
      nemo_toolkit: 'NeMo Toolkit (~500 MB)',
      mediapipe: 'MediaPipe (~50 MB)',
      opencv: 'OpenCV (~30 MB)',
      'opencv-python': 'OpenCV (~30 MB)',
      'yt-dlp': 'yt-dlp (~15 MB)',
      yt_dlp: 'yt-dlp (~15 MB)',
      numpy: 'NumPy (~20 MB)',
      torchaudio: 'TorchAudio (~200 MB)',
    };

    function getPackageLabel(line: string): string {
      for (const [key, label] of Object.entries(KNOWN_PACKAGES)) {
        if (new RegExp(key, 'i').test(line)) return label;
      }
      // Extract package name from pip output like "Collecting packagename" or "Downloading packagename-x.y.z"
      const match = line.match(/(?:Collecting|Downloading)\s+([\w\-_.]+)/i);
      return match?.[1] ?? line.slice(0, 40);
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        lineCount++;

        // Package installation is the first large portion of setup. Reserve
        // the final third for the actual speech-model download and verification.
        const estimatedPct = Math.min(65, 5 + Math.round((lineCount / 250) * 60));

        let message = 'Installing packages...';
        let pkgLabel: string | undefined;

        if (/^Collecting\s/i.test(trimmed)) {
          downloadingCount++;
          pkgLabel = getPackageLabel(trimmed);
          message = `Resolving ${pkgLabel}...`;
          onProgress?.(
            'installing-packages',
            message,
            estimatedPct,
            pkgLabel,
            downloadingCount,
            undefined,
          );
        } else if (/^Downloading\s/i.test(trimmed)) {
          pkgLabel = getPackageLabel(trimmed);
          // Extract size if present: "Downloading torch-2.0.0.tar.gz (1.2 GB)"
          const sizeMatch = trimmed.match(/\(([^)]+)\)/);
          const sizeLabel = sizeMatch ? ` (${sizeMatch[1]})` : '';
          message = `Downloading ${pkgLabel}${sizeLabel}...`;
          onProgress?.(
            'installing-packages',
            message,
            estimatedPct,
            pkgLabel,
            downloadingCount,
            undefined,
          );
        } else if (/^Installing collected packages/i.test(trimmed)) {
          message = 'Installing collected packages...';
          onProgress?.(
            'installing-packages',
            message,
            Math.max(estimatedPct, 60),
            undefined,
            undefined,
            undefined,
          );
        } else if (/^Building wheel/i.test(trimmed)) {
          pkgLabel = getPackageLabel(trimmed);
          message = `Building ${pkgLabel}...`;
          onProgress?.(
            'installing-packages',
            message,
            estimatedPct,
            pkgLabel,
            undefined,
            undefined,
          );
        } else if (/^Successfully installed/i.test(trimmed)) {
          message = 'All packages installed successfully!';
          onProgress?.('installing-packages', message, 66, undefined, undefined, undefined);
        } else {
          onProgress?.(
            'installing-packages',
            message,
            estimatedPct,
            undefined,
            undefined,
            undefined,
          );
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pip install failed (code ${code}): ${stderr.slice(-1000)}`));
      } else {
        resolve();
      }
    });
  });

  onProgress?.('installing-packages', 'Local content tools installed', 67);
  return activePython;
}

async function downloadSpeechModel(
  activePython: string,
  onProgress?: (stage: string, message: string, percent: number) => void,
): Promise<void> {
  assertSetupActive();
  onProgress?.('downloading-model', 'Downloading the local speech model (largest step)…', 68);

  const script = [
    'import nemo.collections.asr as nemo_asr',
    `model = nemo_asr.models.ASRModel.from_pretrained(model_name=${JSON.stringify(PYTHON_MODEL_NAME)})`,
    'del model',
  ].join('; ');

  await new Promise<void>((resolve, reject) => {
    const process = spawn(activePython, ['-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getPythonSetupEnv(),
    });
    trackSetupProcess(process);
    let stderr = '';

    const reportDownloadOutput = (chunk: Buffer): void => {
      const text = chunk.toString();
      stderr += text;
      const matches = text.match(/\d{1,3}%/g);
      const latestMatch = matches?.[matches.length - 1];
      const latest = latestMatch?.slice(0, -1);
      if (!latest) return;
      const downloadPercent = Math.min(100, Number.parseInt(latest, 10));
      const overallPercent = 68 + Math.round(downloadPercent * 0.24);
      onProgress?.(
        'downloading-model',
        `Downloading the local speech model (${downloadPercent}%)…`,
        Math.min(92, overallPercent),
      );
    };

    process.stdout.on('data', reportDownloadOutput);
    process.stderr.on('data', reportDownloadOutput);
    process.on('error', reject);
    process.on('close', (code) => {
      if (activeSetup?.canceled) {
        reject(new SetupCancelledError());
      } else if (code !== 0) {
        reject(new Error(`Speech model download failed (code ${code}): ${stderr.slice(-1000)}`));
      } else {
        resolve();
      }
    });
  });

  onProgress?.('downloading-model', 'Local speech model downloaded', 93);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function verifyInstallation(): Promise<boolean> {
  const pythonBin = getEffectivePythonPath();
  if (!existsSync(pythonBin)) return false;

  try {
    await execFileAsync(pythonBin, ['-c', 'import nemo; import mediapipe; import yt_dlp'], {
      timeout: 60_000,
      env: getPythonSetupEnv(),
    });
    console.log('[PythonSetup] Verification OK:', pythonBin);
    return true;
  } catch (err) {
    console.warn(
      '[PythonSetup] Verification failed:',
      pythonBin,
      (err as Error).message?.slice(0, 300),
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function quickImportCheck(pythonBin: string): Promise<boolean> {
  if (!existsSync(pythonBin)) return false;
  try {
    await execFileAsync(pythonBin, ['-c', 'import nemo, mediapipe, yt_dlp'], {
      timeout: 15_000,
      env: getPythonSetupEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

function getFreeDiskBytes(): number {
  try {
    const stats = statfsSync(getPythonEnvDir());
    return stats.bavail * stats.bsize;
  } catch {
    return 0;
  }
}

/** Check readiness and the prerequisites shown before an informed setup action. */
export async function checkPythonSetup(): Promise<PythonSetupStatus> {
  const effectivePython = getEffectivePythonPath();
  const pythonExists = existsSync(effectivePython);
  const embeddedExists = process.platform === 'win32' && existsSync(getEmbeddedPythonExe());
  const expectedDigest = getSetupDigest();
  const stampMatches = expectedDigest !== null && readStamp() === expectedDigest;
  const ready = pythonExists && stampMatches && (await quickImportCheck(effectivePython));

  return {
    ready,
    stage: ready ? 'ready' : pythonExists ? 'incomplete' : 'not-setup',
    storagePath: getPythonEnvDir(),
    freeDiskBytes: getFreeDiskBytes(),
    networkOnline: net.isOnline(),
    venvPath: pythonExists ? (embeddedExists ? getEmbeddedPythonDir() : getVenvDir()) : null,
    embeddedPythonAvailable: embeddedExists,
  };
}

function sendSetupEvent(
  sender: WebContents,
  channel: typeof Ch.Send.PYTHON_SETUP_PROGRESS | typeof Ch.Send.PYTHON_SETUP_DONE,
  payload: PythonSetupProgress | { success: boolean; canceled?: boolean; error?: string },
): void {
  const recipients = new Set<WebContents>([sender]);
  for (const window of BrowserWindow.getAllWindows()) recipients.add(window.webContents);
  recipients.forEach((recipient) => {
    if (!recipient.isDestroyed()) recipient.send(channel, payload);
  });
}

function mapSetupStageToOverallPercent(
  stage: PythonSetupProgress['stage'],
  stagePercent: number,
): number {
  const percent = Math.max(0, Math.min(100, stagePercent));
  switch (stage) {
    case 'downloading-python':
      return Math.round(percent * 0.08);
    case 'extracting':
      return 8 + Math.round(percent * 0.04);
    case 'creating-venv':
      return 12 + Math.round(percent * 0.03);
    case 'installing-packages':
      return 15 + Math.round((Math.min(percent, 67) / 67) * 52);
    default:
      return Math.round(percent);
  }
}

/** Run setup only after the renderer has shown preflight details and the user starts it. */
export function runFullSetup(sender: WebContents): Promise<void> {
  if (setupRunPromise) return setupRunPromise;

  activeSetup = {
    canceled: false,
    children: new Set(),
    requests: new Set(),
    partialFiles: new Set(),
  };

  const sendProgress = (
    stage: PythonSetupProgress['stage'],
    message: string,
    percent: number,
    pkg?: string,
    currentPackage?: number,
    totalPackages?: number,
  ): void => {
    sendSetupEvent(sender, Ch.Send.PYTHON_SETUP_PROGRESS, {
      stage,
      message,
      percent,
      ...(pkg ? { package: pkg } : {}),
      ...(currentPackage !== undefined ? { currentPackage } : {}),
      ...(totalPackages !== undefined ? { totalPackages } : {}),
    });
  };

  setupRunPromise = (async () => {
    try {
      sendProgress('downloading-python', 'Checking the local runtime…', 0);
      const pythonBin = await ensureEmbeddedPython((stage, message, percent) => {
        const typedStage = stage as PythonSetupProgress['stage'];
        sendProgress(typedStage, message, mapSetupStageToOverallPercent(typedStage, percent));
      });
      assertSetupActive();

      const activePython = await createVenvAndInstall(
        pythonBin,
        (stage, message, percent, pkg, currentPackage, totalPackages) => {
          const typedStage = stage as PythonSetupProgress['stage'];
          sendProgress(
            typedStage,
            message,
            mapSetupStageToOverallPercent(typedStage, percent),
            pkg,
            currentPackage,
            totalPackages,
          );
        },
      );
      await downloadSpeechModel(activePython, (stage, message, percent) => {
        sendProgress(stage as PythonSetupProgress['stage'], message, percent);
      });
      assertSetupActive();

      sendProgress('verifying', 'Checking that local content tools are ready…', 95);
      if (!(await verifyInstallation())) {
        throw new Error('Verification failed: one or more local content tools could not be loaded');
      }

      const setupDigest = getSetupDigest();
      if (!setupDigest) throw new Error('Could not read the setup requirements');
      writeStamp(setupDigest);
      sendProgress('verifying', 'Local content tools are ready', 100);
      sendSetupEvent(sender, Ch.Send.PYTHON_SETUP_DONE, { success: true });
    } catch (error) {
      if (error instanceof SetupCancelledError || activeSetup?.canceled) {
        sendSetupEvent(sender, Ch.Send.PYTHON_SETUP_DONE, { success: false, canceled: true });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PythonSetup] Setup failed:', message);
      sendSetupEvent(sender, Ch.Send.PYTHON_SETUP_DONE, { success: false, error: message });
    } finally {
      activeSetup?.partialFiles.forEach((partialPath) => {
        rmSync(partialPath, { force: true });
      });
      activeSetup = null;
      setupRunPromise = null;
    }
  })();

  return setupRunPromise;
}

export async function startPythonSetup(sender: WebContents): Promise<PythonSetupStartResult> {
  if (setupRunPromise) return { started: false, reason: 'already-running' };
  if (!net.isOnline()) return { started: false, reason: 'offline' };
  if (getFreeDiskBytes() < PYTHON_SETUP_REQUIRED_FREE_BYTES) {
    return { started: false, reason: 'low-disk' };
  }
  void runFullSetup(sender);
  return { started: true };
}

export function cancelPythonSetup(): { canceled: boolean } {
  const run = activeSetup;
  if (!run || run.canceled) return { canceled: false };

  run.canceled = true;
  run.requests.forEach((request) => {
    request.destroy(new SetupCancelledError());
  });
  run.children.forEach((process) => {
    if (process.exitCode === null) {
      process.kill('SIGTERM');
      setTimeout(() => {
        if (process.exitCode === null) process.kill('SIGKILL');
      }, 5_000);
    }
  });
  run.partialFiles.forEach((partialPath) => {
    rmSync(partialPath, { force: true });
  });
  return { canceled: true };
}

/** Cheap gate used by media IPC handlers. It never installs anything. */
export function isPythonStampedReady(): boolean {
  const effectivePython = getEffectivePythonPath();
  const expectedDigest = getSetupDigest();
  return existsSync(effectivePython) && expectedDigest !== null && readStamp() === expectedDigest;
}

export function getAutoSetupPythonPath(): string | null {
  const effectivePython = getEffectivePythonPath();
  return existsSync(effectivePython) ? effectivePython : null;
}
