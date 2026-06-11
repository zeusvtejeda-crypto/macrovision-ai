import React from 'react';
import { render } from '@testing-library/react-native';
import { ConfidenceBadge } from '../ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('shows "Alta precisión" for score >= 0.85', () => {
    const { getByText } = render(<ConfidenceBadge score={0.9} />);
    expect(getByText(/Alta precisión/)).toBeTruthy();
  });

  it('shows "Precisión media" for score between 0.65 and 0.84', () => {
    const { getByText } = render(<ConfidenceBadge score={0.75} />);
    expect(getByText(/Precisión media/)).toBeTruthy();
  });

  it('shows "Baja precisión" for score < 0.65', () => {
    const { getByText } = render(<ConfidenceBadge score={0.5} />);
    expect(getByText(/Baja precisión/)).toBeTruthy();
  });

  it('shows percentage', () => {
    const { getByText } = render(<ConfidenceBadge score={0.88} />);
    expect(getByText(/88%/)).toBeTruthy();
  });

  it('uses custom label when provided', () => {
    const { getByText } = render(
      <ConfidenceBadge score={0.9} label="Muy confiable" />,
    );
    expect(getByText(/Muy confiable/)).toBeTruthy();
  });

  it('shows warning message when showWarning=true', () => {
    const { getByText } = render(
      <ConfidenceBadge score={0.5} showWarning />,
    );
    expect(getByText(/no está segura/)).toBeTruthy();
  });

  it('does not show warning when showWarning=false', () => {
    const { queryByText } = render(
      <ConfidenceBadge score={0.5} showWarning={false} />,
    );
    expect(queryByText(/no está segura/)).toBeNull();
  });
});
