import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from './page';

describe('Privacy page', () => {
  it('says what is stored and that email and location are not', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/never asks for your email address/)).toBeInTheDocument();
    expect(screen.getByText(/is never stored, logged or shared/)).toBeInTheDocument();
    expect(screen.getByText(/the stops you save/)).toBeInTheDocument();
  });

  it('points to Settings for deleting the account', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});
