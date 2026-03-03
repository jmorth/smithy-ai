import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  PackageSubmitDialog,
  type PackageSubmitTarget,
} from './package-submit-dialog';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  packages: {
    create: vi.fn(),
    getUploadUrl: vi.fn(),
    confirmUpload: vi.fn(),
  },
  assemblyLines: {
    submitPackage: vi.fn(),
  },
  workerPools: {
    submitPackage: vi.fn(),
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

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock XMLHttpRequest for file upload
const xhrInstances: FakeXhr[] = [];

class FakeXhr {
  open = vi.fn();
  send = vi.fn();
  setRequestHeader = vi.fn();
  status = 200;
  upload = {
    onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    xhrInstances.push(this);
    // Auto-resolve on send
    this.send = vi.fn(() => {
      if (this.upload.onprogress) {
        this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
      }
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const defaultTarget: PackageSubmitTarget = {
  type: 'assembly-line',
  slug: 'test-line',
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof PackageSubmitDialog>> = {},
) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  return {
    onOpenChange,
    ...render(
      <PackageSubmitDialog
        target={props.target ?? defaultTarget}
        open={props.open ?? true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: createWrapper() },
    ),
  };
}

function createTestFile(name = 'test.txt', size = 1024, type = 'text/plain') {
  return new File([new ArrayBuffer(size)], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PackageSubmitDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    xhrInstances.length = 0;
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the dialog when open', () => {
      renderDialog();

      expect(
        screen.getByRole('heading', { name: 'Submit Package' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/submit a new package to assembly line/i),
      ).toBeInTheDocument();
      expect(screen.getByText('test-line')).toBeInTheDocument();
    });

    it('does not render dialog content when closed', () => {
      renderDialog({ open: false });

      expect(screen.queryByText('Submit Package')).not.toBeInTheDocument();
    });

    it('renders package type selector with default types', () => {
      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue('document');

      // Check all default options exist
      const options = within(select as HTMLSelectElement).getAllByRole('option');
      const optionValues = options.map(
        (o) => (o as HTMLOptionElement).value,
      );
      expect(optionValues).toContain('document');
      expect(optionValues).toContain('image');
      expect(optionValues).toContain('data');
      expect(optionValues).toContain('code');
      expect(optionValues).toContain('__custom__');
    });

    it('renders metadata editor with one empty row', () => {
      renderDialog();

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');
      expect(keyInputs).toHaveLength(1);
      expect(valueInputs).toHaveLength(1);
    });

    it('renders file upload drop zone', () => {
      renderDialog();

      expect(
        screen.getByText(/drag & drop files here/i),
      ).toBeInTheDocument();
    });

    it('renders submit and cancel buttons', () => {
      renderDialog();

      expect(
        screen.getByRole('button', { name: /submit package/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument();
    });

    it('shows worker pool target description', () => {
      renderDialog({
        target: { type: 'worker-pool', slug: 'pool-1' },
      });

      expect(
        screen.getByText(/submit a new package to worker pool/i),
      ).toBeInTheDocument();
      expect(screen.getByText('pool-1')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Package type selector
  // -----------------------------------------------------------------------

  describe('package type selector', () => {
    it('changes package type via dropdown', async () => {
      const user = userEvent.setup();
      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, 'code');
      expect(select).toHaveValue('code');
    });

    it('shows custom type input when Custom is selected', async () => {
      const user = userEvent.setup();
      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, '__custom__');

      const customInput = screen.getByPlaceholderText('Enter custom type...');
      expect(customInput).toBeInTheDocument();
    });

    it('disables submit when custom type is empty', async () => {
      const user = userEvent.setup();
      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, '__custom__');

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      expect(submitBtn).toBeDisabled();
    });

    it('enables submit when custom type is provided', async () => {
      const user = userEvent.setup();
      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, '__custom__');

      const customInput = screen.getByPlaceholderText('Enter custom type...');
      await user.type(customInput, 'my-type');

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      expect(submitBtn).toBeEnabled();
    });
  });

  // -----------------------------------------------------------------------
  // Metadata editor
  // -----------------------------------------------------------------------

  describe('metadata editor', () => {
    it('adds new metadata row on Add Row click', async () => {
      const user = userEvent.setup();
      renderDialog();

      const addBtn = screen.getByRole('button', { name: /add row/i });
      await user.click(addBtn);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      expect(keyInputs).toHaveLength(2);
    });

    it('removes metadata row on Remove click', async () => {
      const user = userEvent.setup();
      renderDialog();

      // Add a second row first
      const addBtn = screen.getByRole('button', { name: /add row/i });
      await user.click(addBtn);
      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(2);

      // Remove the first row
      const removeButtons = screen.getAllByRole('button', {
        name: /remove metadata row/i,
      });
      await user.click(removeButtons[0]!);

      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(1);
    });

    it('keeps at least one row when last row is removed', async () => {
      const user = userEvent.setup();
      renderDialog();

      const removeBtn = screen.getByRole('button', {
        name: /remove metadata row/i,
      });
      await user.click(removeBtn);

      // Should still have one row (a fresh empty one)
      expect(screen.getAllByPlaceholderText('Key')).toHaveLength(1);
    });

    it('allows typing in key and value inputs', async () => {
      const user = userEvent.setup();
      renderDialog();

      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'author');
      await user.type(valueInput, 'john');

      expect(keyInput).toHaveValue('author');
      expect(valueInput).toHaveValue('john');
    });
  });

  // -----------------------------------------------------------------------
  // File upload area
  // -----------------------------------------------------------------------

  describe('file upload area', () => {
    it('adds files via file input', async () => {
      const user = userEvent.setup();
      renderDialog();

      const fileInput = screen.getByTestId('file-input');
      const file = createTestFile('report.pdf', 2048, 'application/pdf');

      await user.upload(fileInput, file);

      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });

    it('adds multiple files', async () => {
      const user = userEvent.setup();
      renderDialog();

      const fileInput = screen.getByTestId('file-input');
      const files = [
        createTestFile('a.txt', 512),
        createTestFile('b.txt', 1024),
      ];

      await user.upload(fileInput, files);

      expect(screen.getByText('a.txt')).toBeInTheDocument();
      expect(screen.getByText('b.txt')).toBeInTheDocument();
    });

    it('removes a file on remove button click', async () => {
      const user = userEvent.setup();
      renderDialog();

      const fileInput = screen.getByTestId('file-input');
      const file = createTestFile('report.pdf');

      await user.upload(fileInput, file);
      expect(screen.getByText('report.pdf')).toBeInTheDocument();

      const removeBtn = screen.getByRole('button', {
        name: /remove report\.pdf/i,
      });
      await user.click(removeBtn);

      expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    });

    it('handles drag and drop', async () => {
      renderDialog();

      const dropZone = screen.getByTestId('drop-zone');
      const file = createTestFile('dropped.txt');

      const dataTransfer = {
        files: [file],
        types: ['Files'],
      };

      // Simulate drag over
      const dragOverEvent = new Event('dragover', { bubbles: true });
      Object.defineProperty(dragOverEvent, 'dataTransfer', {
        value: dataTransfer,
      });
      Object.defineProperty(dragOverEvent, 'preventDefault', {
        value: vi.fn(),
      });
      Object.defineProperty(dragOverEvent, 'stopPropagation', {
        value: vi.fn(),
      });
      dropZone.dispatchEvent(dragOverEvent);

      // Simulate drop
      const dropEvent = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: dataTransfer,
      });
      Object.defineProperty(dropEvent, 'preventDefault', {
        value: vi.fn(),
      });
      Object.defineProperty(dropEvent, 'stopPropagation', {
        value: vi.fn(),
      });
      dropZone.dispatchEvent(dropEvent);

      await waitFor(() => {
        expect(screen.getByText('dropped.txt')).toBeInTheDocument();
      });
    });

    it('formats file sizes correctly', async () => {
      const user = userEvent.setup();
      renderDialog();

      const fileInput = screen.getByTestId('file-input');

      // Test bytes
      const tinyFile = createTestFile('tiny.txt', 500);
      await user.upload(fileInput, tinyFile);
      expect(screen.getByText('500 B')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Submit flow
  // -----------------------------------------------------------------------

  describe('submit flow', () => {
    it('creates package and submits to assembly line', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      const mockPkg = { id: 'pkg-123', type: 'document', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.assemblyLines.submitPackage as Mock).mockResolvedValue(mockPkg);

      renderDialog({ onOpenChange });

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(client.packages.create).toHaveBeenCalledWith(
          { type: 'document', metadata: undefined },
          expect.any(AbortSignal),
        );
      });

      await waitFor(() => {
        expect(client.assemblyLines.submitPackage).toHaveBeenCalledWith(
          'test-line',
          { type: 'document', metadata: undefined },
          expect.any(AbortSignal),
        );
      });

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('submits to worker pool when target type is worker-pool', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      const mockPkg = { id: 'pkg-456', type: 'data', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.workerPools.submitPackage as Mock).mockResolvedValue(mockPkg);

      renderDialog({
        target: { type: 'worker-pool', slug: 'pool-1' },
        onOpenChange,
      });

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(client.workerPools.submitPackage).toHaveBeenCalledWith(
          'pool-1',
          { type: 'document', metadata: undefined },
          expect.any(AbortSignal),
        );
      });
    });

    it('includes metadata in submission', async () => {
      const user = userEvent.setup();
      const mockPkg = { id: 'pkg-789', type: 'document', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.assemblyLines.submitPackage as Mock).mockResolvedValue(mockPkg);

      renderDialog();

      // Fill metadata
      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');
      await user.type(keyInput, 'author');
      await user.type(valueInput, 'john');

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(client.packages.create).toHaveBeenCalledWith(
          { type: 'document', metadata: { author: 'john' } },
          expect.any(AbortSignal),
        );
      });
    });

    it('filters out empty metadata rows', async () => {
      const user = userEvent.setup();
      const mockPkg = { id: 'pkg-abc', type: 'document', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.assemblyLines.submitPackage as Mock).mockResolvedValue(mockPkg);

      renderDialog();

      // Add a second row but leave the first one empty
      const addBtn = screen.getByRole('button', { name: /add row/i });
      await user.click(addBtn);

      const keyInputs = screen.getAllByPlaceholderText('Key');
      const valueInputs = screen.getAllByPlaceholderText('Value');

      // Only fill the second row
      await user.type(keyInputs[1]!, 'tag');
      await user.type(valueInputs[1]!, 'important');

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(client.packages.create).toHaveBeenCalledWith(
          { type: 'document', metadata: { tag: 'important' } },
          expect.any(AbortSignal),
        );
      });
    });

    it('uses custom type when Custom is selected', async () => {
      const user = userEvent.setup();
      const mockPkg = { id: 'pkg-custom', type: 'report', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.assemblyLines.submitPackage as Mock).mockResolvedValue(mockPkg);

      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, '__custom__');

      const customInput = screen.getByPlaceholderText('Enter custom type...');
      await user.type(customInput, 'report');

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(client.packages.create).toHaveBeenCalledWith(
          { type: 'report', metadata: undefined },
          expect.any(AbortSignal),
        );
      });
    });

    it('uploads files with presigned URLs', async () => {
      const user = userEvent.setup();
      const mockPkg = { id: 'pkg-files', type: 'document', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.packages.getUploadUrl as Mock).mockResolvedValue({
        uploadUrl: 'https://s3.example.com/upload',
        fileId: 'file-001',
      });
      (client.packages.confirmUpload as Mock).mockResolvedValue(undefined);
      (client.assemblyLines.submitPackage as Mock).mockResolvedValue(mockPkg);

      renderDialog();

      // Add a file
      const fileInput = screen.getByTestId('file-input');
      const file = createTestFile('doc.pdf', 2048, 'application/pdf');
      await user.upload(fileInput, file);

      // Submit
      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(client.packages.getUploadUrl).toHaveBeenCalledWith(
          'pkg-files',
          { fileName: 'doc.pdf', contentType: 'application/pdf' },
          expect.any(AbortSignal),
        );
      });

      await waitFor(() => {
        expect(client.packages.confirmUpload).toHaveBeenCalledWith(
          'pkg-files',
          {
            fileId: 'file-001',
            fileName: 'doc.pdf',
            contentType: 'application/pdf',
            size: 2048,
          },
          expect.any(AbortSignal),
        );
      });
    });

    it('shows creating step during submission', async () => {
      const user = userEvent.setup();
      (client.packages.create as Mock).mockReturnValue(new Promise(() => {}));

      renderDialog();

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      // Should show creating step
      await waitFor(() => {
        expect(screen.getByText(/creating package/i)).toBeInTheDocument();
      });

      // Submit button should be disabled during submission
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });

    it('shows submitting step after package is created', async () => {
      const user = userEvent.setup();
      const mockPkg = { id: 'pkg-1', type: 'document', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      // Make submitPackage hang so we can observe the submitting step
      (client.assemblyLines.submitPackage as Mock).mockReturnValue(
        new Promise(() => {}),
      );

      renderDialog();

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/submitting to target/i)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('shows inline error on create failure', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      (client.packages.create as Mock).mockRejectedValue(
        new client.ApiError(422, 'Validation failed: type is invalid'),
      );

      renderDialog({ onOpenChange });

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Validation failed: type is invalid'),
        ).toBeInTheDocument();
      });

      // Dialog should NOT be closed
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('shows inline error on submit-to-target failure', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const mockPkg = { id: 'pkg-err', type: 'document', status: 'PENDING' };
      (client.packages.create as Mock).mockResolvedValue(mockPkg);
      (client.assemblyLines.submitPackage as Mock).mockRejectedValue(
        new client.ApiError(500, 'Assembly line is paused'),
      );

      renderDialog({ onOpenChange });

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Assembly line is paused'),
        ).toBeInTheDocument();
      });

      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('shows error in alert role', async () => {
      const user = userEvent.setup();
      (client.packages.create as Mock).mockRejectedValue(
        new client.ApiError(500, 'Server error'),
      );

      renderDialog();

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent('Server error');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Cancel and reset
  // -----------------------------------------------------------------------

  describe('cancel and reset', () => {
    it('calls onOpenChange(false) when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderDialog({ onOpenChange });

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('disables cancel button during submission', async () => {
      const user = userEvent.setup();
      (client.packages.create as Mock).mockReturnValue(new Promise(() => {}));

      renderDialog();

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        const cancelBtn = screen.getByRole('button', { name: /cancel/i });
        expect(cancelBtn).toBeDisabled();
      });
    });

    it('resets form when dialog is closed and reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = renderDialog();

      // Modify form state
      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, 'code');

      // Close dialog
      rerender(
        createElement(
          QueryClientProvider,
          {
            client: new QueryClient({
              defaultOptions: { queries: { retry: false } },
            }),
          },
          createElement(PackageSubmitDialog, {
            target: defaultTarget,
            open: false,
            onOpenChange: vi.fn(),
          }),
        ),
      );

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 300));

      // Reopen dialog
      rerender(
        createElement(
          QueryClientProvider,
          {
            client: new QueryClient({
              defaultOptions: { queries: { retry: false } },
            }),
          },
          createElement(PackageSubmitDialog, {
            target: defaultTarget,
            open: true,
            onOpenChange: vi.fn(),
          }),
        ),
      );

      await waitFor(() => {
        const typeSelect = screen.getByLabelText(/package type/i);
        expect(typeSelect).toHaveValue('document');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Submit button state
  // -----------------------------------------------------------------------

  describe('submit button state', () => {
    it('is enabled with default type selected', () => {
      renderDialog();

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      expect(submitBtn).toBeEnabled();
    });

    it('is disabled when custom type is empty', async () => {
      const user = userEvent.setup();
      renderDialog();

      const select = screen.getByLabelText(/package type/i);
      await user.selectOptions(select, '__custom__');

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      expect(submitBtn).toBeDisabled();
    });

    it('is disabled during submission', async () => {
      const user = userEvent.setup();
      (client.packages.create as Mock).mockReturnValue(new Promise(() => {}));

      renderDialog();

      const submitBtn = screen.getByRole('button', { name: /submit package/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /submitting/i }),
        ).toBeDisabled();
      });
    });
  });
});
