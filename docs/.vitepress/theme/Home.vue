<script setup>
import { withBase } from 'vitepress'

const steps = [
  { n: '1', title: 'Create', text: 'Turn an upload, buffer, URL, or stream into a draft.' },
  { n: '2', title: 'Store', text: 'Write the bytes to local disk, S3 via Drive, or your own backend.' },
  { n: '3', title: 'Persist', text: 'Save ownership with Lucid - or any data store you like.' },
  { n: '4', title: 'Serve', text: 'Stream the file back, with optional image variants.' },
]

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

const features = [
  {
    title: 'One value, many sources',
    text: 'Uploads, buffers, Base64, paths, URLs, streams - always the same tiny API.',
    icon: svg('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
  },
  {
    title: 'Storage you choose',
    text: 'Local filesystem out of the box, Adonis Drive when you scale, or a custom adapter.',
    icon: svg('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'),
  },
  {
    title: 'Image variants',
    text: 'Thumbnails and responsive sizes with your own image library, inline or queued.',
    icon: svg('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  },
  {
    title: 'Persistence, your way',
    text: 'Lucid blob + link tables, a JSON column, or plain values in another ORM.',
    icon: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'),
  },
]
</script>

<template>
  <div class="aa-home">
    <!-- Hero -->
    <section class="aa-hero">
      <div class="aa-hero__text">
        <span class="aa-badge">Built for AdonisJS 7</span>
        <h1 class="aa-title">
          File uploads that<br />stay <span class="aa-grad">simple</span>.
        </h1>
        <p class="aa-lead">
          Store files, generate image variants, and persist them with Lucid - without
          coupling your models to the framework. Everything optional is opt-in.
        </p>
        <div class="aa-actions">
          <a class="aa-btn aa-btn--primary" :href="withBase('/guide/getting-started')">
            Get started in 5 min
          </a>
          <a class="aa-btn" :href="withBase('/guide/introduction')">Read the guide</a>
          <a class="aa-btn aa-btn--ghost" href="https://github.com/batosai/adonis-attachment" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>

      <div class="aa-hero__code" aria-hidden="true">
        <div class="aa-code">
          <div class="aa-code__bar">
            <span></span><span></span><span></span>
            <em>users_controller.ts</em>
          </div>
<pre><code><span class="c">// From an upload to a stored, model-owned file:</span>
<span class="k">import</span> { attachmentManager } <span class="k">from</span> <span class="s">'@jrmc/adonis-attachment'</span>

<span class="k">const</span> avatar = <span class="k">await</span> attachmentManager.<span class="f">createFromFile</span>(
  request.<span class="f">file</span>(<span class="s">'avatar'</span>)!
)

user.avatar.<span class="f">set</span>(avatar) <span class="c">// stage it</span>
<span class="k">await</span> user.<span class="f">save</span>() <span class="c">// stored + persisted</span>
</code></pre>
        </div>
      </div>
    </section>

    <!-- Flow -->
    <section class="aa-section">
      <h2 class="aa-h2">From upload to URL, in four steps</h2>
      <div class="aa-steps">
        <div class="aa-step" v-for="s in steps" :key="s.n">
          <div class="aa-step__n">{{ s.n }}</div>
          <h3>{{ s.title }}</h3>
          <p>{{ s.text }}</p>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="aa-section">
      <div class="aa-features">
        <div class="aa-feature" v-for="f in features" :key="f.title">
          <div class="aa-feature__icon" v-html="f.icon"></div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.text }}</p>
        </div>
      </div>
    </section>

    <!-- Persistence -->
    <section class="aa-section">
      <h2 class="aa-h2">Persist it your way</h2>
      <div class="aa-persist">
        <a class="aa-card" :href="withBase('/guide/lucid')">
          <h3>With Lucid</h3>
          <p>Blob + polymorphic link tables for ownership, ordered collections, variants,
            and cross-record blob reuse. A JSON-column mode is available for the simplest case.</p>
        </a>
        <a class="aa-card" :href="withBase('/guide/custom-persistence')">
          <h3>With any data store</h3>
          <p>Keep the plain <code>Attachment</code> value in Prisma, Kysely, raw SQL - or
            nothing. The package imposes no schema.</p>
        </a>
      </div>
    </section>

    <!-- CTA -->
    <section class="aa-cta">
      <h2>Ready to attach your first file?</h2>
      <p>Install, configure once, and ship uploads in minutes.</p>
      <a class="aa-btn aa-btn--primary" :href="withBase('/guide/getting-started')">
        Open the quickstart
      </a>
    </section>
  </div>
</template>

<style scoped>
.aa-home {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 96px;
}

/* Hero */
.aa-hero {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 48px;
  align-items: center;
  padding: 72px 0 40px;
}
.aa-badge {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  padding: 6px 12px;
  border-radius: 999px;
  margin-bottom: 22px;
}
.aa-title {
  font-size: 52px;
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 20px;
}
.aa-grad {
  background: linear-gradient(120deg, var(--aa-accent-from), var(--aa-accent-to));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.aa-lead {
  font-size: 18px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0 0 30px;
  max-width: 30em;
}
.aa-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.aa-btn {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  font-size: 15px;
  padding: 11px 20px;
  border-radius: 10px;
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-1);
  transition: all 0.2s ease;
}
.aa-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}
.aa-btn--primary {
  background: linear-gradient(120deg, var(--aa-accent-from), var(--aa-accent-to));
  border: none;
  color: #fff;
}
.aa-btn--primary:hover {
  color: #fff;
  filter: brightness(1.06);
}
.aa-btn--ghost {
  border-style: dashed;
}

