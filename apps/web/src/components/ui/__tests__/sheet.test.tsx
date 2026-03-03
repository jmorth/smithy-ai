import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '../sheet';

describe('Sheet', () => {
  it('opens when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet Description</SheetDescription>
          </SheetHeader>
          <p>Sheet body</p>
          <SheetFooter>Footer</SheetFooter>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.queryByText('Sheet Title')).not.toBeInTheDocument();

    await user.click(screen.getByText('Open Sheet'));

    expect(screen.getByText('Sheet Title')).toBeInTheDocument();
    expect(screen.getByText('Sheet Description')).toBeInTheDocument();
    expect(screen.getByText('Sheet body')).toBeInTheDocument();
  });

  it('renders controlled open state', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Visible</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('applies side variant classes', () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetTitle>Left Sheet</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const content = screen.getByText('Left Sheet').closest('[role="dialog"]');
    expect(content?.className).toContain('left-0');
  });
});
