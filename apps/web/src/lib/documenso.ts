// Thin wrapper around the Documenso REST API (self-hosted or documenso.com).
// Requires DOCUMENSO_API_URL / DOCUMENSO_API_KEY in apps/web/.env.local.
// See .env.example at the repo root and https://docs.documenso.com for the
// full API once an instance/key exists.

export async function createEnvelope(recipientEmail: string, recipientName: string) {
  const apiUrl = process.env.DOCUMENSO_API_URL;
  const apiKey = process.env.DOCUMENSO_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error("Documenso is not configured yet — set DOCUMENSO_API_URL / DOCUMENSO_API_KEY.");
  }

  const res = await fetch(`${apiUrl}/api/v1/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipients: [{ email: recipientEmail, name: recipientName }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Documenso request failed: ${res.status}`);
  }

  return res.json();
}
