import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { InteractiveResponse } from '../interactive-response';

describe('InteractiveResponse', () => {
  const baseQuestion = {
    jobId: 'j1',
    questionId: 'q1',
    prompt: 'What format should the output be?',
  };

  it('renders the question prompt', () => {
    render(
      <InteractiveResponse question={baseQuestion} onSubmit={vi.fn()} />,
    );
    expect(
      screen.getByText('What format should the output be?'),
    ).toBeInTheDocument();
  });

  it('renders option buttons when provided', () => {
    render(
      <InteractiveResponse
        question={{ ...baseQuestion, options: ['JSON', 'XML', 'CSV'] }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('option-JSON')).toBeInTheDocument();
    expect(screen.getByTestId('option-XML')).toBeInTheDocument();
    expect(screen.getByTestId('option-CSV')).toBeInTheDocument();
  });

  it('sets textarea value when option is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InteractiveResponse
        question={{ ...baseQuestion, options: ['JSON', 'XML'] }}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('option-JSON'));
    expect(screen.getByTestId('answer-input')).toHaveValue('JSON');
  });

  it('does not render options when empty array', () => {
    render(
      <InteractiveResponse
        question={{ ...baseQuestion, options: [] }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('option-JSON')).not.toBeInTheDocument();
  });

  it('submit button is disabled when answer is empty', () => {
    render(
      <InteractiveResponse question={baseQuestion} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId('submit-answer')).toBeDisabled();
  });

  it('does not submit when only whitespace', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <InteractiveResponse question={baseQuestion} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByTestId('answer-input'), '   ');
    expect(screen.getByTestId('submit-answer')).toBeDisabled();
  });

  it('calls onSubmit with trimmed answer', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <InteractiveResponse question={baseQuestion} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByTestId('answer-input'), '  JSON format  ');
    await user.click(screen.getByTestId('submit-answer'));

    expect(onSubmit).toHaveBeenCalledWith('j1', {
      questionId: 'q1',
      answer: 'JSON format',
    });
  });

  it('shows confirmation after submission', async () => {
    const user = userEvent.setup();
    render(
      <InteractiveResponse question={baseQuestion} onSubmit={vi.fn()} />,
    );

    await user.type(screen.getByTestId('answer-input'), 'yes');
    await user.click(screen.getByTestId('submit-answer'));

    expect(
      screen.getByTestId('interactive-confirmation'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('interactive-response'),
    ).not.toBeInTheDocument();
  });

  it('has role="alert"', () => {
    render(
      <InteractiveResponse question={baseQuestion} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
