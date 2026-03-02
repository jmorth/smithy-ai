import { describe, it, expect } from 'vitest'
import config, { base } from '../index.js'

describe('@smithy/eslint-config', () => {
  describe('default export', () => {
    it('exports an array', () => {
      expect(Array.isArray(config)).toBe(true)
    })

    it('exports at least one config object', () => {
      expect(config.length).toBeGreaterThan(0)
    })

    it('each item is a plain object', () => {
      for (const item of config) {
        expect(typeof item).toBe('object')
        expect(item).not.toBeNull()
      }
    })
  })

  describe('named export: base', () => {
    it('base is the same array as the default export', () => {
      expect(base).toBe(config)
    })
  })

  describe('TypeScript config object', () => {
    const tsConfig = config.find(c => c.plugins?.['@typescript-eslint'])

    it('includes @typescript-eslint plugin', () => {
      expect(tsConfig).toBeDefined()
    })

    it('includes TypeScript parser', () => {
      expect(tsConfig?.languageOptions?.parser).toBeDefined()
    })

    it('files pattern targets JS and TS files', () => {
      expect(tsConfig?.files).toBeDefined()
      const pattern = tsConfig?.files?.join(',') ?? ''
      expect(pattern).toContain('ts')
      expect(pattern).toContain('js')
    })

    it('no-unused-vars rule is set to warn', () => {
      const rule = tsConfig?.rules?.['@typescript-eslint/no-unused-vars']
      expect(rule).toBeDefined()
      const severity = Array.isArray(rule) ? rule[0] : rule
      expect(severity).toBe('warn')
    })

    it('no-explicit-any rule is set to warn', () => {
      const rule = tsConfig?.rules?.['@typescript-eslint/no-explicit-any']
      expect(rule).toBe('warn')
    })

    it('consistent-type-imports rule is set to error', () => {
      const rule = tsConfig?.rules?.['@typescript-eslint/consistent-type-imports']
      const severity = Array.isArray(rule) ? rule[0] : rule
      expect(severity).toBe('error')
    })

    it('prefer-const rule is set to error', () => {
      expect(tsConfig?.rules?.['prefer-const']).toBe('error')
    })

    it('no-var rule is set to error', () => {
      expect(tsConfig?.rules?.['no-var']).toBe('error')
    })
  })

  describe('prettier config', () => {
    it('includes prettier config as the last item', () => {
      const last = config[config.length - 1]
      expect(last).toBeDefined()
      // eslint-config-prettier disables rules that conflict with prettier
      // 'curly' is one of the rules explicitly disabled (set to 0/off)
      expect(last?.rules?.['curly']).toBe(0)
    })
  })
})
