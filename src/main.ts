import { MAX_EXPIRES_IN, mint } from "./jwt.ts";
import { SupabaseClient } from "./supabase.ts";

const input = (name: string): string => {
    const value = Deno.env.get(`INPUT_${name.replaceAll("-", "_").toUpperCase()}`)?.trim();

    if (!value) {
        console.error(`Missing required input "${name}"`);
        Deno.exit(1);
    }

    return value;
};

const teamId = input("apple-team-id");
const keyId = input("apple-key-id");
const clientId = input("apple-client-id");
const privateKey = input("apple-private-key");
const projectRef = input("supabase-project-ref");
const accessToken = input("supabase-access-token");

const expiresIn = Number(input("expires-in"));

if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
    console.error(`Input "expires-in" must be a positive integer (seconds)`);
    Deno.exit(1);
}

if (expiresIn > MAX_EXPIRES_IN) {
    console.error(`Input "expires-in" exceeds Apple's maximum of ${MAX_EXPIRES_IN} seconds`);
    Deno.exit(1);
}

const { jwt, expiresAt } = await mint({ teamId, keyId, clientId, privateKey, expiresIn });

// The minted JWT is the secret — mask it before anything else can log it.
console.log(`::add-mask::${jwt}`);

console.log(`Minted new Apple client secret, expires at ${expiresAt.toISOString()}`);

const client = new SupabaseClient(projectRef, accessToken);

const patched = await client.setAppleSecret(jwt, clientId);

// The API sanitizes secret values in responses (the dashboard shows them
// masked for the same reason), so the plaintext never comes back and can't
// be compared. Verify with what the API does echo: the non-secret client id
// written in the same PATCH must match exactly, and the secret field must
// be present and non-empty.
const verify = (config: typeof patched, source: string) => {
    if (config.external_apple_client_id !== clientId) {
        console.error(
            `Verification failed: ${source} has external_apple_client_id ` +
                `"${config.external_apple_client_id ?? ""}", expected "${clientId}"`,
        );
        Deno.exit(1);
    }

    if (!config.external_apple_secret) {
        console.error(`Verification failed: ${source} has no external_apple_secret`);
        Deno.exit(1);
    }
};

verify(patched, "PATCH response");
verify(await client.getAuthConfig(), "auth config read-back");

console.log("Verified: Supabase auth config holds a secret for the expected client id");

const output = Deno.env.get("GITHUB_OUTPUT");

if (output) {
    await Deno.writeTextFile(output, `expires-at=${expiresAt.toISOString()}\n`, { append: true });
}
