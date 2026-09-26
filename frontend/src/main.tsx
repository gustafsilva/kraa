import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// The window has no OS chrome to inherit a theme from, so mirror the OS
// light/dark preference onto the `dark` class ourselves and keep it in sync.
const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyColorScheme = () => {
  document.documentElement.classList.toggle('dark', darkSchemeQuery.matches)
}
applyColorScheme()
darkSchemeQuery.addEventListener('change', applyColorScheme)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
