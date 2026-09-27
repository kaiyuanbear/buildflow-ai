import { useEffect, useState } from "react";
import type { HealthResponse } from "@buildflow/contracts";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("API health check failed");
        return (await response.json()) as HealthResponse;
      })
      .then(setHealth)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unknown error"));
  }, []);

  return (
    <main className="landing-shell">
      <section className="hero-card">
        <p className="eyebrow">AI APP BUILDER</p>
        <h1>BuildFlow AI</h1>
        <p className="lede">Turn a product request into a visible agent workflow, generated files, and a working preview.</p>
        <div className="status-card" role="status">
          <span className={health ? "status-dot online" : "status-dot"} />
          {health ? `API connected · ${health.service}` : error ? `API unavailable · ${error}` : "Checking API connection…"}
        </div>
      </section>
    </main>
  );
}
