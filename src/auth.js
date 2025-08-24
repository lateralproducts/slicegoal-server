// auth.js
import { createRemoteJWKSet, jwtVerify } from 'jose'
import DbConnection from './database'

const ISSUER   = `https://lateralproducts.au.auth0.com/`
const AUDIENCE = 'https://lateralproducts.au.auth0.com/api/v2/'
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`))

function getBearer(req) {
  const raw = req.headers.authorization || req.headers.Authorization
  if (!raw) return null
  const h = Array.isArray(raw) ? raw[0] : raw
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : null
}

export async function getBearerClaimsFromContext(context) {
  const token = getBearer(context.req)
  if (!token || !/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token)) {
    // (optional) console.debug('Non-JWT or missing bearer token')
    console.log('Non-JWT or missing bearer token')
    return null
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: '5s',
    })

    return payload
  } catch (err) {
    console.log('JWT verify failed:', err.code || err.message)
    // (optional) console.debug('JWT verify failed:', err.code || err.message)
    return null
  }
}

export async function getuserbysub(sub) {
    const db = await DbConnection.Get()
    const UserData = await db.collection('users').findOne({auth_sub: sub})
    return UserData
}

export async function getprofilebyuserid(userid) {
    const db = await DbConnection.Get()
    const UserData = await db.collection('profiles').findOne({user: userid})
    return UserData
}

/* function debugToken(token) {
    try {
      const claims = decodeJwt(token)
      console.log('🔎 JWT claims:', {
        iss: claims.iss,
        aud: claims.aud,
        exp: claims.exp,
        nbf: claims.nbf,
        iat: claims.iat,
      })
      return claims
    } catch (e) {
      console.log('Not a JWT:', e)
      return null
    }
} */
