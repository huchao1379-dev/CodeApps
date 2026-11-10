/** Runs async workers over items with a fixed concurrency limit. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let done = 0
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), Math.max(1, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const current = nextIndex
        nextIndex += 1
        results[current] = await worker(items[current] as T, current)
        done += 1
        onProgress?.(done, items.length)
      }
    },
  )
  await Promise.all(runners)
  return results
}
