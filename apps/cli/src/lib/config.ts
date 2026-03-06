import { mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliConfig {
  apiUrl: string;
  defaultPackageType: string;
  defaultAssemblyLine: string;
}

export type CliConfigKey = keyof CliConfig;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CliConfig = {
  apiUrl: 'http://localhost:3000/api',
  defaultPackageType: '',
  defaultAssemblyLine: '',
};

const VALID_KEYS: readonly CliConfigKey[] = [
  'apiUrl',
  'defaultPackageType',
  'defaultAssemblyLine',
] as const;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getConfigDir(): string {
  return join(homedir(), '.smithy');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function isValidKey(key: string): key is CliConfigKey {
  return VALID_KEYS.includes(key as CliConfigKey);
}

// ---------------------------------------------------------------------------
// Internal I/O
// ---------------------------------------------------------------------------

async function ensureConfigDir(): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true });
}

async function readConfigFile(): Promise<CliConfig> {
  try {
    const file = Bun.file(getConfigPath());
    const raw = await file.text();
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error: unknown) {
    const isNotFound =
      error instanceof Error &&
      ('code' in error
        ? (error as NodeJS.ErrnoException).code === 'ENOENT'
        : error.message.includes('No such file or directory'));

    if (!isNotFound) {
      console.warn(
        'Warning: config file is corrupted or unreadable, using defaults.',
      );
    }

    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfigFile(config: CliConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(getConfigPath(), JSON.stringify(config, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function get<K extends CliConfigKey>(
  key: K,
): Promise<CliConfig[K]> {
  const config = await readConfigFile();
  return config[key];
}

export async function set<K extends CliConfigKey>(
  key: K,
  value: CliConfig[K],
): Promise<void> {
  const config = await readConfigFile();
  config[key] = value;
  await writeConfigFile(config);
}

export async function list(): Promise<CliConfig> {
  return readConfigFile();
}

export async function initialize(): Promise<void> {
  const path = getConfigPath();
  const file = Bun.file(path);
  const exists = await file.exists();
  if (!exists) {
    await writeConfigFile({ ...DEFAULT_CONFIG });
  }
}
