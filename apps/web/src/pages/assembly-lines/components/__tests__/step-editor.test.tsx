import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StepEditor, { type StepItem } from '../step-editor';
import type { WorkerDetail } from '@/api/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorker(overrides: Partial<WorkerDetail> = {}): WorkerDetail {
  return {
    id: 'w-1',
    name: 'Summarizer',
    slug: 'summarizer',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    versions: [
      {
        id: 'wv-1',
        workerId: 'w-1',
        version: '1.0.0',
        yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'OPENAI_KEY' } },
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'wv-2',
        workerId: 'w-1',
        version: '2.0.0',
        yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'OPENAI_KEY' } },
        status: 'ACTIVE',
        createdAt: '2026-01-02T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

const WORKERS: WorkerDetail[] = [
  makeWorker(),
  makeWorker({
    id: 'w-2',
    name: 'Code Reviewer',
    slug: 'code-reviewer',
    versions: [
      {
        id: 'wv-3',
        workerId: 'w-2',
        version: '1.0.0',
        yamlConfig: { name: 'Code Reviewer', inputTypes: ['code'], outputType: 'review', provider: { name: 'anthropic', model: 'claude-3', apiKeyEnv: 'ANTHROPIC_KEY' } },
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  }),
];

function makeStep(overrides: Partial<StepItem> = {}): StepItem {
  return {
    id: 'step-100',
    workerId: 'w-1',
    workerSlug: 'summarizer',
    workerName: 'Summarizer',
    versionId: 'wv-1',
    version: '1.0.0',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderEditor(props: Partial<React.ComponentProps<typeof StepEditor>> = {}) {
  const defaultProps = {
    steps: [] as StepItem[],
    onStepsChange: vi.fn(),
    workers: WORKERS,
    isLoadingWorkers: false,
  };

  return {
    ...render(<StepEditor {...defaultProps} {...props} />),
    onStepsChange: (props.onStepsChange ?? defaultProps.onStepsChange) as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StepEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('Empty state', () => {
    it('shows empty message when no steps', () => {
      renderEditor();
      expect(screen.getByText(/No steps added yet/)).toBeInTheDocument();
    });

    it('renders the "Add Step" button', () => {
      renderEditor();
      expect(screen.getByRole('button', { name: /Add Step/ })).toBeInTheDocument();
    });

    it('renders the Steps label', () => {
      renderEditor();
      expect(screen.getByText('Steps')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Step cards
  // -------------------------------------------------------------------------

  describe('Step cards', () => {
    const twoSteps = [
      makeStep({ id: 'step-1', workerName: 'Summarizer', version: '1.0.0' }),
      makeStep({ id: 'step-2', workerId: 'w-2', workerSlug: 'code-reviewer', workerName: 'Code Reviewer', versionId: 'wv-3', version: '1.0.0' }),
    ];

    it('renders step cards with worker names', () => {
      renderEditor({ steps: twoSteps });
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
    });

    it('renders step numbers', () => {
      renderEditor({ steps: twoSteps });
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders version numbers', () => {
      renderEditor({ steps: twoSteps });
      const versionTexts = screen.getAllByText('v1.0.0');
      expect(versionTexts).toHaveLength(2);
    });

    it('renders remove buttons for each step', () => {
      renderEditor({ steps: twoSteps });
      expect(screen.getByRole('button', { name: 'Remove step 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove step 2' })).toBeInTheDocument();
    });

    it('renders drag handles for each step', () => {
      renderEditor({ steps: twoSteps });
      expect(screen.getByRole('button', { name: 'Drag to reorder step 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Drag to reorder step 2' })).toBeInTheDocument();
    });

    it('does not show empty message when steps exist', () => {
      renderEditor({ steps: twoSteps });
      expect(screen.queryByText(/No steps added yet/)).not.toBeInTheDocument();
    });

    it('renders a list with correct role', () => {
      renderEditor({ steps: twoSteps });
      expect(screen.getByRole('list', { name: 'Pipeline steps' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Removing steps
  // -------------------------------------------------------------------------

  describe('Removing steps', () => {
    it('calls onStepsChange without the removed step', async () => {
      const user = userEvent.setup();
      const steps = [
        makeStep({ id: 'step-1', workerName: 'Summarizer' }),
        makeStep({ id: 'step-2', workerName: 'Code Reviewer' }),
      ];
      const { onStepsChange } = renderEditor({ steps });

      await user.click(screen.getByRole('button', { name: 'Remove step 1' }));

      expect(onStepsChange).toHaveBeenCalledWith([steps[1]]);
    });
  });

  // -------------------------------------------------------------------------
  // Worker selector dialog
  // -------------------------------------------------------------------------

  describe('Worker selector dialog', () => {
    it('opens when "Add Step" is clicked', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      expect(screen.getByText('Select Worker')).toBeInTheDocument();
    });

    it('shows worker names in the dialog', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      expect(screen.getByRole('button', { name: 'Summarizer' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Code Reviewer' })).toBeInTheDocument();
    });

    it('shows loading state when workers are loading', async () => {
      const user = userEvent.setup();
      renderEditor({ isLoadingWorkers: true, workers: [] });
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      expect(screen.getByText('Loading workers...')).toBeInTheDocument();
    });

    it('shows "No workers found" when list is empty', async () => {
      const user = userEvent.setup();
      renderEditor({ workers: [], isLoadingWorkers: false });
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      expect(screen.getByText('No workers found')).toBeInTheDocument();
    });

    it('filters workers by search input', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));

      await user.type(screen.getByLabelText('Search workers'), 'Code');

      expect(screen.getByRole('button', { name: 'Code Reviewer' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Summarizer' })).not.toBeInTheDocument();
    });

    it('shows version dropdown when a worker is selected', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Summarizer' }));

      expect(screen.getByLabelText('Select version')).toBeInTheDocument();
    });

    it('disables Add Step button until a worker and version are selected', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));

      const dialog = screen.getByRole('dialog');
      const addBtn = within(dialog).getByRole('button', { name: 'Add Step' });
      expect(addBtn).toBeDisabled();
    });

    it('enables Add Step button after selecting worker with versions', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Summarizer' }));

      const dialog = screen.getByRole('dialog');
      const addBtn = within(dialog).getByRole('button', { name: 'Add Step' });
      expect(addBtn).not.toBeDisabled();
    });

    it('calls onStepsChange with new step when confirmed', async () => {
      const user = userEvent.setup();
      const { onStepsChange } = renderEditor();

      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Summarizer' }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Add Step' }));

      expect(onStepsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          workerId: 'w-1',
          workerSlug: 'summarizer',
          workerName: 'Summarizer',
          versionId: 'wv-1',
          version: '1.0.0',
        }),
      ]);
    });

    it('allows selecting a different version', async () => {
      const user = userEvent.setup();
      const { onStepsChange } = renderEditor();

      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Summarizer' }));

      // Change version to v2.0.0
      const versionSelect = screen.getByLabelText('Select version');
      await user.selectOptions(versionSelect, 'wv-2');

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Add Step' }));

      expect(onStepsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          versionId: 'wv-2',
          version: '2.0.0',
        }),
      ]);
    });

    it('closes dialog on cancel', async () => {
      const user = userEvent.setup();
      renderEditor();
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      expect(screen.getByText('Select Worker')).toBeInTheDocument();

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Select Worker')).not.toBeInTheDocument();
    });

    it('resets state when reopening dialog', async () => {
      const user = userEvent.setup();
      renderEditor();

      // Open and select a worker
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Summarizer' }));
      expect(screen.getByLabelText('Select version')).toBeInTheDocument();

      // Close
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      // Reopen - version select should not be present
      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      expect(screen.queryByLabelText('Select version')).not.toBeInTheDocument();
    });

    it('shows no versions message for worker without versions', async () => {
      const user = userEvent.setup();
      const workerNoVersions: WorkerDetail[] = [
        makeWorker({ id: 'w-3', name: 'Empty Worker', slug: 'empty-worker', versions: [] }),
      ];
      renderEditor({ workers: workerNoVersions });

      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Empty Worker' }));

      expect(screen.getByText('No versions available for this worker.')).toBeInTheDocument();
    });

    it('highlights selected worker', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('button', { name: /Add Step/ }));
      await user.click(screen.getByRole('button', { name: 'Summarizer' }));

      const workerBtn = screen.getByRole('button', { name: 'Summarizer' });
      expect(workerBtn.className).toContain('bg-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Error display
  // -------------------------------------------------------------------------

  describe('Error display', () => {
    it('renders error message when error prop is provided', () => {
      renderEditor({ error: 'At least one step is required.' });
      expect(screen.getByRole('alert')).toHaveTextContent('At least one step is required.');
    });

    it('does not render error element when no error', () => {
      renderEditor();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
