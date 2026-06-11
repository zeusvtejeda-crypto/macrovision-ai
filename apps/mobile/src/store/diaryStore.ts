import { create } from 'zustand';
import { format } from 'date-fns';
import { DailyDiary, MealType, MacroNutrients } from '@macrovision/shared-types';

interface DiaryState {
  selectedDate: Date;
  dailyDiaries: Record<string, DailyDiary>; // key: 'yyyy-MM-dd'
  isLoading: boolean;

  // Actions
  setSelectedDate: (date: Date) => void;
  setDailyDiary: (date: string, diary: DailyDiary) => void;
  getTodayKey: () => string;
  getSelectedKey: () => string;
  getCurrentDiary: () => DailyDiary | null;
  getTotalsByDate: (date: string) => MacroNutrients;
}

const EMPTY_MACROS: MacroNutrients = {
  calories: 0,
  protein: 0,
  carbohydrates: 0,
  fat: 0,
  fiber: 0,
};

export const useDiaryStore = create<DiaryState>((set, get) => ({
  selectedDate: new Date(),
  dailyDiaries: {},
  isLoading: false,

  setSelectedDate: (date) => set({ selectedDate: date }),

  setDailyDiary: (date, diary) =>
    set((state) => ({
      dailyDiaries: {
        ...state.dailyDiaries,
        [date]: diary,
      },
    })),

  getTodayKey: () => format(new Date(), 'yyyy-MM-dd'),

  getSelectedKey: () => format(get().selectedDate, 'yyyy-MM-dd'),

  getCurrentDiary: () => {
    const key = get().getSelectedKey();
    return get().dailyDiaries[key] || null;
  },

  getTotalsByDate: (date) => {
    const diary = get().dailyDiaries[date];
    if (!diary) return EMPTY_MACROS;
    return diary.totals;
  },
}));
