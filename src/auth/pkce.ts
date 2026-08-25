import { randomBytes, createHash } from 'node:crypto'
export function createPkce() {
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
