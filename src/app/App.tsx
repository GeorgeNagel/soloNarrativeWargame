import { useEffect, useState } from 'react'

import { routeFor, routes } from './routes'

function useHash() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return hash
}

function Index() {
  return (
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Solo Narrative Wargame</h1>
      <p>Competing prototypes of the order-giving screen. Each is playable.</p>
      <ul style={{ lineHeight: 1.6, paddingLeft: '1.2rem' }}>
        {routes.map((route) => (
          <li key={route.path}>
            <a href={`#/${route.path}`}>{route.name}</a>
            <div style={{ fontSize: '0.875rem', opacity: 0.75 }}>{route.blurb}</div>
          </li>
        ))}
      </ul>
    </main>
  )
}

function App() {
  const hash = useHash()
  const route = routeFor(hash)

  if (!route) {
    return <Index />
  }

  const Prototype = route.component

  return (
    <>
      <nav style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
        <a href="#/">← All prototypes</a>
      </nav>
      <Prototype />
    </>
  )
}

export default App
