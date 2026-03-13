import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Inject ambient background canvas once, before React mounts
const bgCanvas = document.createElement('div')
bgCanvas.id = 'bg-canvas'
bgCanvas.innerHTML =
  '<div class="bg-orb orb-1"></div>' +
  '<div class="bg-orb orb-2"></div>' +
  '<div class="bg-orb orb-3"></div>'
document.body.prepend(bgCanvas)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
