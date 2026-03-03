import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../card';

describe('Card', () => {
  it('renders card with all sub-components', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies card styling', () => {
    render(<Card data-testid="card">Test</Card>);
    const card = screen.getByTestId('card');
    expect(card.className).toContain('rounded-lg');
    expect(card.className).toContain('border');
    expect(card.className).toContain('bg-card');
  });

  it('merges custom className on Card', () => {
    render(
      <Card data-testid="card" className="custom">
        Test
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('custom');
  });

  it('renders CardTitle as h3', () => {
    render(<CardTitle>Heading</CardTitle>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Heading',
    );
  });
});
