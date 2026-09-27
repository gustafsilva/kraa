import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ProfileWindow } from './profile/ProfileWindow'
import { isProfileView, syncColorScheme } from './view'
import './index.css'

syncColorScheme(window.matchMedia('(prefers-color-scheme: dark)'), document.documentElement)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isProfileView(window.location.search) ? <ProfileWindow /> : <App />}
  </React.StrictMode>,
)
