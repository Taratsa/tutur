export function createSearchClient({ endpoint, fetchImpl = fetch }) {
  let controller;
  let requestId = 0;

  return {
    async search(query, type, limit = 20) {
      controller?.abort();
      controller = new AbortController();
      const currentId = ++requestId;
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      url.searchParams.set("type", type);
      url.searchParams.set("limit", String(limit));

      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Pencarian gagal (${response.status})`);
        }
        const payload = await response.json();
        return currentId === requestId ? payload : null;
      } catch (error) {
        if (error.name === "AbortError" || currentId !== requestId) return null;
        throw error;
      }
    },
    cancel() {
      requestId += 1;
      controller?.abort();
    },
  };
}
