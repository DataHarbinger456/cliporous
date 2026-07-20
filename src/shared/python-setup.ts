export const PYTHON_MODEL_NAME = 'nvidia/parakeet-tdt-0.6b-v3';

export const PYTHON_SETUP_DOWNLOAD_MIN_BYTES = 2 * 1024 ** 3;
export const PYTHON_SETUP_DOWNLOAD_MAX_BYTES = 3 * 1024 ** 3;
export const PYTHON_SETUP_REQUIRED_FREE_BYTES = 6 * 1024 ** 3;

export type PythonSetupStage =
  | 'downloading-python'
  | 'extracting'
  | 'creating-venv'
  | 'installing-packages'
  | 'downloading-model'
  | 'verifying';

export interface PythonSetupStatus {
  ready: boolean;
  stage: 'ready' | 'not-setup' | 'incomplete';
  storagePath: string;
  freeDiskBytes: number;
  networkOnline: boolean;
  venvPath: string | null;
  embeddedPythonAvailable: boolean;
}

export interface PythonSetupProgress {
  stage: PythonSetupStage;
  message: string;
  percent: number;
  package?: string;
  currentPackage?: number;
  totalPackages?: number;
}

export type PythonSetupStartResult =
  | { started: true }
  | { started: false; reason: 'already-running' | 'offline' | 'low-disk' };

export interface PythonSetupDone {
  success: boolean;
  canceled?: boolean;
  error?: string;
}
