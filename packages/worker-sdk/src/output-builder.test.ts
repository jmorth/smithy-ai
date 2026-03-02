import { describe, it, expect } from 'vitest';
import { OutputBuilderImpl } from './output-builder.js';

describe('OutputBuilderImpl', () => {
  describe('addFile', () => {
    it('adds a file with default mime type', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE');
      builder.addFile('main.ts', 'console.log("hello")');

      const output = builder.build();
      expect(output.files).toHaveLength(1);
      expect(output.files[0]).toEqual({
        filename: 'main.ts',
        content: 'console.log("hello")',
        mimeType: 'application/octet-stream',
      });
    });

    it('adds a file with a custom mime type', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('IMAGE');
      builder.addFile('logo.png', Buffer.from('png-data'), 'image/png');

      const output = builder.build();
      expect(output.files[0]?.mimeType).toBe('image/png');
    });

    it('adds multiple files', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE');
      builder.addFile('a.ts', 'a');
      builder.addFile('b.ts', 'b');
      builder.addFile('c.ts', 'c');

      const output = builder.build();
      expect(output.files).toHaveLength(3);
      expect(output.files.map((f) => f.filename)).toEqual([
        'a.ts',
        'b.ts',
        'c.ts',
      ]);
    });

    it('supports Buffer content', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE');
      const buf = Buffer.from([0x00, 0x01, 0x02]);
      builder.addFile('binary.dat', buf);

      const output = builder.build();
      expect(output.files[0]?.content).toBe(buf);
    });

    it('returns this for chaining', () => {
      const builder = new OutputBuilderImpl();
      const result = builder.addFile('f.txt', 'content');
      expect(result).toBe(builder);
    });
  });

  describe('setMetadata', () => {
    it('sets a metadata key-value pair', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('SPECIFICATION');
      builder.setMetadata('author', 'test-worker');

      const output = builder.build();
      expect(output.metadata).toEqual({ author: 'test-worker' });
    });

    it('sets multiple metadata keys', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE');
      builder.setMetadata('key1', 'value1');
      builder.setMetadata('key2', 42);

      const output = builder.build();
      expect(output.metadata).toEqual({ key1: 'value1', key2: 42 });
    });

    it('overwrites existing metadata keys', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE');
      builder.setMetadata('key', 'original');
      builder.setMetadata('key', 'overwritten');

      const output = builder.build();
      expect(output.metadata).toEqual({ key: 'overwritten' });
    });

    it('returns this for chaining', () => {
      const builder = new OutputBuilderImpl();
      const result = builder.setMetadata('k', 'v');
      expect(result).toBe(builder);
    });
  });

  describe('setType', () => {
    it('sets the output package type', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('PULL_REQUEST');

      const output = builder.build();
      expect(output.type).toBe('PULL_REQUEST');
    });

    it('allows overwriting the type', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE');
      builder.setType('IMAGE');

      const output = builder.build();
      expect(output.type).toBe('IMAGE');
    });

    it('returns this for chaining', () => {
      const builder = new OutputBuilderImpl();
      const result = builder.setType('CODE');
      expect(result).toBe(builder);
    });
  });

  describe('build', () => {
    it('throws if type has not been set', () => {
      const builder = new OutputBuilderImpl();

      expect(() => builder.build()).toThrow(
        'Output type must be set before building',
      );
    });

    it('returns a PackageOutput with empty files and metadata by default', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('USER_INPUT');

      const output = builder.build();
      expect(output).toEqual({
        type: 'USER_INPUT',
        files: [],
        metadata: {},
      });
    });

    it('returns a complete PackageOutput when all fields are set', () => {
      const builder = new OutputBuilderImpl();
      builder
        .setType('SPECIFICATION')
        .addFile('spec.md', '# Spec', 'text/markdown')
        .setMetadata('version', 1);

      const output = builder.build();
      expect(output).toEqual({
        type: 'SPECIFICATION',
        files: [
          { filename: 'spec.md', content: '# Spec', mimeType: 'text/markdown' },
        ],
        metadata: { version: 1 },
      });
    });

    it('returns a defensive copy of files (mutation does not affect builder)', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE').addFile('a.ts', 'a');

      const output1 = builder.build();
      output1.files.push({
        filename: 'injected.ts',
        content: 'evil',
        mimeType: 'text/plain',
      });

      const output2 = builder.build();
      expect(output2.files).toHaveLength(1);
    });

    it('returns a defensive copy of metadata (mutation does not affect builder)', () => {
      const builder = new OutputBuilderImpl();
      builder.setType('CODE').setMetadata('key', 'value');

      const output1 = builder.build();
      output1.metadata['injected'] = true;

      const output2 = builder.build();
      expect(output2.metadata).toEqual({ key: 'value' });
    });

    it('supports full chaining', () => {
      const output = new OutputBuilderImpl()
        .setType('CODE')
        .addFile('index.ts', 'export {}')
        .setMetadata('lang', 'typescript')
        .build();

      expect(output.type).toBe('CODE');
      expect(output.files).toHaveLength(1);
      expect(output.metadata).toEqual({ lang: 'typescript' });
    });
  });
});
