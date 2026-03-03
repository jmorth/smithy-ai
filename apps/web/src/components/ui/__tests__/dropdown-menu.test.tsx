import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuRadioGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '../dropdown-menu';

describe('DropdownMenu', () => {
  it('opens when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Edit
            <DropdownMenuShortcut>Ctrl+E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.queryByText('Actions')).not.toBeInTheDocument();

    await user.click(screen.getByText('Open Menu'));

    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+E')).toBeInTheDocument();
  });

  it('renders checkbox items', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>
            Show Toolbar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Show Sidebar</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('Open'));

    expect(screen.getByText('Show Toolbar')).toBeInTheDocument();
    expect(screen.getByText('Show Sidebar')).toBeInTheDocument();
  });

  it('renders radio items', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="light">
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('Open'));

    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('renders sub-menu trigger and content', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More Options</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub Item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('Open'));

    expect(screen.getByText('More Options')).toBeInTheDocument();
  });

  it('renders label with inset', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Inset Label</DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('Open'));

    const label = screen.getByText('Inset Label');
    expect(label.className).toContain('pl-8');
  });
});
