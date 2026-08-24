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

const patched = await client.setAppleSecret(jwt);

if (patched.external_apple_secret !== jwt) {
    console.error("PATCH response did not echo the new secret in external_apple_secret");
    Deno.exit(1);
}

const config = await client.getAuthConfig();

if (config.external_apple_secret !== jwt) {
    console.error("Verification failed: external_apple_secret read back differs from the value written");
    Deno.exit(1);
}

console.log("Verified: Supabase auth config now holds the new secret");

const output = Deno.env.get("GITHUB_OUTPUT");

if (output) {
    await Deno.writeTextFile(output, `expires-at=${expiresAt.toISOString()}\n`, { append: true });
}
