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
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {routes.map((route) => (
          <li key={route.path} style={{ margin: '0 0 0.75rem' }}>
            <a
              href={`#/${route.path}`}
              style={{
                display: 'block',
                padding: '0.75rem 0.9rem',
                borderRadius: '0.4rem',
                border: '1px solid #2f2e2a',
                background: '#1a1917',
                color: '#e8e4da',
                textDecoration: 'none',
              }}
            >
              <strong>{route.name}</strong>
              <div style={{ fontSize: '0.875rem', color: '#9a958a', marginTop: '0.2rem' }}>
                {route.blurb}
              </div>
            </a>
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
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.4rem 0.75rem',
          fontSize: '0.8125rem',
          background: '#000',
          borderBottom: '1px solid #2a2a28',
        }}
      >
        <a href="#/" style={{ color: '#9a958a', textDecoration: 'none' }}>
          ← All prototypes
        </a>
        <span style={{ color: '#55524c' }}>{route.name}</span>
      </nav>
      <Prototype />
    </>
  )
}

export default App
