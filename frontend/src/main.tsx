import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ProfileWindow } from './profile/ProfileWindow'
import './index.css'

// The window has no OS chrome to inherit a theme from, so mirror the OS
// light/dark preference onto the `dark` class ourselves and keep it in sync.
const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyColorScheme = () => {
  document.documentElement.classList.toggle('dark', darkSchemeQuery.matches)
}
applyColorScheme()
darkSchemeQuery.addEventListener('change', applyColorScheme)

// The tray's "Perfil do usuário…" window loads the same bundle with
// ?view=profile (see main.go).
const isProfileView = new URLSearchParams(window.location.search).get('view') === 'profile'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isProfileView ? <ProfileWindow /> : <App />}
  </React.StrictMode>,
)
