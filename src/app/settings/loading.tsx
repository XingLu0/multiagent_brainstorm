export default function Loading() {
  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Back link skeleton */}
        <div className="mb-4 h-4 w-24 animate-pulse rounded bg-gray-200" />

        {/* Title skeleton */}
        <div className="mb-1 h-7 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mb-6 h-4 w-48 animate-pulse rounded bg-gray-200" />

        {/* Priority note skeleton */}
        <div className="mb-6 h-12 w-full animate-pulse rounded-lg bg-gray-200" />

        {/* Form fields skeleton */}
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="mb-1 h-4 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-10 w-full animate-pulse rounded-lg border border-gray-200 bg-white" />
            </div>
          ))}
          {/* Two-column fields */}
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i}>
                <div className="mb-1 h-4 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-10 w-full animate-pulse rounded-lg border border-gray-200 bg-white" />
              </div>
            ))}
          </div>
          {/* Search API key */}
          <div>
            <div className="mb-1 h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-10 w-full animate-pulse rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>

        {/* Buttons skeleton */}
        <div className="mt-6 flex justify-end gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </main>
  );
}
