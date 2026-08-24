import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { MAX_EXPIRES_IN, mint } from "./jwt.ts";

const decode = (part: string): Record<string, unknown> => {
    const b64 = part.replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(b64));
};

const generatePem = async (): Promise<{ pem: string; publicKey: CryptoKey }> => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
    );

    const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
    const b64 = btoa(String.fromCharCode(...der));
    const lines = b64.match(/.{1,64}/g)!.join("\n");

    return {
        pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`,
        publicKey,
    };
};

const options = {
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    clientId: "tv.example.signin",
    expiresIn: MAX_EXPIRES_IN,
};

Deno.test("mint produces a valid ES256 JWT with Apple's expected header and claims", async () => {
    const { pem, publicKey } = await generatePem();

    const before = Math.floor(Date.now() / 1000);
    const { jwt, expiresAt } = await mint({ ...options, privateKey: pem });
    const after = Math.floor(Date.now() / 1000);

    assertMatch(jwt, /^[\w-]+\.[\w-]+\.[\w-]+$/);

    const [rawHeader, rawClaims, rawSignature] = jwt.split(".");

    assertEquals(decode(rawHeader), { alg: "ES256", kid: options.keyId });

    const claims = decode(rawClaims);

    assertEquals(claims.iss, options.teamId);
    assertEquals(claims.sub, options.clientId);
    assertEquals(claims.aud, "https://appleid.apple.com");

    const iat = claims.iat as number;
    const exp = claims.exp as number;

    assert(iat >= before && iat <= after);
    assertEquals(exp, iat + options.expiresIn);
    assertEquals(expiresAt.getTime(), exp * 1000);

    const signature = Uint8Array.from(
        atob(rawSignature.replaceAll("-", "+").replaceAll("_", "/")),
        c => c.charCodeAt(0),
    );

    // JOSE mandates the raw 64-byte r||s form, not DER.
    assertEquals(signature.length, 64);

    const verified = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        new TextEncoder().encode(`${rawHeader}.${rawClaims}`),
    );

    assert(verified);
});

Deno.test("mint accepts a PEM with escaped newlines", async () => {
    const { pem, publicKey } = await generatePem();
    const escaped = pem.replaceAll("\n", "\\n");

    const { jwt } = await mint({ ...options, privateKey: escaped });

    const [rawHeader, rawClaims, rawSignature] = jwt.split(".");

    const signature = Uint8Array.from(
        atob(rawSignature.replaceAll("-", "+").replaceAll("_", "/")),
        c => c.charCodeAt(0),
    );

    const verified = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        new TextEncoder().encode(`${rawHeader}.${rawClaims}`),
    );

    assert(verified);
});
