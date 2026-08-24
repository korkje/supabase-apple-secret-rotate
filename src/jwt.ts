// Apple rejects client secrets with a lifetime above 6 months.
export const MAX_EXPIRES_IN = 15777000;

const encoder = new TextEncoder();

const b64url = (data: Uint8Array): string =>
    btoa(String.fromCharCode(...data))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");

export const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
    const body = pem
        .replaceAll("\\n", "\n")
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s+/g, "");

    const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));

    return await crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
    );
};

export interface MintOptions {
    teamId: string;
    keyId: string;
    clientId: string;
    privateKey: string;
    expiresIn: number;
}

export interface Minted {
    jwt: string;
    expiresAt: Date;
}

export const mint = async (options: MintOptions): Promise<Minted> => {
    const { teamId, keyId, clientId, privateKey, expiresIn } = options;

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + expiresIn;

    const header = { alg: "ES256", kid: keyId };

    const claims = {
        iss: teamId,
        sub: clientId,
        aud: "https://appleid.apple.com",
        iat,
        exp,
    };

    const signingInput = [header, claims]
        .map(part => b64url(encoder.encode(JSON.stringify(part))))
        .join(".");

    const key = await importPrivateKey(privateKey);

    // Web Crypto returns the raw r||s signature JOSE requires (unlike
    // node:crypto's default DER, which Apple rejects).
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        encoder.encode(signingInput),
    );

    return {
        jwt: `${signingInput}.${b64url(new Uint8Array(signature))}`,
        expiresAt: new Date(exp * 1000),
    };
};
