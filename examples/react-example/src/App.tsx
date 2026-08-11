import { useEffect } from 'react'
import './App.css'
import MarkmapHooks from './components/markmap-hooks'
import { desktopApi } from './components/desktop-api'

export default function App() {
  useEffect(() => {
    const desktop = desktopApi()
    if (!desktop) return
    let active = true
    void desktop.getAppInfo().then(({ platform }) => {
      if (active) document.documentElement.dataset.desktopPlatform = platform
    })
    return () => {
      active = false
    }
  }, [])

  return <MarkmapHooks />
}
