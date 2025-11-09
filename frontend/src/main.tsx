import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // .tsx 확장자명은 생략 가능
import './index.scss'

// getElementById('root')가 null이 아니라고 TypeScript에 알려줌 (!)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
