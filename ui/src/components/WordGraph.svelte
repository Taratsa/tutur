<script>
  // Graf kata gaya Leipzig: node = kata yang muncul sekaling dengan kata kunci,
  // edge berlabel frekuensi co-occurrence. Interaksi: drag node, klik untuk
  // membuka halaman kata (jika node punya slug).
  import { onMount } from "svelte";

  let { word, anchorId, nodes = [], edges = [], slug = null } = $props();

  const WIDTH = 640;
  const HEIGHT = 420;
  const CENTER_X = WIDTH / 2;
  const CENTER_Y = HEIGHT / 2;

  const weightOf = (node) => Math.max(node.sig, 1);
  const nodeRadius = (node) => Math.max(9, Math.min(24, 7 + Math.sqrt(weightOf(node)) * 3.4));
  const anchorRadius = 26;

  function initialNodes() {
    const partners = nodes.length;
    return nodes.map((node, index) => {
      const angle = (index / partners) * Math.PI * 2 - Math.PI / 2;
      const distance = 150 + (index % 3) * 22;
      return {
        ...node,
        x: CENTER_X + Math.cos(angle) * distance,
        y: CENTER_Y + Math.sin(angle) * distance,
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });
  }

  let simNodes = $state(initialNodes());
  let dragging = $state(-1);
  let moved = $state(false);
  let frame = 0;
  let cooling = 1;

  const anchorPos = { x: CENTER_X, y: CENTER_Y };
  const edgeOf = (edge) => {
    if (edge[0] === anchorId) return [anchorPos, simNodes.find((n) => n.id === edge[1])];
    if (edge[1] === anchorId) return [anchorPos, simNodes.find((n) => n.id === edge[0])];
    return [simNodes.find((n) => n.id === edge[0]), simNodes.find((n) => n.id === edge[1])];
  };

  function tick() {
    const alpha = 0.12 * cooling;
    for (let i = 0; i < simNodes.length; i += 1) {
      const a = simNodes[i];
      for (let j = i + 1; j < simNodes.length; j += 1) {
        const b = simNodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.max(Math.hypot(dx, dy), 24);
        const push = (4200 / (dist * dist)) * alpha;
        const fx = (dx / dist) * push;
        const fy = (dy / dist) * push;
        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }
    for (const edge of edges) {
      const [pa, pb] = edgeOf(edge);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.max(Math.hypot(dx, dy), 12);
      const ideal = Math.max(64, 190 - edge[2] * 4);
      const pull = ((dist - ideal) / dist) * 0.06 * alpha * 6;
      const fx = dx * pull;
      const fy = dy * pull;
      const aIsAnchor = pa === anchorPos;
      const bIsAnchor = pb === anchorPos;
      if (!aIsAnchor && !a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!bIsAnchor && !b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const node of simNodes) {
      if (node.fixed) continue;
      node.vx += (CENTER_X - node.x) * 0.004 * cooling;
      node.vy += (CENTER_Y - node.y) * 0.004 * cooling;
      node.x += Math.max(-14, Math.min(14, node.vx));
      node.y += Math.max(-14, Math.min(14, node.vy));
      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x = Math.max(30, Math.min(WIDTH - 30, node.x));
      node.y = Math.max(24, Math.min(HEIGHT - 24, node.y));
    }
  }

  function schedule() {
    cooling = Math.max(0.25, cooling * 0.985);
    tick();
    frame += 1;
    if (frame < 260) requestAnimationFrame(schedule);
  }

  onMount(() => {
    requestAnimationFrame(schedule);
    return () => cancelAnimationFrame(frame);
  });

  function startDrag(event, index) {
    moved = false;
    dragging = index;
    simNodes[index].fixed = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (dragging === -1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const node = simNodes[dragging];
    if (Math.hypot(node.x - x, node.y - y) > 3) moved = true;
    node.x = Math.max(30, Math.min(WIDTH - 30, x));
    node.y = Math.max(24, Math.min(HEIGHT - 24, y));
    node.vx = 0;
    node.vy = 0;
  }

  function endDrag() {
    if (dragging !== -1) simNodes[dragging].fixed = false;
    dragging = -1;
    cooling = 0.8;
    frame = 0;
    requestAnimationFrame(schedule);
  }
</script>

<div class="word-graph-frame">
  <svg
    class="word-graph"
    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    aria-hidden="true"
    onpointermove={moveDrag}
    onpointerup={endDrag}
    onpointerleave={endDrag}
  >
    {#each edges as edge}
      {@const [pa, pb] = edgeOf(edge)}
      {#if pa && pb}
        <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} class="graph-edge" />
        <text class="graph-edge-label" x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2}>
          {edge[2]}
        </text>
      {/if}
    {/each}
    {#each simNodes as node, index}
      {@const linked = Boolean(node.slug)}
      <g
        class="graph-node"
        class:linked={Boolean(node.slug)}
        transform={`translate(${node.x} ${node.y})`}
        onpointerdown={(event) => startDrag(event, index)}
        onclick={() => {
          if (!moved && node.slug) window.location.assign(`/kata/${node.slug}/`);
        }}
      >
        <circle class:linked={Boolean(node.slug)} r={nodeRadius(node)} />
        <text y={4} text-anchor="middle">{node.word}</text>
      </g>
    {/each}
    <g class="graph-anchor">
      <circle cx={CENTER_X} cy={CENTER_Y} r={anchorRadius} />
      <text x={CENTER_X} y={CENTER_Y + 4} text-anchor="middle">{word}</text>
    </g>
  </svg>
  <p class="word-graph-help">
    Seret node untuk menata ulang. {slug
      ? "Klik node bersambungan untuk membuka halaman kata."
      : ""}
  </p>
</div>
