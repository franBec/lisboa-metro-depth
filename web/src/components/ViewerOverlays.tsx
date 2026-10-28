export function ViewerLoadingOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(11,15,16,0.68)] backdrop-blur-[8px]"
      role="status"
    >
      <div className="grid place-items-center gap-3.5 border border-line bg-panel-solid px-7 py-6 text-[11px] tracking-[0.08em] text-muted uppercase">
        <span
          className="h-[18px] w-[18px] animate-spin rounded-full border border-line-strong border-t-accent"
          aria-hidden="true"
        />
        <p className="m-0">Building the terrain slab...</p>
      </div>
    </div>
  )
}

export function ViewerErrorOverlay({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(11,15,16,0.68)] backdrop-blur-[8px]"
      role="alert"
    >
      <div className="max-w-[min(420px,calc(100vw-40px))] border border-[rgba(217,96,111,0.4)] bg-panel-solid px-7 py-6 text-sm leading-6 text-[#e6b7bd]">
        <p className="m-0 break-words">{message}</p>
      </div>
    </div>
  )
}
