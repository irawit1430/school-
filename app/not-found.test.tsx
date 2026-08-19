import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NotFound from './not-found';

describe('NotFound', () => {
  it('renders correctly', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 2, name: /not found/i })).toBeInTheDocument();
    expect(screen.getByText(/could not find requested resource/i)).toBeInTheDocument();
  });
});
