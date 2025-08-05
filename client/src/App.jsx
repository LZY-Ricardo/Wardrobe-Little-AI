import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <header className="App-header">
        <h1>智能穿搭项目</h1>
        <p>React 18版本</p>
        <button onClick={() => setCount((count) => count + 1)}>
          点击计数: {count}
        </button>
      </header>
    </div>
  )
}

export default App