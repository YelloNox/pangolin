/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { clients, db, HostMeta, primaryDb, sites, users } from "@server/db";
import { hostMeta, licenseKey } from "@server/db";
import logger from "@server/logger";
import { createLocalCache } from "@server/lib/createLocalCache";
import { validateJWT } from "./licenseJwt";
import { count, eq, isNull } from "drizzle-orm";
import moment from "moment";
import { encrypt, decrypt } from "@server/lib/crypto";
import {
    LicenseKeyCache,
    LicenseKeyTier,
    LicenseKeyType,
    LicenseStatus
} from "@server/license/license";
import { setHostMeta } from "@server/lib/hostMeta";
import { build } from "@server/build";

type ActivateLicenseKeyAPIResponse = {
    data: {
        instanceId: string;
    };
    success: boolean;
    error: string;
    message: string;
    status: number;
};

type ValidateLicenseAPIResponse = {
    data: {
        licenseKeys: {
            [key: string]: string;
        };
    };
    success: boolean;
    error: string;
    message: string;
    status: number;
};

// Ranks license tiers so that when multiple license keys are active, the
// highest tier among them wins. Order: personal < tier1 < tier2 < ... <
// tier[n] < enterprise. Tier numbers are parsed so this scales to any
// tier[n] without needing updates here.
function tierRank(tier?: LicenseKeyTier): number {
    if (!tier) {
        return -1;
    }
    if (tier === "enterprise") {
        return Number.MAX_SAFE_INTEGER;
    }
    if (tier === "personal") {
        return 0;
    }
    const match = /^tier(\d+)$/.exec(tier);
    if (match) {
        return parseInt(match[1], 10);
    }
    return 0;
}

type TokenPayload = {
    valid: boolean;
    type: LicenseKeyType;
    tier: LicenseKeyTier;
    quantity: number;
    quantity_2: number;
    quantity_3: number;
    terminateAt: string; // ISO
    iat: number; // Issued at
};

export class License {
    private phoneHomeInterval = 6 * 60 * 60; // 6 hours = 6 * 60 * 60 = 21600 seconds
    private serverBaseUrl = "https://api.fossorial.io";
    private validationServerUrl = `${this.serverBaseUrl}/api/v1/license/enterprise/validate`;
    private activationServerUrl = `${this.serverBaseUrl}/api/v1/license/enterprise/activate`;

    private statusCache = createLocalCache();
    private licenseKeyCache = createLocalCache();

    private statusKey = "status";
    // Fingerprint of the license key rows the cached status was computed
    // from. The caches are per-process, so when another node activates or
    // deletes a key this no longer matches the DB and forces a recheck.
    private keysFingerprint: string | undefined;
    private serverSecret!: string;
    private phoneHomeFailureCount = 0;
    private checkInProgress = false;
    private doRecheck = false;

