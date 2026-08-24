export interface AuthConfig {
    external_apple_secret?: string | null;
    external_apple_client_id?: string | null;
    [key: string]: unknown;
}

export class SupabaseClient {
    private readonly url: string;

    constructor(projectRef: string, private readonly accessToken: string) {
        this.url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
    }

    private async request(method: "GET" | "PATCH", body?: unknown): Promise<AuthConfig> {
        const response = await fetch(this.url, {
            method,
            headers: {
                authorization: `Bearer ${this.accessToken}`,
                ...body !== undefined ? { "content-type": "application/json" } : {},
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        const text = await response.text();

        if (!response.ok) {
            throw new Error(`${method} ${this.url} failed with ${response.status}: ${text}`);
        }

        try {
            return JSON.parse(text);
        }
        catch {
            throw new Error(`${method} ${this.url} returned a non-JSON body (status ${response.status})`);
        }
    }

    public getAuthConfig(): Promise<AuthConfig> {
        return this.request("GET");
    }

    // The client id rides along with every rotation: the secret's `sub`
    // claim is minted for exactly that id, and the pair is only valid
    // together — a fresh secret against a stale or missing client id is
    // broken config that would otherwise verify green.
    public setAppleSecret(secret: string, clientId: string): Promise<AuthConfig> {
        return this.request("PATCH", {
            external_apple_secret: secret,
            external_apple_client_id: clientId,
        });
    }
}
