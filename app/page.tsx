import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";

const bundle = bundleJson as unknown as CompiledBundle;

export default function Viewer() {
  const projects = Object.values(bundle.projects);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>mockservers</h1>
      <p style={{ color: "#666" }}>
        build {bundle.commit} · {bundle.builtAt} · {projects.length} project(s)
        {bundle.warnings.length > 0 && ` · ${bundle.warnings.length} warning(s)`}
      </p>
      {projects.length === 0 && (
        <p>No projects configured. Add one under <code>mocks/</code>.</p>
      )}
      {projects.map((p) => (
        <section key={p.slug} style={{ borderTop: "1px solid #eee", paddingTop: 16, marginTop: 16 }}>
          <h2>
            {p.name} <code style={{ fontSize: 14, color: "#888" }}>/m/{p.slug}</code>
          </h2>
          {p.basePath && <p style={{ color: "#666" }}>basePath: <code>{p.basePath}</code></p>}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th align="left">method</th><th align="left">path</th>
                <th align="left">rule id</th><th align="left">status</th>
              </tr>
            </thead>
            <tbody>
              {p.routes.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f3f3" }}>
                  <td><code>{r.method}</code></td>
                  <td><code>{r.path}</code></td>
                  <td><code>{r.id}</code></td>
                  <td>{r.response.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
