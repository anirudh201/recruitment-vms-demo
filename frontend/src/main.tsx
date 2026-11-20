import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-800.css'
import './index.css'
import App from './App.tsx'
import { TopLoadingBar } from './components/Loading'
import { GlassHover } from './components/GlassHover'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TopLoadingBar />
    <GlassHover />
    <App />
  </StrictMode>,
)
