// Thin wrapper around MSG91's OTP API (v5), used for all three lead types
// (MERCHANT / LOCAL_BUYER / CONSULTANCY_LEAD). Requires MSG91_AUTH_KEY /
// MSG91_OTP_TEMPLATE_ID (a DLT-approved template) — same MSG91 account as
// Me2Us4U's other products, Babuki's own template id.
// See .env.example at the repo root and https://docs.msg91.com/otp.

const MSG91_BASE_URL = "https://control.msg91.com/api/v5";

function getConfig() {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;

  if (!authKey || !templateId) {
    throw new Error("MSG91 is not configured yet — set MSG91_AUTH_KEY / MSG91_OTP_TEMPLATE_ID.");
  }

  return { authKey, templateId };
}

// phone must already be in +91XXXXXXXXXX form; MSG91 expects it without the "+".
function toMsg91Mobile(phone: string) {
  return phone.replace(/^\+/, "");
}

export async function sendOtp(phone: string) {
  const { authKey, templateId } = getConfig();

  const url = new URL(`${MSG91_BASE_URL}/otp`);
  url.searchParams.set("mobile", toMsg91Mobile(phone));
  url.searchParams.set("template_id", templateId);
  if (process.env.MSG91_SENDER_ID) {
    url.searchParams.set("sender", process.env.MSG91_SENDER_ID);
  }

  const res = await fetch(url, { method: "POST", headers: { authkey: authKey } });
  const data = (await res.json()) as { type?: string; message?: string };

  if (!res.ok || data.type !== "success") {
    throw new Error(`MSG91 send-OTP failed: ${data.message ?? res.status}`);
  }
}

export async function verifyOtp(phone: string, otp: string) {
  const { authKey } = getConfig();

  const url = new URL(`${MSG91_BASE_URL}/otp/verify`);
  url.searchParams.set("mobile", toMsg91Mobile(phone));
  url.searchParams.set("otp", otp);

  const res = await fetch(url, { headers: { authkey: authKey } });
  const data = (await res.json()) as { type?: string };

  return res.ok && data.type === "success";
}
