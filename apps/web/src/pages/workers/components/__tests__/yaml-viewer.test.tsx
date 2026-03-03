import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import YamlViewer from '../yaml-viewer';

describe('YamlViewer', () => {
  it('renders keys with blue text styling', () => {
    render(<YamlViewer config={{ name: 'Summarizer' }} />);
    const key = screen.getByText('name');
    expect(key.className).toContain('text-blue-600');
  });

  it('renders string values with green text styling', () => {
    render(<YamlViewer config={{ name: 'Summarizer' }} />);
    const value = screen.getByText('Summarizer');
    expect(value.className).toContain('text-green-600');
  });

  it('renders number values with orange text styling', () => {
    render(<YamlViewer config={{ timeout: 300 }} />);
    const value = screen.getByText('300');
    expect(value.className).toContain('text-orange-600');
  });

  it('renders boolean values with purple text styling', () => {
    render(<YamlViewer config={{ enabled: true }} />);
    const value = screen.getByText('true');
    expect(value.className).toContain('text-purple-600');
  });

  it('renders nested objects', () => {
    render(
      <YamlViewer
        config={{
          provider: { name: 'openai', model: 'gpt-4' },
        }}
      />,
    );
    expect(screen.getByText('provider')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('renders arrays with dash markers', () => {
    render(
      <YamlViewer
        config={{
          inputTypes: ['text', 'pdf'],
        }}
      />,
    );
    const viewer = screen.getByTestId('yaml-viewer');
    expect(viewer.textContent).toContain('- text');
    expect(viewer.textContent).toContain('- pdf');
  });

  it('renders empty config message', () => {
    render(<YamlViewer config={{}} />);
    expect(screen.getByText('No configuration')).toBeInTheDocument();
  });

  it('renders inside a pre/code block', () => {
    render(<YamlViewer config={{ name: 'Test' }} />);
    const pre = screen.getByTestId('yaml-viewer').querySelector('pre');
    expect(pre).toBeInTheDocument();
    const code = pre?.querySelector('code');
    expect(code).toBeInTheDocument();
  });

  it('renders a complete worker config', () => {
    const config = {
      name: 'Summarizer',
      inputTypes: ['text', 'pdf'],
      outputType: 'text',
      provider: {
        name: 'openai',
        model: 'gpt-4',
        apiKeyEnv: 'OPENAI_API_KEY',
      },
      timeout: 300,
    };
    render(<YamlViewer config={config} />);

    // Check all top-level keys are present
    // "name" appears twice (root level + provider.name), so use getAllByText
    const nameElements = screen.getAllByText('name');
    expect(nameElements.length).toBe(2);
    expect(screen.getByText('inputTypes')).toBeInTheDocument();
    expect(screen.getByText('outputType')).toBeInTheDocument();
    expect(screen.getByText('provider')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });

  it('renders null values', () => {
    render(<YamlViewer config={{ value: null }} />);
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('renders empty arrays', () => {
    render(<YamlViewer config={{ tools: [] }} />);
    expect(screen.getByText('[]')).toBeInTheDocument();
  });

  it('renders empty objects', () => {
    render(<YamlViewer config={{ overrides: {} }} />);
    expect(screen.getByText('{}')).toBeInTheDocument();
  });

  it('renders arrays of objects with key-value pairs', () => {
    render(
      <YamlViewer
        config={{
          steps: [
            { name: 'step-1', timeout: 30 },
            { name: 'step-2', timeout: 60 },
          ],
        }}
      />,
    );
    const viewer = screen.getByTestId('yaml-viewer');
    expect(viewer.textContent).toContain('-  name');
    expect(screen.getByText('step-1')).toBeInTheDocument();
    expect(screen.getByText('step-2')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('renders nested object with null value in object branch', () => {
    render(
      <YamlViewer
        config={{
          settings: { retries: null, verbose: true },
        }}
      />,
    );
    expect(screen.getByText('null')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('renders undefined values as null', () => {
    render(<YamlViewer config={{ missing: undefined }} />);
    expect(screen.getByText('null')).toBeInTheDocument();
  });
});
