import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link } from 'react-router'
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider'
import App from './App.tsx'
import { AuthProvider } from './AuthProvider'

declare global {
  interface AppsSDKUIConfig { LinkComponent: typeof Link }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><AppsSDKUIProvider linkComponent={Link}><AuthProvider><App /></AuthProvider></AppsSDKUIProvider></BrowserRouter>
  </StrictMode>,
)
