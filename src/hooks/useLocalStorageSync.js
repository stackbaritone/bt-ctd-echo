import { useEffect } from 'react'

/**
 * Persiste une valeur dans localStorage à chaque changement.
 * Les objets sont sérialisés en JSON, les autres valeurs via String().
 * Si `value` est null/undefined/falsy et que `skipFalsy` est true, n'écrit pas.
 */
export function useLocalStorageSync(key, value, { skipFalsy = false } = {}) {
  useEffect(() => {
    if (skipFalsy && !value) return
    try {
      const serialized =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value)
      localStorage.setItem(key, serialized)
    } catch {}
  }, [key, value, skipFalsy])
}
