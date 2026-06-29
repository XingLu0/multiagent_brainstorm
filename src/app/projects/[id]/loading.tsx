export default function Loading() {
  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto flex h-full max-w-4xl flex-col px-4 py-4">
        {/* Header skeleton */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-200" />
          </div>
        </div>

        {/* Dashboard skeleton */}
        <div className="mb-3 h-16 animate-pulse rounded-lg bg-gray-200" />

        {/* Chat area skeleton */}
        <div className="flex-1 space-y-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
              <div className="flex items-start gap-2" style={{ maxWidth: "70%" }}>
                {i % 2 !== 0 && (
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
                )}
                <div className="space-y-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
                  <div className="h-16 w-64 animate-pulse rounded-2xl bg-gray-200" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input bar skeleton */}
        <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3">
          <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </main>
  );
}
