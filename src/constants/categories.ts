import { ExpenseCategory } from '@/src/types/models';

export interface CategoryTheme {
    color: string;
    icon: string;
    bg: string;
}

export const CATEGORY_THEME: Record<ExpenseCategory, CategoryTheme> = {
    Food: {
        color: '#ea580c', // Orange
        icon: 'coffee',
        bg: 'rgba(234, 88, 12, 0.15)',
    },
    Transport: {
        color: '#3b82f6', // Blue
        icon: 'truck',
        bg: 'rgba(59, 130, 246, 0.15)',
    },
    Hotel: {
        color: '#8b5cf6', // Violet
        icon: 'home',
        bg: 'rgba(139, 92, 246, 0.15)',
    },
    Sightseeing: {
        color: '#22c55e', // Green
        icon: 'camera',
        bg: 'rgba(34, 197, 94, 0.15)',
    },
    Other: {
        color: '#6b7280', // Gray
        icon: 'credit-card',
        bg: 'rgba(107, 114, 128, 0.15)',
    },
};

export const getCategoryTheme = (category: string): CategoryTheme => {
    const cat = category.toLowerCase();
    if (cat.includes('food')) return CATEGORY_THEME.Food;
    if (cat.includes('transport')) return CATEGORY_THEME.Transport;
    if (cat.includes('hotel') || cat.includes('accommodation')) return CATEGORY_THEME.Hotel;
    if (cat.includes('sightseeing')) return CATEGORY_THEME.Sightseeing;
    return CATEGORY_THEME.Other;
};
