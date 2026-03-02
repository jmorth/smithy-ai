import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InputPackageImpl } from './input-package.js';

// Mock the fs module
vi.mock('node:fs');

const INPUT_DIR = '/input';

describe('InputPackageImpl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getFile', () => {
    it('reads a file as a Buffer from the input directory', () => {
      const fileContent = Buffer.from('hello world');
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

      const input = new InputPackageImpl(INPUT_DIR, {});
      const result = input.getFile('test.txt');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(INPUT_DIR, 'test.txt'),
      );
      expect(result).toBe(fileContent);
    });

    it('throws when the file does not exist', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const input = new InputPackageImpl(INPUT_DIR, {});

      expect(() => input.getFile('missing.txt')).toThrow('ENOENT');
    });

    it('reads files with nested paths', () => {
      const fileContent = Buffer.from('nested content');
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent);

      const input = new InputPackageImpl(INPUT_DIR, {});
      input.getFile('subdir/nested.txt');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(INPUT_DIR, 'subdir/nested.txt'),
      );
    });
  });

  describe('getFileAsString', () => {
    it('reads a file as a UTF-8 string from the input directory', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('string content');

      const input = new InputPackageImpl(INPUT_DIR, {});
      const result = input.getFileAsString('readme.md');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(INPUT_DIR, 'readme.md'),
        'utf-8',
      );
      expect(result).toBe('string content');
    });

    it('throws when the file does not exist', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const input = new InputPackageImpl(INPUT_DIR, {});

      expect(() => input.getFileAsString('missing.md')).toThrow('ENOENT');
    });
  });

  describe('listFiles', () => {
    it('returns file names from the input directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdirSync).mockReturnValue(['file1.txt', 'file2.md'] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
      } as fs.Stats);

      const input = new InputPackageImpl(INPUT_DIR, {});
      const result = input.listFiles();

      expect(result).toEqual(['file1.txt', 'file2.md']);
    });

    it('filters out directories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdirSync).mockReturnValue(['file.txt', 'subdir'] as any);
      vi.mocked(fs.statSync).mockImplementation((p) => {
        const name = path.basename(p as string);
        return {
          isFile: () => name === 'file.txt',
        } as fs.Stats;
      });

      const input = new InputPackageImpl(INPUT_DIR, {});
      const result = input.listFiles();

      expect(result).toEqual(['file.txt']);
    });

    it('returns empty array when input directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const input = new InputPackageImpl(INPUT_DIR, {});
      const result = input.listFiles();

      expect(result).toEqual([]);
    });

    it('returns empty array when directory is empty', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const input = new InputPackageImpl(INPUT_DIR, {});
      const result = input.listFiles();

      expect(result).toEqual([]);
    });
  });

  describe('getMetadata', () => {
    it('returns a copy of the metadata', () => {
      const metadata = { key: 'value', nested: { a: 1 } };
      const input = new InputPackageImpl(INPUT_DIR, metadata);

      const result = input.getMetadata();

      expect(result).toEqual(metadata);
    });

    it('returns a shallow copy (mutations do not affect original)', () => {
      const metadata = { key: 'value' };
      const input = new InputPackageImpl(INPUT_DIR, metadata);

      const result = input.getMetadata();
      result['key'] = 'mutated';

      expect(input.getMetadata()).toEqual({ key: 'value' });
    });

    it('returns empty object when no metadata is provided', () => {
      const input = new InputPackageImpl(INPUT_DIR, {});
      expect(input.getMetadata()).toEqual({});
    });
  });
});
