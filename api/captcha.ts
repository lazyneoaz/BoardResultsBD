export const config = { runtime: "edge" };

const BASE_URL = "https://www.educationboardresults.gov.bd";
const CAPTCHA_URL = `${BASE_URL}/v2/captcha`;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": `${BASE_URL}/v2/home`,
  "Origin": BASE_URL,
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractCookies(headers: Headers): string {
  const raw = headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(",").map((c: string) => c.split(";")[0].trim()).join("; ");
}

export default async function handler(_req: Request): Promise<Response> {
  const unique = Date.now();
  try {
    const captchaRes = await fetch(`${CAPTCHA_URL}?t=${unique}`, {
      headers: {
        ...BROWSER_HEADERS,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!captchaRes.ok) {
      return Response.json(
        { error: `Official CAPTCHA service returned HTTP ${captchaRes.status}` },
        { status: 502 },
      );
    }

    const sessionCookie = extractCookies(captchaRes.headers);
    const contentType = captchaRes.headers.get("content-type") || "image/jpeg";
    const buffer = await captchaRes.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const imageData = `data:${contentType};base64,${base64}`;

    return Response.json({ imageData, sessionCookie });
  } catch (err) {
    return Response.json(
      { error: "Cannot reach the official results server.", detail: String(err) },
      { status: 502 },
    );
  }
}
