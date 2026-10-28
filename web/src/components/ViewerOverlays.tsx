export function ViewerLoadingOverlay() {
  return (
    <div className="overlay" role="status">
      <div className="loading-card">
        <div className="spinner" aria-hidden="true" />
        <p>Building the terrain slab...</p>
      </div>
    </div>
  )
}

export function ViewerErrorOverlay({ message }: { message: string }) {
  return (
    <div className="overlay" role="alert">
      <div className="loading-card error-card">
        <p>{message}</p>
      </div>
    </div>
  )
}