/* Code card */
.aa-code {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-alt);
  box-shadow: 0 18px 50px -20px rgba(90, 69, 255, 0.35);
}
.aa-code__bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
}
.aa-code__bar span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--vp-c-gray-2);
}
.aa-code__bar em {
  margin-left: auto;
  font-style: normal;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}
.aa-code pre {
  margin: 0;
  padding: 20px;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13.5px;
  line-height: 1.7;
}
.aa-code .k { color: #c586c0; }
.aa-code .s { color: #4ec9b0; }
.aa-code .f { color: #6b52ff; }
.dark .aa-code .f { color: #a394ff; }
.aa-code .c { color: var(--vp-c-text-3); font-style: italic; }

/* Sections */
.aa-section { padding: 44px 0; }
.aa-h2 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-align: center;
  margin: 0 0 36px;
}

/* Steps */
.aa-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}
.aa-step {
  padding: 24px 20px;
  border-radius: 14px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
}
.aa-step__n {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(120deg, var(--aa-accent-from), var(--aa-accent-to));
  margin-bottom: 14px;
}
.aa-step h3 { margin: 0 0 8px; font-size: 17px; }
.aa-step p { margin: 0; color: var(--vp-c-text-2); font-size: 14px; line-height: 1.55; }

/* Features */
.aa-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}
.aa-feature {
  padding: 26px;
  border-radius: 14px;
  border: 1px solid var(--vp-c-border);
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.aa-feature:hover { border-color: var(--vp-c-brand-1); transform: translateY(-2px); }
.aa-feature__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  margin-bottom: 16px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.aa-feature__icon :deep(svg) { display: block; }
.aa-feature h3 { margin: 0 0 8px; font-size: 18px; }
.aa-feature p { margin: 0; color: var(--vp-c-text-2); line-height: 1.6; }

/* Persist cards */
.aa-persist {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}
.aa-card {
  display: block;
  padding: 28px;
  border-radius: 14px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.aa-card:hover { border-color: var(--vp-c-brand-1); transform: translateY(-2px); }
.aa-card h3 { margin: 0 0 10px; font-size: 19px; color: var(--vp-c-brand-1); }
.aa-card p { margin: 0; color: var(--vp-c-text-2); line-height: 1.6; }

/* CTA */
.aa-cta {
  margin-top: 40px;
  padding: 56px 24px;
  border-radius: 20px;
  text-align: center;
  background: var(--vp-c-brand-soft);
  border: 1px solid var(--vp-c-border);
}
.aa-cta h2 { font-size: 28px; font-weight: 700; margin: 0 0 8px; }
.aa-cta p { color: var(--vp-c-text-2); margin: 0 0 24px; }

/* Responsive */
@media (max-width: 860px) {
  .aa-hero { grid-template-columns: 1fr; padding-top: 48px; }
  .aa-title { font-size: 40px; }
  .aa-steps { grid-template-columns: repeat(2, 1fr); }
  .aa-features, .aa-persist { grid-template-columns: 1fr; }
}
@media (max-width: 500px) {
  .aa-steps { grid-template-columns: 1fr; }
  .aa-title { font-size: 34px; }
}
</style>
