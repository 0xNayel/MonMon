import { createContext, useContext, useEffect, useState } from 'react'
import { themes, DEFAULT_THEME_ID, type Theme } from '../themes'

interface ThemeCtx {
  theme: Theme
  setTheme: (id: string, originX?: number, originY?: number) => void
}

const ThemeContext = createContext<ThemeCtx>({ theme: themes[0], setTheme: () => {} })

function applyThemeVars(theme: Theme) {
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.setAttribute('data-theme', theme.id)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('monmon_theme')
    return themes.find(t => t.id === saved) ?? themes.find(t => t.id === DEFAULT_THEME_ID)!
  })

  // Apply on mount
  useEffect(() => { applyThemeVars(theme) }, [])

  const setTheme = (id: string, originX?: number, originY?: number) => {
    const next = themes.find(t => t.id === id)
    if (!next || next.id === theme.id) return

    const commit = () => {
      applyThemeVars(next)
      setThemeState(next)
      localStorage.setItem('monmon_theme', id)
    }

    const vt = (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition

    if (vt && originX !== undefined && originY !== undefined) {
      document.documentElement.style.setProperty('--vt-x', `${originX}px`)
      document.documentElement.style.setProperty('--vt-y', `${originY}px`)
      vt.call(document, commit)
    } else {
      commit()
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
