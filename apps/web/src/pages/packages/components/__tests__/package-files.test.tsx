import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { PackageFiles } from '../package-files';
import * as client from '@/api/client';
import type { PackageFile } from '@smithy/shared';

vi.mock('@/api/client', () => ({
  packages: {
    getDownloadUrl: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

function makeFile(overrides: Partial<PackageFile> = {}): PackageFile {
  return {
    id: 'f1',
    packageId: 'pkg-1',
    fileKey: 'packages/pkg-1/file.txt',
    filename: 'file.txt',
    mimeType: 'text/plain',
    sizeBytes: 1024,
    createdAt: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

function renderFiles(files: PackageFile[], packageId = 'pkg-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PackageFiles files={files} packageId={packageId} />
    </QueryClientProvider>,
  );
}

describe('PackageFiles', () => {
  it('shows no files message when empty', () => {
    renderFiles([]);
    expect(screen.getByTestId('no-files')).toBeInTheDocument();
  });

  it('renders file name', () => {
    renderFiles([makeFile()]);
    expect(screen.getByText('file.txt')).toBeInTheDocument();
  });

  it('formats size in KB', () => {
    renderFiles([makeFile({ sizeBytes: 2048 })]);
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('formats size in MB', () => {
    renderFiles([makeFile({ sizeBytes: 1048576 })]);
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('formats size in B', () => {
    renderFiles([makeFile({ sizeBytes: 500 })]);
    expect(screen.getByText('500 B')).toBeInTheDocument();
  });

  it('shows MIME type badge', () => {
    renderFiles([makeFile()]);
    expect(screen.getByText('text/plain')).toBeInTheDocument();
  });

  it('shows preview button for text files', () => {
    renderFiles([makeFile({ mimeType: 'text/plain' })]);
    expect(screen.getByTestId('preview-toggle-f1')).toBeInTheDocument();
  });

  it('shows preview button for JSON files', () => {
    renderFiles([makeFile({ id: 'f-json', mimeType: 'application/json' })]);
    expect(screen.getByTestId('preview-toggle-f-json')).toBeInTheDocument();
  });

  it('shows preview button for YAML files', () => {
    renderFiles([makeFile({ id: 'f-yaml', mimeType: 'application/yaml' })]);
    expect(screen.getByTestId('preview-toggle-f-yaml')).toBeInTheDocument();
  });

  it('shows preview button for image files', () => {
    renderFiles([makeFile({ id: 'f-img', mimeType: 'image/png' })]);
    expect(screen.getByTestId('preview-toggle-f-img')).toBeInTheDocument();
  });

  it('does not show preview button for binary files', () => {
    renderFiles([
      makeFile({ id: 'f-bin', mimeType: 'application/octet-stream' }),
    ]);
    expect(
      screen.queryByTestId('preview-toggle-f-bin'),
    ).not.toBeInTheDocument();
  });

  it('shows download button', () => {
    renderFiles([makeFile()]);
    expect(screen.getByTestId('download-f1')).toBeInTheDocument();
  });

  it('toggles text preview open/close', async () => {
    const user = userEvent.setup();
    renderFiles([makeFile()]);

    await user.click(screen.getByTestId('preview-toggle-f1'));
    expect(screen.getByTestId('preview-f1')).toBeInTheDocument();

    await user.click(screen.getByTestId('preview-toggle-f1'));
    expect(screen.queryByTestId('preview-f1')).not.toBeInTheDocument();
  });

  it('toggles image preview showing img tag', async () => {
    const user = userEvent.setup();
    renderFiles([makeFile({ id: 'f-img', mimeType: 'image/jpeg', filename: 'photo.jpg' })]);

    await user.click(screen.getByTestId('preview-toggle-f-img'));
    const preview = screen.getByTestId('preview-f-img');
    expect(preview.querySelector('img')).toBeInTheDocument();
  });

  it('calls download API when download clicked', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.mocked(client.packages.getDownloadUrl).mockResolvedValue({
      downloadUrl: 'https://s3.example.com/file',
    });

    renderFiles([makeFile()]);
    await user.click(screen.getByTestId('download-f1'));

    expect(client.packages.getDownloadUrl).toHaveBeenCalledWith('pkg-1', 'f1');
    openSpy.mockRestore();
  });

  it('renders multiple files', () => {
    renderFiles([
      makeFile({ id: 'f1', filename: 'a.txt' }),
      makeFile({ id: 'f2', filename: 'b.txt' }),
    ]);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
  });

  it('shows x-yaml as previewable', () => {
    renderFiles([makeFile({ id: 'f-xyaml', mimeType: 'application/x-yaml' })]);
    expect(screen.getByTestId('preview-toggle-f-xyaml')).toBeInTheDocument();
  });

  it('shows xml as previewable', () => {
    renderFiles([makeFile({ id: 'f-xml', mimeType: 'application/xml' })]);
    expect(screen.getByTestId('preview-toggle-f-xml')).toBeInTheDocument();
  });
});
