import HexGrid from '../ui/components/HexGrid'

function App() {
  return (
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Solo Narrative Wargame</h1>
      <HexGrid columns={7} rows={7} />
    </main>
  )
}

export default App
