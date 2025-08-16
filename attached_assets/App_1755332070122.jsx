
import { useState, useEffect } from 'react'
import GlobalStyles from './components/GlobalStyles'
import BillingPage from './components/BillingPage'
import SchedulePage from './components/SchedulePage'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('billing')

  // Simple client-side routing based on URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash === 'schedule') {
        setCurrentPage('schedule')
      } else if (hash === 'billing') {
        setCurrentPage('billing')
      }
    }

    // Set initial page based on hash
    handleHashChange()

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)

    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'schedule':
        return <SchedulePage />
      case 'billing':
      default:
        return <BillingPage />
    }
  }

  return (
    <>
      <GlobalStyles />
      <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Bitter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {renderPage()}

      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    </>
  )
}

export default App
