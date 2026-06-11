import React from 'react';
import { render } from '@testing-library/react-native';
import { MacroBar } from '../MacroBar';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

describe('MacroBar', () => {
  const defaultProps = {
    label: 'Proteína',
    consumed: 80,
    goal: 150,
    color: '#3b82f6',
  };

  it('renders label correctly', () => {
    const { getByText } = render(<MacroBar {...defaultProps} />);
    expect(getByText('Proteína')).toBeTruthy();
  });

  it('renders consumed/goal values', () => {
    const { getByText } = render(<MacroBar {...defaultProps} />);
    expect(getByText('80')).toBeTruthy();
    expect(getByText(' / 150g')).toBeTruthy();
  });

  it('renders custom unit', () => {
    const { getByText } = render(
      <MacroBar {...defaultProps} unit="kcal" />,
    );
    expect(getByText(' / 150kcal')).toBeTruthy();
  });

  it('renders without crashing when goal is 0', () => {
    expect(() =>
      render(<MacroBar {...defaultProps} goal={0} />),
    ).not.toThrow();
  });
});
