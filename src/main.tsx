import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDebugFlags } from './engine/debugFlags';
import './i18n';
import App from './App'
import './index.css'
import './components/shared.css'

initDebugFlags(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
