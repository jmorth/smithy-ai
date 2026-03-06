import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test';
import { rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as os from 'os';

import {
  get,
  set,
  list,
  initialize,
  getConfigDir,
  getConfigPath,
  isValidKey,
} from './config.js';

let testHome: string;
let homedirSpy: ReturnType<typeof spyOn>;
let consoleWarnSpy: ReturnType<typeof spyOn>;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  testHome = join(
    tmpdir(),
    `smithy-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testHome, { recursive: true });

  homedirSpy = spyOn(os, 'homedir').mockReturnValue(testHome);
  consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  homedirSpy.mockRestore();
  consoleWarnSpy.mockRestore();

  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
});

// ---------------------------------------------------------------------------
// getConfigDir / getConfigPath
// ---------------------------------------------------------------------------

describe('getConfigDir', () => {
  it('returns ~/.smithy', () => {
    expect(getConfigDir()).toBe(join(testHome, '.smithy'));
  });
});

describe('getConfigPath', () => {
  it('returns ~/.smithy/config.json', () => {
    expect(getConfigPath()).toBe(join(testHome, '.smithy', 'config.json'));
  });
});

// ---------------------------------------------------------------------------
// isValidKey
// ---------------------------------------------------------------------------

describe('isValidKey', () => {
  it('returns true for apiUrl', () => {
    expect(isValidKey('apiUrl')).toBe(true);
  });

  it('returns true for defaultPackageType', () => {
    expect(isValidKey('defaultPackageType')).toBe(true);
  });

  it('returns true for defaultAssemblyLine', () => {
    expect(isValidKey('defaultAssemblyLine')).toBe(true);
  });

  it('returns false for unknown keys', () => {
    expect(isValidKey('unknownKey')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidKey('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('get', () => {
  it('returns default apiUrl when config file does not exist', async () => {
    const value = await get('apiUrl');
    expect(value).toBe('http://localhost:3000/api');
  });

  it('returns default defaultPackageType when config file does not exist', async () => {
    const value = await get('defaultPackageType');
    expect(value).toBe('');
  });

  it('returns default defaultAssemblyLine when config file does not exist', async () => {
    const value = await get('defaultAssemblyLine');
    expect(value).toBe('');
  });

  it('returns stored value from config file', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ apiUrl: 'http://custom:9000/api' }),
    );

    const value = await get('apiUrl');
    expect(value).toBe('http://custom:9000/api');
  });

  it('returns default for keys not present in config file', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ apiUrl: 'http://custom:9000/api' }),
    );

    const value = await get('defaultPackageType');
    expect(value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

describe('set', () => {
  it('writes a value to config file', async () => {
    await set('apiUrl', 'http://new-api:5000/api');
    const value = await get('apiUrl');
    expect(value).toBe('http://new-api:5000/api');
  });

  it('preserves existing keys when setting a new value', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({
        apiUrl: 'http://existing:3000/api',
        defaultPackageType: 'review',
      }),
    );

    await set('defaultAssemblyLine', 'my-line');

    const apiUrl = await get('apiUrl');
    const pkgType = await get('defaultPackageType');
    const line = await get('defaultAssemblyLine');

    expect(apiUrl).toBe('http://existing:3000/api');
    expect(pkgType).toBe('review');
    expect(line).toBe('my-line');
  });

  it('creates ~/.smithy/ directory if it does not exist', async () => {
    const configDir = join(testHome, '.smithy');
    expect(existsSync(configDir)).toBe(false);

    await set('apiUrl', 'http://test:3000/api');

    expect(existsSync(configDir)).toBe(true);
  });

  it('creates config.json if it does not exist', async () => {
    const configPath = join(testHome, '.smithy', 'config.json');
    expect(existsSync(configPath)).toBe(false);

    await set('apiUrl', 'http://test:3000/api');

    expect(existsSync(configPath)).toBe(true);
  });

  it('writes JSON with 2-space indentation', async () => {
    await set('apiUrl', 'http://test:3000/api');

    const raw = await Bun.file(getConfigPath()).text();
    expect(raw).toContain('  "apiUrl"');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('overwrites existing value', async () => {
    await set('apiUrl', 'http://first:3000/api');
    await set('apiUrl', 'http://second:3000/api');
    const value = await get('apiUrl');
    expect(value).toBe('http://second:3000/api');
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('list', () => {
  it('returns defaults when config file does not exist', async () => {
    const config = await list();
    expect(config).toEqual({
      apiUrl: 'http://localhost:3000/api',
      defaultPackageType: '',
      defaultAssemblyLine: '',
    });
  });

  it('returns merged config with defaults', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ apiUrl: 'http://custom:9000/api' }),
    );

    const config = await list();
    expect(config).toEqual({
      apiUrl: 'http://custom:9000/api',
      defaultPackageType: '',
      defaultAssemblyLine: '',
    });
  });

  it('returns full config when all keys are set', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({
        apiUrl: 'http://custom:9000/api',
        defaultPackageType: 'review',
        defaultAssemblyLine: 'my-line',
      }),
    );

    const config = await list();
    expect(config).toEqual({
      apiUrl: 'http://custom:9000/api',
      defaultPackageType: 'review',
      defaultAssemblyLine: 'my-line',
    });
  });
});

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

describe('initialize', () => {
  it('creates config directory and file with defaults', async () => {
    await initialize();

    expect(existsSync(getConfigDir())).toBe(true);
    expect(existsSync(getConfigPath())).toBe(true);

    const raw = await Bun.file(getConfigPath()).text();
    const config = JSON.parse(raw);
    expect(config).toEqual({
      apiUrl: 'http://localhost:3000/api',
      defaultPackageType: '',
      defaultAssemblyLine: '',
    });
  });

  it('does not overwrite existing config file', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    const customConfig = { apiUrl: 'http://dont-overwrite:3000/api' };
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify(customConfig),
    );

    await initialize();

    const raw = await Bun.file(getConfigPath()).text();
    const config = JSON.parse(raw);
    expect(config.apiUrl).toBe('http://dont-overwrite:3000/api');
  });
});

// ---------------------------------------------------------------------------
// Corrupted config handling
// ---------------------------------------------------------------------------

describe('corrupted config handling', () => {
  it('returns defaults when config file contains invalid JSON', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), 'not valid json{{{');

    const value = await get('apiUrl');
    expect(value).toBe('http://localhost:3000/api');
  });

  it('logs a warning when config file contains invalid JSON', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{{invalid}}');

    await list();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Warning: config file is corrupted or unreadable, using defaults.',
    );
  });

  it('does not log warning when config file simply does not exist', async () => {
    await get('apiUrl');

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('returns defaults when config file is empty', async () => {
    const configDir = join(testHome, '.smithy');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '');

    const config = await list();
    expect(config).toEqual({
      apiUrl: 'http://localhost:3000/api',
      defaultPackageType: '',
      defaultAssemblyLine: '',
    });
  });
});

// ---------------------------------------------------------------------------
// homedir usage
// ---------------------------------------------------------------------------

describe('homedir usage', () => {
  it('uses os.homedir() to resolve config directory', () => {
    getConfigDir();
    expect(homedirSpy).toHaveBeenCalled();
  });
});
