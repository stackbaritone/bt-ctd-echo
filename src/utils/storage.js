// Storage utilities for persisting user preferences and state
const STORAGE_KEY = 'ea_state_v1';

export const loadState = () => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return getDefaultState();
    }
    const state = JSON.parse(serializedState);
    return {
      ...getDefaultState(),
      ...state
    };
  } catch (err) {
    console.warn('Error loading state from localStorage:', err);
    return getDefaultState();
  }
};

export const saveState = (state) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serializedState);
  } catch (err) {
    console.warn('Error saving state to localStorage:', err);
  }
};

export const getDefaultState = () => ({
  interfaceLanguage: 'fr',
  templateLanguage: 'fr',
  searchQuery: '',
  selectedCategory: 'all',
  variables: {},
  favorites: [],
  favoritesOnly: false,
  darkMode: false
});

export const clearState = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('Error clearing state from localStorage:', err)
  }
}
