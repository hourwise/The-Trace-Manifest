

  const preview = document.getElementById("preview");
  const status = document.getElementById("status");
  const button = document.getElementById("submit");
  const back = document.getElementById("return");
  try {
    const hash = location.hash.slice(1);
    if (hash.length > 30000) throw new Error("Capture is too large.");
    const raw = Uint8Array.from(atob(hash.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const handoff = JSON.parse(new TextDecoder().decode(raw));
    const p = typeof handoff.payload === "string" ? JSON.parse(handoff.payload) : null;
    if (!p || p.version !== 1 || !["social", "article", "lead"].includes(p.kind) || !/^[a-f0-9]{64}$/.test(handoff.challenge)) throw new Error("Invalid or missing handoff. Return to the saved capture and reopen it.");
    preview.textContent = `Intake: ${p.kind}\nURL: ${p.url || "(text lead)"}\nPlatform: ${p.platform || "(none)"}\nWhy: ${p.reason}\nNotes / provenance: ${p.notes}\nLead: ${p.lead}\nLocal capture: ${p.captureId}`;
    button.disabled = false;
    button.addEventListener("click", async () => {
      button.disabled = true;
      status.textContent = "Submitting and checking the private queue…";
      try {
        const response = await fetch("/api/admin/capture-submit", { method: "POST", credentials: "same-origin", redirect: "error",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(handoff), signal: AbortSignal.timeout(25000) });
        if (response.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("Authentication expired. Reload and sign in again.");
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in again with Cloudflare Access." : response.status === 403 ? "Publisher permission required." : result.error || `TRACE returned ${response.status}. Retry the same attempt.`);
        status.textContent = `${result.duplicate ? "Existing record found" : "Saved"}: ${result.kind} ${result.id}. Return to the app and verify the receipt.`;
        back.href = `tracecapture://receipt?requestId=${encodeURIComponent(p.requestId)}&receipt=${encodeURIComponent(result.receipt)}`;
        back.hidden = false;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Connection interrupted. Outcome uncertain; retry this same attempt.";
        button.disabled = false;
      }
    });
  } catch (error) { status.textContent = error instanceof Error ? error.message : "Invalid capture."; }

