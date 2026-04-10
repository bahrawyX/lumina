'use client'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <p className="text-muted-foreground text-sm">Something went wrong</p>
      <button
        onClick={reset}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm"
      >
        Try again
      </button>
    </div>
  )
}
