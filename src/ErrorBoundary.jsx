import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Log to console so it shows in browser DevTools
    console.error('[ErrorBoundary] Render crash:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', backgroundColor: '#FFF7ED', fontFamily: 'sans-serif'
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#92400E', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: '#78350F', marginBottom: 16, textAlign: 'center' }}>
            The app crashed unexpectedly. Screenshot the error below and send it to your developer.
          </p>
          <pre style={{
            background: '#1E293B', color: '#F8FAFC', fontSize: 11, padding: 16,
            borderRadius: 8, overflowX: 'auto', maxWidth: '100%', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', maxHeight: 300, overflowY: 'auto'
          }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16, backgroundColor: '#1B6B3A', color: '#fff',
              border: 'none', borderRadius: 12, padding: '10px 24px',
              fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
