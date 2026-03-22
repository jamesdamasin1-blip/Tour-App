import { useStore } from '../store/useStore';

/**
 * Centralized theme hook.
 * Replaces the boilerplate `const { theme } = useStore(); const isDark = theme === 'dark';`
 * pattern duplicated across every screen and component.
 */
export const useTheme = () => {
    const theme = useStore(state => state.theme);
    const toggleTheme = useStore(state => state.toggleTheme);
    return { isDark: theme === 'dark', theme, toggleTheme };
};
