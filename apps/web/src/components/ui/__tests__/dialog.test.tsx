import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../dialog';

describe('Dialog', () => {
  it('opens when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog Description</DialogDescription>
          </DialogHeader>
          <p>Body content</p>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument();

    await user.click(screen.getByText('Open'));

    expect(screen.getByText('Dialog Title')).toBeInTheDocument();
    expect(screen.getByText('Dialog Description')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders controlled open state', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Visible</DialogTitle>
          <DialogDescription>Test</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('has a close button with sr-only text', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByText('Open'));
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});
