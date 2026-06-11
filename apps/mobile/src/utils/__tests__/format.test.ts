import { formatDate, addDays, isToday, formatCalories, formatMacro, toDateString } from '../format';

describe('format utilities', () => {
  describe('formatDate', () => {
    const date = new Date('2025-01-15T12:00:00');

    it('should format yyyy correctly', () => {
      expect(formatDate(date, 'yyyy')).toBe('2025');
    });

    it('should format dd/MM/yyyy correctly', () => {
      expect(formatDate(date, 'dd/MM/yyyy')).toBe('15/01/2025');
    });

    it('should accept string input', () => {
      expect(formatDate('2025-01-15', 'yyyy')).toBe('2025');
    });
  });

  describe('addDays', () => {
    it('should add positive days', () => {
      const base = new Date('2025-01-01');
      const result = addDays(base, 5);
      expect(result.getDate()).toBe(6);
    });

    it('should subtract days with negative input', () => {
      const base = new Date('2025-01-10');
      const result = addDays(base, -3);
      expect(result.getDate()).toBe(7);
    });

    it('should not mutate the original date', () => {
      const base = new Date('2025-01-01');
      addDays(base, 10);
      expect(base.getDate()).toBe(1);
    });
  });

  describe('isToday', () => {
    it('should return true for today', () => {
      expect(isToday(new Date())).toBe(true);
    });

    it('should return false for yesterday', () => {
      const yesterday = addDays(new Date(), -1);
      expect(isToday(yesterday)).toBe(false);
    });
  });

  describe('formatCalories', () => {
    it('rounds to nearest integer', () => {
      expect(formatCalories(1234.7)).toBe('1235 kcal');
    });

    it('handles zero', () => {
      expect(formatCalories(0)).toBe('0 kcal');
    });
  });

  describe('formatMacro', () => {
    it('rounds and appends unit', () => {
      expect(formatMacro(25.6)).toBe('26g');
    });

    it('accepts custom unit', () => {
      expect(formatMacro(10, 'mg')).toBe('10mg');
    });
  });

  describe('toDateString', () => {
    it('should return YYYY-MM-DD format', () => {
      const date = new Date('2025-06-15T10:00:00Z');
      expect(toDateString(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
