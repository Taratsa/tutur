<script>
  import { onMount } from "svelte";
  import Icon from "../lib/Icon.svelte";
  import { normalizeWord, characterCount } from "@tutur/shared/normalization";
  import { sitePath } from "../lib/site.js";
  import { createSearchClient } from "../lib/search-client.js";

  let { initialType = "all", compact = false } = $props();
  const types = [
    { id: "all", label: "Semua", icon: "layers" },
    { id: "dictionary", label: "Kamus", icon: "book" },
    { id: "baku", label: "Baku & Nonbaku", icon: "check" },
    { id: "sinonim", label: "Sinonim", icon: "link" },
    { id: "antonim", label: "Antonim", icon: "swap" },
    { id: "slang", label: "Slang", icon: "comment" },
  ];
  const endpoint = import.meta.env.PUBLIC_SEARCH_API_URL || "http://localhost:3001/api/search";
  const client = createSearchClient({ endpoint });
  let queryInput = $state("");
  let query = $state("");
  let activeType = $state(initialType);
  let results = $state([]);
  let state = $state("idle");
  let statusMessage = $state("Ketik minimal dua karakter.");
  let inputTimer;

  function updateUrl() {
    const params = new URLSearchParams();
    if (queryInput.trim()) params.set("q", queryInput.trim());
    if (activeType !== "all") params.set("type", activeType);
    const search = params.toString();
    history.replaceState(null, "", `${location.pathname}${search ? `?${search}` : ""}`);
  }

  async function runSearch(nextQuery = query, nextType = activeType) {
    if (characterCount(nextQuery) < 2) {
      client.cancel();
      results = [];
      state = "idle";
      statusMessage = "Ketik minimal dua karakter.";
      return;
    }
    state = "loading";
    statusMessage = "Mencari.";
    try {
      const payload = await client.search(nextQuery, nextType);
      if (!payload) return;
      results = payload.results ?? [];
      state = results.length ? "success" : "empty";
      statusMessage = results.length ? `${results.length} hasil.` : "Tidak ditemukan.";
    } catch (error) {
      state = error.name === "TypeError" ? "offline" : "error";
      statusMessage = state === "offline" ? "API pencarian tidak dapat dijangkau." : error.message;
    }
  }

  function handleInput(event) {
    queryInput = event.currentTarget.value;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      query = normalizeWord(queryInput);
      updateUrl();
      runSearch();
    }, 200);
  }

  function chooseType(type) {
    activeType = type;
    updateUrl();
    if (characterCount(query) >= 2) runSearch(query, type);
  }

  function clearSearch() {
    queryInput = "";
    query = "";
    updateUrl();
    runSearch("");
  }

  onMount(() => {
    const params = new URLSearchParams(location.search);
    const requestedType = params.get("type");
    activeType = types.some((type) => type.id === requestedType) ? requestedType : initialType;
    queryInput = params.get("q") ?? "";
    query = normalizeWord(queryInput);
    if (characterCount(query) >= 2) runSearch();
    return () => {
      clearTimeout(inputTimer);
      client.cancel();
    };
  });

  const typeLabel = (type) => types.find((item) => item.id === type)?.label ?? type;
</script>

<section
  class="search-engine-hero"
  class:compact
  class:has-query={characterCount(queryInput) >= 2}
  aria-labelledby={compact ? undefined : "search-title"}
>
  {#if !compact}
    <div class="search-engine-copy">
      <p class="eyebrow"><span></span>Dataset terbuka · Bukan layanan resmi</p>
      <h1 id="search-title">Cari kata.<br /><em>Lihat artinya.</em></h1>
      <p>Cari arti, kata baku, sinonim, atau antonim.</p>
    </div>
  {/if}
  <div class="engine-search">
    <Icon name="search" size={23} />
    <label class="sr-only" for="dictionary-search">Cari seluruh koleksi</label>
    <input
      id="dictionary-search"
      value={queryInput}
      oninput={handleInput}
      placeholder="Cari kata…"
      autocomplete="off"
      spellcheck="false"
      aria-describedby="search-help"
    />
    {#if state === "loading"}<i class="mini-spinner" aria-hidden="true"></i>{/if}
    {#if queryInput}<button type="button" aria-label="Hapus pencarian" onclick={clearSearch}
        >×</button
      >{/if}
  </div>
  <p id="search-help" class="search-help">Minimal dua karakter.</p>
  <div class="engine-filters" role="group" aria-label="Filter tipe data">
    {#each types as type}<button
        class:active={activeType === type.id}
        type="button"
        aria-pressed={activeType === type.id}
        onclick={() => chooseType(type.id)}><Icon name={type.icon} size={11} />{type.label}</button
      >{/each}
  </div>
</section>

<section class="search-results section-wrap" aria-labelledby="results-title">
  <p class="sr-only" aria-live="polite">{statusMessage}</p>
  {#if state === "idle"}
    <div class="engine-empty">
      <span>Aa</span>
      <h2 id="results-title">Masukkan kata.</h2>
      <p>Pilih filter untuk membatasi hasil.</p>
    </div>
  {:else if state === "loading"}
    <div class="loading-state compact" role="status">
      <span class="loading-spinner" aria-hidden="true"></span>
      <div><strong id="results-title">Mencari…</strong></div>
    </div>
  {:else if state === "empty"}
    <div class="engine-empty">
      <span>?</span>
      <h2 id="results-title">Tidak ditemukan.</h2>
      <p>Coba kata lain atau pilih “Semua”.</p>
    </div>
  {:else if state === "offline" || state === "error"}
    <div class="message error" role="alert">
      <h2 id="results-title">Pencarian gagal.</h2>
      <p>{statusMessage}</p>
      <p>Halaman kata tetap dapat dibuka tanpa JavaScript.</p>
    </div>
  {:else}
    <header class="results-heading">
      <div>
        <p class="eyebrow"><span></span>Hasil pencarian · {typeLabel(activeType)}</p>
        <h2 id="results-title">“{query}”</h2>
      </div>
      <strong>{results.length} hasil</strong>
    </header>
    <div class="unified-results">
      {#each results as result}
        {#if result.url}<a class="unified-result" href={sitePath(result.url)}
            ><span class="result-type">{typeLabel(result.type)}</span>
            <div class="result-copy">
              <h3>
                {result.word}{#if result.counterpart}<span
                    >{result.type === "baku" || result.type === "antonim"
                      ? " ≠ "
                      : " ≈ "}{result.counterpart}</span
                  >{/if}
              </h3>
              <p>{result.summary}</p>
            </div>
            <span class="result-arrow" aria-hidden="true">→</span></a
          >
        {:else}<div class="unified-result">
            <span class="result-type">{typeLabel(result.type)}</span>
            <div class="result-copy">
              <h3>
                {result.word}{#if result.counterpart}<span
                    >{result.type === "baku" || result.type === "antonim"
                      ? " ≠ "
                      : " ≈ "}{result.counterpart}</span
                  >{/if}
              </h3>
              <p>{result.summary}</p>
            </div>
          </div>{/if}
      {/each}
    </div>
  {/if}
</section>