    private publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx9RKc8cw+G8r7h/xeozF
FNkRDggQfYO6Ae+EWHGujZ9WYAZ10spLh9F/zoLhhr3XhsjpoRXwMfgNuO5HstWf
CYM20I0l7EUUMWEyWd4tZLd+5XQ4jY5xWOCWyFJAGQSp7flcRmxdfde+l+xg9eKl
apbY84aVp09/GqM96hCS+CsQZrhohu/aOqYVB/eAhF01qsbmiZ7Y3WtdhTldveYt
h4mZWGmjf8d/aEgePf/tk1gp0BUxf+Ae5yqoAqU+6aiFbjJ7q1kgxc18PWFGfE9y
zSk+OZk887N5ThQ52154+oOUCMMR2Y3t5OH1hVZod51vuY2u5LsQXsf+87PwB91y
LQIDAQAB
-----END PUBLIC KEY-----`;

    constructor(private hostMeta: HostMeta) {
        setInterval(async () => {
            this.doRecheck = true;
            await this.check();
            this.doRecheck = false;
        }, 1000 * this.phoneHomeInterval);
    }

    public listKeys(): LicenseKeyCache[] {
        const keys = this.licenseKeyCache.keys();
        return keys.map((key) => {
            return this.licenseKeyCache.get<LicenseKeyCache>(key)!;
        });
    }

    public setServerSecret(secret: string) {
        this.serverSecret = secret;
    }

    public async forceRecheck() {
        this.phoneHomeFailureCount = 0;

        // Force a fresh check without discarding the last known good cache
        // up front — check() only replaces the cache once it has a fresh
        // result, so a failed recheck (e.g. a transient server error) won't
        // leave listKeys()/status looking empty in the meantime.
        this.doRecheck = true;
        try {
            return await this.check();
        } finally {
            this.doRecheck = false;
        }
    }

    public async isUnlocked(): Promise<boolean> {
        return true;
    }

    public async hasTier(tier: LicenseKeyTier[]): Promise<boolean> {
        return true;
    }

    public async check(): Promise<LicenseStatus> {
        const [siteCountRes] = await db.select({ value: count() }).from(sites);
        const [userCountRes] = await db.select({ value: count() }).from(users);
        const [machineCountRes] = await db
            .select({ value: count() })
            .from(clients)
            .where(isNull(clients.userId));

        const status: LicenseStatus = {
            hostId: this.hostMeta.hostMetaId,
            isHostLicensed: true,
            isLicenseValid: true,
            tier: "enterprise",
            usedSites: siteCountRes?.value ?? 0,
            usedUsers: userCountRes?.value ?? 0,
            usedMachines: machineCountRes?.value ?? 0,
            maxSites: -1,
            maxUsers: -1,
            maxMachines: -1
        };

        this.statusCache.set(this.statusKey, status, 0);
        return status;
    }

    private fingerprintKeys(rows: { licenseKeyId: string }[]): string {
        return rows
            .map((row) => row.licenseKeyId)
            .sort()
            .join("|");
    }

    public async activateLicenseKey(key: string) {
        // Encrypt the license key before storing
        const encryptedKey = encrypt(key, this.serverSecret);

        const [existingKey] = await db
            .select()
            .from(licenseKey)
            .where(eq(licenseKey.licenseKeyId, encryptedKey))
            .limit(1);

        if (existingKey) {
            throw new Error("License key already exists");
        }

        let instanceId: string | undefined;
        try {
            // Call activate
            const apiResponse = await fetch(this.activationServerUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    licenseKey: key,
                    instanceName: this.hostMeta.hostMetaId
                })
            });

            const data = await apiResponse.json();

            if (!data.success) {
                throw new Error(`${data.message || data.error}`);
            }

            const response = data as ActivateLicenseKeyAPIResponse;

            if (!response.data) {
                throw new Error("No response from server");
            }

            if (!response.data.instanceId) {
                throw new Error("No instance ID in response");
            }

            logger.debug("Activated license key, instance ID:", {
                instanceId: response.data.instanceId
            });

            instanceId = response.data.instanceId;
        } catch (error) {
            throw Error(`Error activating license key: ${error}`);
        }

        // Phone home to validate license key
        const keys = [
            {
                licenseKey: key,
                instanceId: instanceId!
            }
        ];

        let validateResponse: ValidateLicenseAPIResponse;
        try {
            validateResponse = await this.phoneHome(keys, false);

            if (!validateResponse) {
                throw new Error("No response from server");
            }

            if (!validateResponse.success) {
                throw new Error(validateResponse.error);
            }

            // Validate the license key
            const licenseKeyRes = validateResponse.data.licenseKeys[key];
            if (!licenseKeyRes) {
                throw new Error("Invalid license key");
            }

            const payload = validateJWT<TokenPayload>(
                licenseKeyRes,
                this.publicKey
            );

            if (!payload.valid) {
                throw new Error("Invalid license key");
            }

            const encryptedToken = encrypt(licenseKeyRes, this.serverSecret);
            // Encrypt the instanceId before storing
            const encryptedInstanceId = encrypt(instanceId!, this.serverSecret);

            // Store the license key in the database
            await db.insert(licenseKey).values({
                licenseKeyId: encryptedKey,
                token: encryptedToken,
                instanceId: encryptedInstanceId
            });
        } catch (error) {
            throw Error(`Error validating license key: ${error}`);
        }

        // Invalidate the cache and re-compute the status
        return await this.forceRecheck();
    }

    private async phoneHome(
        keys: {
            licenseKey: string;
            instanceId: string;
        }[],
        doDecrypt = true
    ): Promise<ValidateLicenseAPIResponse> {
        // Decrypt the instanceIds before sending to the server
        const decryptedKeys = keys.map((key) => ({
            licenseKey: key.licenseKey,
            instanceId:
                key.instanceId && doDecrypt
                    ? decrypt(key.instanceId, this.serverSecret)
                    : key.instanceId
        }));

        const maxAttempts = 10;
        const initialRetryDelay = 1 * 1000; // 1 seconds
        const exponentialFactor = 1.2;

        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetch(this.validationServerUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        licenseKeys: decryptedKeys,
                        instanceName: this.hostMeta.hostMetaId
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                return data as ValidateLicenseAPIResponse;
            } catch (error) {
                lastError =
                    error instanceof Error ? error : new Error(String(error));

                if (attempt < maxAttempts) {
                    // Calculate exponential backoff delay
                    const retryDelay = Math.floor(
                        initialRetryDelay *
                            Math.pow(exponentialFactor, attempt - 1)
                    );

                    logger.debug(
                        `License validation request failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryDelay} ms...`
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, retryDelay)
                    );
                } else {
                    logger.error(
                        `License validation request failed after ${maxAttempts} attempts`
                    );
                    throw lastError;
                }
            }
        }

        throw lastError || new Error("License validation request failed");
    }
}

await setHostMeta();

const [info] = await db.select().from(hostMeta).limit(1);

if (!info) {
    throw new Error("Host information not found");
}

export const license = new License(info);

export default license;
