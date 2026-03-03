import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  PipelineVisualization,
  type PipelineStep,
} from '../pipeline-visualization';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<PipelineStep> = {}): PipelineStep {
  return {
    id: 'step-1',
    stepNumber: 1,
    workerName: 'Summarizer',
    workerVersion: '1.0',
    status: 'idle',
    ...overrides,
  };
}

function makeSteps(count: number): PipelineStep[] {
  return Array.from({ length: count }, (_, i) =>
    makeStep({
      id: `step-${i + 1}`,
      stepNumber: i + 1,
      workerName: `Worker ${i + 1}`,
      workerVersion: `${i + 1}.0`,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineVisualization', () => {
  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton elements while loading', () => {
      const { container } = render(
        <PipelineVisualization steps={[]} isLoading />,
      );
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not render steps while loading', () => {
      render(
        <PipelineVisualization steps={makeSteps(3)} isLoading />,
      );
      expect(screen.queryByTestId('step-1')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  describe('Empty state', () => {
    it('shows empty message when no steps', () => {
      render(<PipelineVisualization steps={[]} />);
      expect(
        screen.getByText('No steps configured for this assembly line.'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Step rendering
  // -----------------------------------------------------------------------

  describe('Step rendering', () => {
    it('renders all steps', () => {
      const steps = makeSteps(3);
      render(<PipelineVisualization steps={steps} />);

      for (let i = 1; i <= 3; i++) {
        expect(screen.getByTestId(`step-${i}`)).toBeInTheDocument();
      }
    });

    it('shows step number, worker name, and version', () => {
      const steps = [
        makeStep({
          stepNumber: 1,
          workerName: 'Summarizer',
          workerVersion: '2.1',
        }),
      ];
      render(<PipelineVisualization steps={steps} />);

      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
      expect(screen.getByText('v2.1')).toBeInTheDocument();
    });

    it('shows status label for each step', () => {
      const steps = [
        makeStep({ id: 's1', stepNumber: 1, status: 'idle' }),
        makeStep({ id: 's2', stepNumber: 2, status: 'processing' }),
        makeStep({ id: 's3', stepNumber: 3, status: 'completed' }),
        makeStep({ id: 's4', stepNumber: 4, status: 'error' }),
      ];
      render(<PipelineVisualization steps={steps} />);

      expect(screen.getByText('Idle')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('renders pipeline as a list with role="list"', () => {
      render(<PipelineVisualization steps={makeSteps(2)} />);
      expect(
        screen.getByRole('list', { name: 'Pipeline steps' }),
      ).toBeInTheDocument();
    });

    it('renders each step as a listitem', () => {
      render(<PipelineVisualization steps={makeSteps(3)} />);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // Status colors
  // -----------------------------------------------------------------------

  describe('Status colors', () => {
    it('applies gray border for idle steps', () => {
      render(
        <PipelineVisualization
          steps={[makeStep({ status: 'idle' })]}
        />,
      );
      const step = screen.getByTestId('step-1');
      expect(step.className).toContain('border-gray-200');
    });

    it('applies blue border for processing steps', () => {
      render(
        <PipelineVisualization
          steps={[makeStep({ status: 'processing' })]}
        />,
      );
      const step = screen.getByTestId('step-1');
      expect(step.className).toContain('border-blue-300');
    });

    it('applies green border for completed steps', () => {
      render(
        <PipelineVisualization
          steps={[makeStep({ status: 'completed' })]}
        />,
      );
      const step = screen.getByTestId('step-1');
      expect(step.className).toContain('border-green-300');
    });

    it('applies red border for error steps', () => {
      render(
        <PipelineVisualization
          steps={[makeStep({ status: 'error' })]}
        />,
      );
      const step = screen.getByTestId('step-1');
      expect(step.className).toContain('border-red-300');
    });

    it('applies animate-pulse for processing steps', () => {
      render(
        <PipelineVisualization
          steps={[makeStep({ status: 'processing' })]}
        />,
      );
      const step = screen.getByTestId('step-1');
      expect(step.className).toContain('animate-pulse');
    });

    it('does not apply animate-pulse for idle steps', () => {
      render(
        <PipelineVisualization
          steps={[makeStep({ status: 'idle' })]}
        />,
      );
      const step = screen.getByTestId('step-1');
      expect(step.className).not.toContain('animate-pulse');
    });
  });

  // -----------------------------------------------------------------------
  // Status dot aria labels
  // -----------------------------------------------------------------------

  describe('Status dot indicators', () => {
    it('renders status dots with aria-labels', () => {
      const steps = [
        makeStep({ id: 's1', stepNumber: 1, status: 'idle' }),
        makeStep({ id: 's2', stepNumber: 2, status: 'processing' }),
      ];
      render(<PipelineVisualization steps={steps} />);

      expect(
        screen.getByLabelText('Status: Idle'),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Status: Processing'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Arrows between steps
  // -----------------------------------------------------------------------

  describe('Arrow connectors', () => {
    it('renders SVG arrows between steps', () => {
      const { container } = render(
        <PipelineVisualization steps={makeSteps(3)} />,
      );
      // Two arrows for three steps
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBe(2);
    });

    it('does not render arrow before first step', () => {
      const { container } = render(
        <PipelineVisualization steps={makeSteps(1)} />,
      );
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Compact mode
  // -----------------------------------------------------------------------

  describe('Compact mode', () => {
    it('renders compact steps when compact=true', () => {
      const steps = makeSteps(3);
      render(<PipelineVisualization steps={steps} compact />);

      for (let i = 1; i <= 3; i++) {
        expect(screen.getByTestId(`compact-step-${i}`)).toBeInTheDocument();
      }
    });

    it('does not render full step boxes in compact mode', () => {
      const steps = makeSteps(2);
      render(<PipelineVisualization steps={steps} compact />);
      expect(screen.queryByTestId('step-1')).not.toBeInTheDocument();
    });

    it('shows tooltips with step info on compact steps', () => {
      const steps = [
        makeStep({ stepNumber: 1, workerName: 'Summarizer', status: 'processing' }),
      ];
      render(<PipelineVisualization steps={steps} compact />);
      const compactStep = screen.getByTestId('compact-step-1');
      expect(compactStep).toHaveAttribute(
        'title',
        'Step 1: Summarizer (Processing)',
      );
    });

    it('applies animate-pulse for processing in compact mode', () => {
      const steps = [makeStep({ status: 'processing' })];
      render(<PipelineVisualization steps={steps} compact />);
      const compactStep = screen.getByTestId('compact-step-1');
      expect(compactStep.className).toContain('animate-pulse');
    });
  });
});
