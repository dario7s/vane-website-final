import { createPrivateKey, sign, type KeyObject } from 'node:crypto'

/**
 * The download token of the staging site. The download host (`infra/download-worker/src/handle.js` in the MQS
 * repository) checks it. Format: `base64url(payload JSON) "." base64url(Ed25519 signature over the first part)`.
 * The payload is exactly `{ v: 1, aud, sub, ch, iat, exp }`.
 * This branch signs the token itself with a staging key that opens the channel `test` only.
 * In production, the MQS service gives the token after the visitor signs in (`POST /v1/downloads/token`).
 */
export const DOWNLOAD_AUDIENCE = 'download.vanescience.com'
export const STAGING_SUBJECT = 'website-staging'
/** The longest token of this site. The download host accepts one hour at most. */
export const TOKEN_LIFETIME_SECONDS = 600

export type DownloadTokenPayload = {
  v: 1
  aud: typeof DOWNLOAD_AUDIENCE
  sub: string
  ch: string[]
  iat: number
  exp: number
}

/** The private key from the one-line JWK `{ kty: "OKP", crv: "Ed25519", x, d }`, or null when it is not usable. */
export function signingKeyFromJwk(text: string | undefined): KeyObject | null {
  if (!text || !text.trim()) return null
  try {
    const jwk = JSON.parse(text)
    if (jwk?.kty !== 'OKP' || jwk?.crv !== 'Ed25519' || typeof jwk?.d !== 'string' || typeof jwk?.x !== 'string') return null
    const key = createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x, d: jwk.d }, format: 'jwk' })
    return key.asymmetricKeyType === 'ed25519' ? key : null
  } catch {
    return null
  }
}

export function signDownloadToken(key: KeyObject, channels: string[], nowSeconds: number): string {
  const payload: DownloadTokenPayload = {
    v: 1,
    aud: DOWNLOAD_AUDIENCE,
    sub: STAGING_SUBJECT,
    ch: channels,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = sign(null, Buffer.from(body, 'ascii'), key).toString('base64url')
  return `${body}.${signature}`
}
