// 此文件由后端公开契约导出命令生成，请勿手工修改。
export declare const contract: {
    api: {
        v1: {
            events: import("hono/client").ClientRequest<string, "/api/v1/events", {
                $get: {
                    input: {};
                    output: {};
                    outputFormat: string;
                    status: import("hono/utils/http-status").StatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            operations: import("hono/client").ClientRequest<string, "/api/v1/operations", {
                $get: {
                    input: {};
                    output: {
                        data: {
                            id: string;
                            actorUserId: string;
                            kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                            targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                            targetId: string;
                            status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                            phase: string;
                            outcome: string | null;
                            createdAt: string;
                            updatedAt: string;
                            finishedAt: string | null;
                            result: {
                                [x: string]: import("hono/utils/types").JSONValue;
                            } | null;
                            error: {
                                code: string;
                                message: string;
                            } | null;
                        }[];
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            operations: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/operations/:id", {
                    $get: {
                        input: {
                            param: {
                                id: string;
                            };
                        };
                        output: {
                            data: {
                                id: string;
                                actorUserId: string;
                                kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                targetId: string;
                                status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                phase: string;
                                outcome: string | null;
                                createdAt: string;
                                updatedAt: string;
                                finishedAt: string | null;
                                result: {
                                    [x: string]: import("hono/utils/types").JSONValue;
                                } | null;
                                error: {
                                    code: string;
                                    message: string;
                                } | null;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            operations: {
                ":id": {
                    reconcile: import("hono/client").ClientRequest<string, "/api/v1/operations/:id/reconcile", {
                        $post: {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                data: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: import("hono/utils/http-status").ContentfulStatusCode;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            auth: {
                login: import("hono/client").ClientRequest<string, "/api/v1/auth/login", {
                    $post: {
                        input: {
                            json: {
                                username: string;
                                password: string;
                            };
                        };
                        output: {
                            data: {
                                user: {
                                    id: string;
                                    username: string;
                                    role: import("./validation").Role;
                                    canManageAdmins: boolean;
                                };
                                csrfToken: string;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            auth: {
                logout: import("hono/client").ClientRequest<string, "/api/v1/auth/logout", {
                    $post: {
                        input: {};
                        output: {
                            data: {
                                loggedOut: true;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            auth: {
                me: import("hono/client").ClientRequest<string, "/api/v1/auth/me", {
                    $get: {
                        input: {};
                        output: {
                            data: {
                                user: {
                                    id: string;
                                    username: string;
                                    role: import("./validation").Role;
                                    canManageAdmins: boolean;
                                };
                                csrfToken: string;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            auth: {
                password: import("hono/client").ClientRequest<string, "/api/v1/auth/password", {
                    $post: {
                        input: {
                            json: {
                                newPassword: string;
                                currentPassword: string;
                            };
                        };
                        output: {
                            data: {
                                changed: true;
                                reauthenticate: true;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            accounts: import("hono/client").ClientRequest<string, "/api/v1/accounts", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            cashBalance: null;
                            availableCash: string | null;
                            hasCredentials: boolean;
                            source: "BINANCE_WALLET" | "UNAVAILABLE";
                            assetsAvailable: boolean;
                            assetMessage: string;
                            buyReady: boolean;
                            sellReady: boolean;
                            tradingReady: boolean;
                            quoteCurrency: 'USD';
                            settlementCurrency: 'USDC';
                            localSnapshot: {
                                cashBalance: null;
                                reservedCash: string;
                                availableCash: null;
                            };
                            externalSnapshot: {
                                source: "BINANCE_WALLET" | "UNAVAILABLE";
                                receivedAt: string | null;
                                cashBalance: null;
                                availableCash: string | null;
                                positions: null;
                            };
                            adminBlockReason: string | null;
                            adminTradingBlocked: boolean;
                            apiKeyLast4: string | null;
                            connectionMessage: string | null;
                            connectionStatus: string;
                            createdAt: string;
                            exchange: string;
                            id: string;
                            label: string;
                            lastSyncAt: string | null;
                            ownerUserId: string;
                            reservedCash: string;
                            status: string;
                            tradingEnabled: boolean;
                            tradingRevision: number;
                            updatedAt: string;
                            walletSnapshot: {
                                source: 'BINANCE_WALLET';
                                receivedAt: string;
                                funding: import("./validation").FundingSnapshot | null;
                                spotUsdc: import("./validation").WalletAssetBalance | null;
                                permissions: {
                                    reading: boolean | null;
                                    spotAndMarginTrading: boolean | null;
                                    withdrawals: boolean | null;
                                    ipRestricted: boolean | null;
                                };
                            } | null;
                            walletSyncError: string | null;
                        }[];
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
                $post: {
                    input: {
                        json: {
                            label: string;
                            apiKey: string;
                            apiSecret: string;
                        };
                    };
                    output: {
                        data: {
                            cashBalance: null;
                            availableCash: string | null;
                            hasCredentials: boolean;
                            source: "BINANCE_WALLET" | "UNAVAILABLE";
                            assetsAvailable: boolean;
                            assetMessage: string;
                            buyReady: boolean;
                            sellReady: boolean;
                            tradingReady: boolean;
                            quoteCurrency: 'USD';
                            settlementCurrency: 'USDC';
                            localSnapshot: {
                                cashBalance: null;
                                reservedCash: string;
                                availableCash: null;
                            };
                            externalSnapshot: {
                                source: "BINANCE_WALLET" | "UNAVAILABLE";
                                receivedAt: string | null;
                                cashBalance: null;
                                availableCash: string | null;
                                positions: null;
                            };
                            adminBlockReason: string | null;
                            adminTradingBlocked: boolean;
                            apiKeyLast4: string | null;
                            connectionMessage: string | null;
                            connectionStatus: string;
                            createdAt: string;
                            exchange: string;
                            id: string;
                            label: string;
                            lastSyncAt: string | null;
                            ownerUserId: string;
                            reservedCash: string;
                            status: string;
                            tradingEnabled: boolean;
                            tradingRevision: number;
                            updatedAt: string;
                            walletSnapshot: {
                                source: 'BINANCE_WALLET';
                                receivedAt: string;
                                funding: import("./validation").FundingSnapshot | null;
                                spotUsdc: import("./validation").WalletAssetBalance | null;
                                permissions: {
                                    reading: boolean | null;
                                    spotAndMarginTrading: boolean | null;
                                    withdrawals: boolean | null;
                                    ipRestricted: boolean | null;
                                };
                            } | null;
                            walletSyncError: string | null;
                        };
                    };
                    outputFormat: "json";
                    status: 201;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            accounts: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/accounts/:id", {
                    $get: {
                        input: {
                            param: {
                                id: string;
                            };
                        };
                        output: {
                            data: {
                                cashBalance: null;
                                availableCash: string | null;
                                hasCredentials: boolean;
                                source: "BINANCE_WALLET" | "UNAVAILABLE";
                                assetsAvailable: boolean;
                                assetMessage: string;
                                buyReady: boolean;
                                sellReady: boolean;
                                tradingReady: boolean;
                                quoteCurrency: 'USD';
                                settlementCurrency: 'USDC';
                                localSnapshot: {
                                    cashBalance: null;
                                    reservedCash: string;
                                    availableCash: null;
                                };
                                externalSnapshot: {
                                    source: "BINANCE_WALLET" | "UNAVAILABLE";
                                    receivedAt: string | null;
                                    cashBalance: null;
                                    availableCash: string | null;
                                    positions: null;
                                };
                                adminBlockReason: string | null;
                                adminTradingBlocked: boolean;
                                apiKeyLast4: string | null;
                                connectionMessage: string | null;
                                connectionStatus: string;
                                createdAt: string;
                                exchange: string;
                                id: string;
                                label: string;
                                lastSyncAt: string | null;
                                ownerUserId: string;
                                reservedCash: string;
                                status: string;
                                tradingEnabled: boolean;
                                tradingRevision: number;
                                updatedAt: string;
                                walletSnapshot: {
                                    source: 'BINANCE_WALLET';
                                    receivedAt: string;
                                    funding: import("./validation").FundingSnapshot | null;
                                    spotUsdc: import("./validation").WalletAssetBalance | null;
                                    permissions: {
                                        reading: boolean | null;
                                        spotAndMarginTrading: boolean | null;
                                        withdrawals: boolean | null;
                                        ipRestricted: boolean | null;
                                    };
                                } | null;
                                walletSyncError: string | null;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                    $patch: {
                        input: {
                            param: {
                                id: string;
                            };
                        } & {
                            json: {
                                label?: string | undefined;
                                apiKey?: string | undefined;
                                apiSecret?: string | undefined;
                                status?: "ACTIVE" | "DISABLED" | undefined;
                                tradingEnabled?: boolean | undefined;
                            };
                        };
                        output: {
                            data: {
                                cashBalance: null;
                                availableCash: string | null;
                                hasCredentials: boolean;
                                source: "BINANCE_WALLET" | "UNAVAILABLE";
                                assetsAvailable: boolean;
                                assetMessage: string;
                                buyReady: boolean;
                                sellReady: boolean;
                                tradingReady: boolean;
                                quoteCurrency: 'USD';
                                settlementCurrency: 'USDC';
                                localSnapshot: {
                                    cashBalance: null;
                                    reservedCash: string;
                                    availableCash: null;
                                };
                                externalSnapshot: {
                                    source: "BINANCE_WALLET" | "UNAVAILABLE";
                                    receivedAt: string | null;
                                    cashBalance: null;
                                    availableCash: string | null;
                                    positions: null;
                                };
                                adminBlockReason: string | null;
                                adminTradingBlocked: boolean;
                                apiKeyLast4: string | null;
                                connectionMessage: string | null;
                                connectionStatus: string;
                                createdAt: string;
                                exchange: string;
                                id: string;
                                label: string;
                                lastSyncAt: string | null;
                                ownerUserId: string;
                                reservedCash: string;
                                status: string;
                                tradingEnabled: boolean;
                                tradingRevision: number;
                                updatedAt: string;
                                walletSnapshot: {
                                    source: 'BINANCE_WALLET';
                                    receivedAt: string;
                                    funding: import("./validation").FundingSnapshot | null;
                                    spotUsdc: import("./validation").WalletAssetBalance | null;
                                    permissions: {
                                        reading: boolean | null;
                                        spotAndMarginTrading: boolean | null;
                                        withdrawals: boolean | null;
                                        ipRestricted: boolean | null;
                                    };
                                } | null;
                                walletSyncError: string | null;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            accounts: {
                ":id": {
                    assets: {
                        sync: import("hono/client").ClientRequest<string, "/api/v1/accounts/:id/assets/sync", {
                            $post: {
                                input: {
                                    param: {
                                        id: string;
                                    };
                                };
                                output: {
                                    error: {
                                        code: string;
                                        message: string;
                                        requestId: string;
                                        operationAccepted?: false | undefined;
                                        details?: null | undefined;
                                    };
                                    operation: {
                                        id: string;
                                        actorUserId: string;
                                        kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                        targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                        targetId: string;
                                        status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                        phase: string;
                                        outcome: string | null;
                                        createdAt: string;
                                        updatedAt: string;
                                        finishedAt: string | null;
                                        result: {
                                            [x: string]: import("hono/utils/types").JSONValue;
                                        } | null;
                                        error: {
                                            code: string;
                                            message: string;
                                        } | null;
                                    };
                                };
                                outputFormat: "json";
                                status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                            } | {
                                input: {
                                    param: {
                                        id: string;
                                    };
                                };
                                output: {
                                    data: {
                                        cashBalance: null;
                                        availableCash: string | null;
                                        hasCredentials: boolean;
                                        source: "BINANCE_WALLET" | "UNAVAILABLE";
                                        assetsAvailable: boolean;
                                        assetMessage: string;
                                        buyReady: boolean;
                                        sellReady: boolean;
                                        tradingReady: boolean;
                                        quoteCurrency: 'USD';
                                        settlementCurrency: 'USDC';
                                        localSnapshot: {
                                            cashBalance: null;
                                            reservedCash: string;
                                            availableCash: null;
                                        };
                                        externalSnapshot: {
                                            source: "BINANCE_WALLET" | "UNAVAILABLE";
                                            receivedAt: string | null;
                                            cashBalance: null;
                                            availableCash: string | null;
                                            positions: null;
                                        };
                                        adminBlockReason: string | null;
                                        adminTradingBlocked: boolean;
                                        apiKeyLast4: string | null;
                                        connectionMessage: string | null;
                                        connectionStatus: string;
                                        createdAt: string;
                                        exchange: string;
                                        id: string;
                                        label: string;
                                        lastSyncAt: string | null;
                                        ownerUserId: string;
                                        reservedCash: string;
                                        status: string;
                                        tradingEnabled: boolean;
                                        tradingRevision: number;
                                        updatedAt: string;
                                        walletSnapshot: {
                                            source: 'BINANCE_WALLET';
                                            receivedAt: string;
                                            funding: import("./validation").FundingSnapshot | null;
                                            spotUsdc: import("./validation").WalletAssetBalance | null;
                                            permissions: {
                                                reading: boolean | null;
                                                spotAndMarginTrading: boolean | null;
                                                withdrawals: boolean | null;
                                                ipRestricted: boolean | null;
                                            };
                                        } | null;
                                        walletSyncError: string | null;
                                    } | null;
                                    operation: {
                                        id: string;
                                        actorUserId: string;
                                        kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                        targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                        targetId: string;
                                        status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                        phase: string;
                                        outcome: string | null;
                                        createdAt: string;
                                        updatedAt: string;
                                        finishedAt: string | null;
                                        result: {
                                            [x: string]: import("hono/utils/types").JSONValue;
                                        } | null;
                                        error: {
                                            code: string;
                                            message: string;
                                        } | null;
                                    };
                                };
                                outputFormat: "json";
                                status: 200 | 202;
                            };
                        }>;
                    };
                };
            };
        };
    };
} & {
    api: {
        v1: {
            accounts: {
                ":id": {
                    check: import("hono/client").ClientRequest<string, "/api/v1/accounts/:id/check", {
                        $post: {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                error: {
                                    code: string;
                                    message: string;
                                    requestId: string;
                                    operationAccepted?: false | undefined;
                                    details?: null | undefined;
                                };
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                        } | {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                data: {
                                    cashBalance: null;
                                    availableCash: string | null;
                                    hasCredentials: boolean;
                                    source: "BINANCE_WALLET" | "UNAVAILABLE";
                                    assetsAvailable: boolean;
                                    assetMessage: string;
                                    buyReady: boolean;
                                    sellReady: boolean;
                                    tradingReady: boolean;
                                    quoteCurrency: 'USD';
                                    settlementCurrency: 'USDC';
                                    localSnapshot: {
                                        cashBalance: null;
                                        reservedCash: string;
                                        availableCash: null;
                                    };
                                    externalSnapshot: {
                                        source: "BINANCE_WALLET" | "UNAVAILABLE";
                                        receivedAt: string | null;
                                        cashBalance: null;
                                        availableCash: string | null;
                                        positions: null;
                                    };
                                    adminBlockReason: string | null;
                                    adminTradingBlocked: boolean;
                                    apiKeyLast4: string | null;
                                    connectionMessage: string | null;
                                    connectionStatus: string;
                                    createdAt: string;
                                    exchange: string;
                                    id: string;
                                    label: string;
                                    lastSyncAt: string | null;
                                    ownerUserId: string;
                                    reservedCash: string;
                                    status: string;
                                    tradingEnabled: boolean;
                                    tradingRevision: number;
                                    updatedAt: string;
                                    walletSnapshot: {
                                        source: 'BINANCE_WALLET';
                                        receivedAt: string;
                                        funding: import("./validation").FundingSnapshot | null;
                                        spotUsdc: import("./validation").WalletAssetBalance | null;
                                        permissions: {
                                            reading: boolean | null;
                                            spotAndMarginTrading: boolean | null;
                                            withdrawals: boolean | null;
                                            ipRestricted: boolean | null;
                                        };
                                    } | null;
                                    walletSyncError: string | null;
                                } | null;
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: 200 | 202;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            accounts: {
                ":id": {
                    exchange: {
                        orders: import("hono/client").ClientRequest<string, "/api/v1/accounts/:id/exchange/orders", {
                            $get: {
                                input: {
                                    param: {
                                        id: string;
                                    };
                                } & {
                                    query: {
                                        from?: string | undefined;
                                        to?: string | undefined;
                                        page?: string | string[] | undefined;
                                        pageSize?: string | string[] | undefined;
                                        symbol?: string | undefined;
                                    };
                                };
                                output: {
                                    data: {
                                        items: {
                                            exchangeOrderId: string;
                                            symbol: string;
                                            side: 'BUY' | 'SELL';
                                            orderType: string;
                                            price: string | null;
                                            priceCurrency: 'USD';
                                            quantity: string | null;
                                            filledQuantity: string;
                                            averagePrice: string | null;
                                            notional: string | null;
                                            filledTotal: string | null;
                                            notionalCurrency: null;
                                            fee: string | null;
                                            feeCurrency: 'USD' | null;
                                            quoteCurrency: string | null;
                                            tradingSession: string | null;
                                            status: string;
                                            createdAt: string | null;
                                            updatedAt: string | null;
                                        }[];
                                        total: number;
                                        page: number;
                                        pageSize: number;
                                    };
                                };
                                outputFormat: "json";
                                status: import("hono/utils/http-status").ContentfulStatusCode;
                            };
                        }>;
                    };
                };
            };
        };
    };
} & {
    api: {
        v1: {
            accounts: {
                ":id": {
                    exchange: {
                        trades: import("hono/client").ClientRequest<string, "/api/v1/accounts/:id/exchange/trades", {
                            $get: {
                                input: {
                                    param: {
                                        id: string;
                                    };
                                } & {
                                    query: {
                                        from?: string | undefined;
                                        to?: string | undefined;
                                        page?: string | string[] | undefined;
                                        pageSize?: string | string[] | undefined;
                                        symbol?: string | undefined;
                                    };
                                };
                                output: {
                                    data: {
                                        items: {
                                            exchangeTradeId: string;
                                            exchangeOrderId: string;
                                            symbol: string;
                                            side: 'BUY' | 'SELL';
                                            price: string;
                                            priceCurrency: 'USD';
                                            quantity: string;
                                            notional: string | null;
                                            notionalCurrency: 'USD';
                                            fee: null;
                                            quoteCurrency: string | null;
                                            filledAt: string;
                                            updatedAt: string | null;
                                        }[];
                                        total: number;
                                        page: number;
                                        pageSize: number;
                                    };
                                };
                                outputFormat: "json";
                                status: import("hono/utils/http-status").ContentfulStatusCode;
                            };
                        }>;
                    };
                };
            };
        };
    };
} & {
    api: {
        v1: {
            accounts: {
                ":id": {
                    reconcile: import("hono/client").ClientRequest<string, "/api/v1/accounts/:id/reconcile", {
                        $post: {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                error: {
                                    code: string;
                                    message: string;
                                    requestId: string;
                                    operationAccepted?: false | undefined;
                                    details?: null | undefined;
                                };
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                        } | {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                data: {
                                    createdAt: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                    exchangeAccountId: string;
                                    id: string;
                                    ownerUserId: string;
                                    status: string;
                                } | null;
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: 200 | 202;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                accounts: import("hono/client").ClientRequest<string, "/api/v1/admin/accounts", {
                    $get: {
                        input: {
                            query: {
                                symbol?: string | undefined;
                                status?: string | undefined;
                                ownerUserId?: string | undefined;
                                accountId?: string | undefined;
                                from?: string | undefined;
                                to?: string | undefined;
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    cashBalance: null;
                                    availableCash: string | null;
                                    hasCredentials: boolean;
                                    source: "BINANCE_WALLET" | "UNAVAILABLE";
                                    assetsAvailable: boolean;
                                    assetMessage: string;
                                    buyReady: boolean;
                                    sellReady: boolean;
                                    tradingReady: boolean;
                                    quoteCurrency: 'USD';
                                    settlementCurrency: 'USDC';
                                    localSnapshot: {
                                        cashBalance: null;
                                        reservedCash: string;
                                        availableCash: null;
                                    };
                                    externalSnapshot: {
                                        source: "BINANCE_WALLET" | "UNAVAILABLE";
                                        receivedAt: string | null;
                                        cashBalance: null;
                                        availableCash: string | null;
                                        positions: null;
                                    };
                                    adminBlockReason: string | null;
                                    adminTradingBlocked: boolean;
                                    apiKeyLast4: string | null;
                                    connectionMessage: string | null;
                                    connectionStatus: string;
                                    createdAt: string;
                                    exchange: string;
                                    id: string;
                                    label: string;
                                    lastSyncAt: string | null;
                                    ownerUserId: string;
                                    reservedCash: string;
                                    status: string;
                                    tradingEnabled: boolean;
                                    tradingRevision: number;
                                    updatedAt: string;
                                    walletSnapshot: {
                                        source: 'BINANCE_WALLET';
                                        receivedAt: string;
                                        funding: import("./validation").FundingSnapshot | null;
                                        spotUsdc: import("./validation").WalletAssetBalance | null;
                                        permissions: {
                                            reading: boolean | null;
                                            spotAndMarginTrading: boolean | null;
                                            withdrawals: boolean | null;
                                            ipRestricted: boolean | null;
                                        };
                                    } | null;
                                    walletSyncError: string | null;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                accounts: {
                    ":id": import("hono/client").ClientRequest<string, "/api/v1/admin/accounts/:id", {
                        $patch: {
                            input: {
                                param: {
                                    id: string;
                                };
                            } & {
                                json: {
                                    adminTradingBlocked: boolean;
                                    adminBlockReason?: string | null | undefined;
                                };
                            };
                            output: {
                                error: {
                                    code: string;
                                    message: string;
                                    requestId: string;
                                    operationAccepted?: false | undefined;
                                    details?: null | undefined;
                                };
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                        } | {
                            input: {
                                param: {
                                    id: string;
                                };
                            } & {
                                json: {
                                    adminTradingBlocked: boolean;
                                    adminBlockReason?: string | null | undefined;
                                };
                            };
                            output: {
                                data: {
                                    cashBalance: null;
                                    availableCash: string | null;
                                    hasCredentials: boolean;
                                    source: "BINANCE_WALLET" | "UNAVAILABLE";
                                    assetsAvailable: boolean;
                                    assetMessage: string;
                                    buyReady: boolean;
                                    sellReady: boolean;
                                    tradingReady: boolean;
                                    quoteCurrency: 'USD';
                                    settlementCurrency: 'USDC';
                                    localSnapshot: {
                                        cashBalance: null;
                                        reservedCash: string;
                                        availableCash: null;
                                    };
                                    externalSnapshot: {
                                        source: "BINANCE_WALLET" | "UNAVAILABLE";
                                        receivedAt: string | null;
                                        cashBalance: null;
                                        availableCash: string | null;
                                        positions: null;
                                    };
                                    adminBlockReason: string | null;
                                    adminTradingBlocked: boolean;
                                    apiKeyLast4: string | null;
                                    connectionMessage: string | null;
                                    connectionStatus: string;
                                    createdAt: string;
                                    exchange: string;
                                    id: string;
                                    label: string;
                                    lastSyncAt: string | null;
                                    ownerUserId: string;
                                    reservedCash: string;
                                    status: string;
                                    tradingEnabled: boolean;
                                    tradingRevision: number;
                                    updatedAt: string;
                                    walletSnapshot: {
                                        source: 'BINANCE_WALLET';
                                        receivedAt: string;
                                        funding: import("./validation").FundingSnapshot | null;
                                        spotUsdc: import("./validation").WalletAssetBalance | null;
                                        permissions: {
                                            reading: boolean | null;
                                            spotAndMarginTrading: boolean | null;
                                            withdrawals: boolean | null;
                                            ipRestricted: boolean | null;
                                        };
                                    } | null;
                                    walletSyncError: string | null;
                                } | null;
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: 200 | 202;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                audit: import("hono/client").ClientRequest<string, "/api/v1/admin/audit", {
                    $get: {
                        input: {
                            query: {
                                symbol?: string | undefined;
                                status?: string | undefined;
                                ownerUserId?: string | undefined;
                                accountId?: string | undefined;
                                from?: string | undefined;
                                to?: string | undefined;
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    id: string;
                                    actorUserId: string | null;
                                    actorRole: string | null;
                                    action: string;
                                    targetType: string;
                                    targetId: string | null;
                                    result: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                    createdAt: string;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                endpoints: {
                    benchmark: import("hono/client").ClientRequest<string, "/api/v1/admin/endpoints/benchmark", {
                        $post: {
                            input: {
                                query: {
                                    accountId?: string | undefined;
                                };
                            };
                            output: {
                                data: {
                                    results: {
                                        endpoint: string;
                                        ok: boolean;
                                        latencyMs: number;
                                        error: string | null;
                                    }[];
                                    selected: string | null;
                                    measuredAt: string;
                                };
                            };
                            outputFormat: "json";
                            status: import("hono/utils/http-status").ContentfulStatusCode;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                ledger: import("hono/client").ClientRequest<string, "/api/v1/admin/ledger", {
                    $get: {
                        input: {
                            query: {
                                symbol?: string | undefined;
                                status?: string | undefined;
                                ownerUserId?: string | undefined;
                                accountId?: string | undefined;
                                from?: string | undefined;
                                to?: string | undefined;
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    ownerUserId: string;
                                    exchangeAccountId: string;
                                    tradeId: string | null;
                                    orderId: string | null;
                                    type: string;
                                    amount: string;
                                    currency: string | null;
                                    balanceAfter: string | null;
                                    description: string;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                                source: 'LOCAL_LEDGER';
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                orders: import("hono/client").ClientRequest<string, "/api/v1/admin/orders", {
                    $get: {
                        input: {
                            query: {
                                symbol?: string | undefined;
                                status?: string | undefined;
                                ownerUserId?: string | undefined;
                                accountId?: string | undefined;
                                from?: string | undefined;
                                to?: string | undefined;
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    feeCurrency: "USD" | null;
                                    priceCurrency: 'USD';
                                    averagePrice: string;
                                    cancelStartedAt: string | null;
                                    clientOrderId: string;
                                    createdAt: string;
                                    exchangeAccountId: string;
                                    exchangeOrderId: string | null;
                                    fee: string | null;
                                    feeFinalized: boolean;
                                    feePending: boolean;
                                    filledNotional: string;
                                    filledQuantity: string;
                                    id: string;
                                    idempotencyKey: string | null;
                                    notional: string | null;
                                    orderType: "LIMIT" | "MARKET";
                                    ownerUserId: string;
                                    price: string | null;
                                    quantity: string | null;
                                    quoteCurrency: string | null;
                                    reason: string | null;
                                    reconciledAt: string | null;
                                    requestHash: string;
                                    reservationReleased: boolean;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    sellInventoryBaseline: string | null;
                                    sellInventoryVerifiedAt: string | null;
                                    side: "BUY" | "SELL";
                                    status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                    submitStartedAt: string | null;
                                    submittedAt: string | null;
                                    symbol: string;
                                    taskId: string | null;
                                    timeInForce: "DAY" | "GTC";
                                    tradeEvidencePending: boolean;
                                    tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                    updatedAt: string;
                                    waitDeadlineAt: string | null;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                                source: 'LOCAL_LEDGER';
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                overview: import("hono/client").ClientRequest<string, "/api/v1/admin/overview", {
                    $get: {
                        input: {};
                        output: {
                            data: {
                                counts: {
                                    traders: number;
                                    admins: number;
                                    activeUsers: number;
                                    disabledUsers: number;
                                    accounts: number;
                                    runningTasks: number;
                                    openOrders: number;
                                    recoveryRequired: number;
                                    unknownOrders: number;
                                    totalTasks: number;
                                    completedTasks: number;
                                    failedTasks: number;
                                    expiredTasks: number;
                                    stoppedTasks: number;
                                    unfinishedTasks: number;
                                };
                                worker: {
                                    online: boolean;
                                    lastSeenAt: string;
                                    status: string;
                                };
                                settings: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    environment: "production";
                                    emergencyStop: boolean;
                                    maxOrderQuantity: number;
                                    maxTaskQuantity: number;
                                    maxOrderNotional: string;
                                    feeReserveRate: string;
                                    feeReserveMinimum: string;
                                    updatedBy: string | null;
                                };
                                recentEvents: {
                                    id: number;
                                    ownerUserId: string | null;
                                    level: string;
                                    type: string;
                                    message: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                    createdAt: string;
                                }[];
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                system: import("hono/client").ClientRequest<string, "/api/v1/admin/system", {
                    $get: {
                        input: {};
                        output: {
                            data: {
                                settings: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    environment: "production";
                                    emergencyStop: boolean;
                                    maxOrderQuantity: number;
                                    maxTaskQuantity: number;
                                    maxOrderNotional: string;
                                    feeReserveRate: string;
                                    feeReserveMinimum: string;
                                    updatedBy: string | null;
                                };
                                heartbeats: {
                                    id: string;
                                    instanceId: string;
                                    lastSeenAt: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                }[];
                                events: {
                                    id: number;
                                    ownerUserId: string | null;
                                    level: string;
                                    type: string;
                                    message: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                    createdAt: string;
                                }[];
                                environment: {
                                    environment: 'production';
                                    label: string;
                                    tradingReady: boolean;
                                    availability: 'AVAILABLE' | 'PARTIAL';
                                    buySupported: boolean;
                                    sellSupported: boolean;
                                    capabilities: {
                                        quotes: boolean;
                                        orders: boolean;
                                        trades: boolean;
                                        assets: boolean;
                                        buy: boolean;
                                        sell: boolean;
                                    };
                                    blockers: string[];
                                    apiVersion: string;
                                };
                                endpoints: {
                                    results: {
                                        endpoint: string;
                                        ok: boolean;
                                        latencyMs: number;
                                        error: string | null;
                                    }[];
                                    selected: string | null;
                                    measuredAt: string;
                                } | null;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                    $patch: {
                        input: {
                            json: {
                                emergencyStop?: boolean | undefined;
                                maxOrderQuantity?: number | undefined;
                                maxTaskQuantity?: number | undefined;
                                maxOrderNotional?: string | undefined;
                                feeReserveRate?: string | undefined;
                                feeReserveMinimum?: string | undefined;
                            };
                        };
                        output: {
                            error: {
                                code: string;
                                message: string;
                                requestId: string;
                                operationAccepted?: false | undefined;
                                details?: null | undefined;
                            };
                            operation: {
                                id: string;
                                actorUserId: string;
                                kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                targetId: string;
                                status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                phase: string;
                                outcome: string | null;
                                createdAt: string;
                                updatedAt: string;
                                finishedAt: string | null;
                                result: {
                                    [x: string]: import("hono/utils/types").JSONValue;
                                } | null;
                                error: {
                                    code: string;
                                    message: string;
                                } | null;
                            };
                        };
                        outputFormat: "json";
                        status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                    } | {
                        input: {
                            json: {
                                emergencyStop?: boolean | undefined;
                                maxOrderQuantity?: number | undefined;
                                maxTaskQuantity?: number | undefined;
                                maxOrderNotional?: string | undefined;
                                feeReserveRate?: string | undefined;
                                feeReserveMinimum?: string | undefined;
                            };
                        };
                        output: {
                            data: {
                                createdAt: string;
                                updatedAt: string;
                                id: string;
                                environment: "production";
                                emergencyStop: boolean;
                                maxOrderQuantity: number;
                                maxTaskQuantity: number;
                                maxOrderNotional: string;
                                feeReserveRate: string;
                                feeReserveMinimum: string;
                                updatedBy: string | null;
                            } | null;
                            operation: {
                                id: string;
                                actorUserId: string;
                                kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                targetId: string;
                                status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                phase: string;
                                outcome: string | null;
                                createdAt: string;
                                updatedAt: string;
                                finishedAt: string | null;
                                result: {
                                    [x: string]: import("hono/utils/types").JSONValue;
                                } | null;
                                error: {
                                    code: string;
                                    message: string;
                                } | null;
                            };
                        };
                        outputFormat: "json";
                        status: 200 | 202;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                tasks: import("hono/client").ClientRequest<string, "/api/v1/admin/tasks", {
                    $get: {
                        input: {
                            query: {
                                symbol?: string | undefined;
                                status?: string | undefined;
                                ownerUserId?: string | undefined;
                                accountId?: string | undefined;
                                from?: string | undefined;
                                to?: string | undefined;
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    ownerUserId: string;
                                    exchangeAccountId: string;
                                    name: string;
                                    symbol: string;
                                    side: "BUY" | "SELL";
                                    orderType: "LIMIT" | "MARKET";
                                    targetQuantity: string | null;
                                    targetNotional: string | null;
                                    config: {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        targetQuantity: string;
                                        quantityMode: "FIXED" | "RANDOM";
                                        fixedQuantity: string;
                                        randomQuantityMin: number;
                                        randomQuantityMax: number;
                                        orderType: "LIMIT";
                                        side: "BUY" | "SELL";
                                        priceRule: "ASK_1" | "BID_1" | "FIXED";
                                        fixedPrice: string | null;
                                        priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                        tradingSession: "24H" | "EXTENDED" | "RTH";
                                        timeInForce: "DAY" | "GTC";
                                    } | {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        targetQuantity: string;
                                        quantityMode: "FIXED" | "RANDOM";
                                        fixedQuantity: string;
                                        randomQuantityMin: number;
                                        randomQuantityMax: number;
                                        orderType: "MARKET";
                                        timeInForce: "DAY";
                                        side: "SELL";
                                    } | {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        orderType: "MARKET";
                                        timeInForce: "DAY";
                                        side: "BUY";
                                        targetNotional: string;
                                        notionalMode: "FIXED" | "RANDOM";
                                        fixedNotional: string;
                                        randomNotionalMin: string;
                                        randomNotionalMax: string;
                                    };
                                    status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                                    filledQuantity: string;
                                    filledNotional: string;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    scheduledStartAt: string | null;
                                    startedAt: string | null;
                                    deadlineAt: string | null;
                                    endedAt: string | null;
                                    lastFilledAt: string | null;
                                    nextRunAt: string | null;
                                    stopReason: string | null;
                                    reason: string | null;
                                    leaseOwner: string | null;
                                    leaseUntil: string | null;
                                    lastInterruption: {
                                        eventId: string;
                                        status: 'PAUSED' | 'RECOVERY_REQUIRED' | 'RECONCILING';
                                        reason: string;
                                        stopReason: string | null;
                                        occurredAt: string;
                                    } | null;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                                source: 'LOCAL_LEDGER';
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                users: import("hono/client").ClientRequest<string, "/api/v1/admin/users", {
                    $get: {
                        input: {
                            query: {
                                symbol?: string | undefined;
                                status?: string | undefined;
                                ownerUserId?: string | undefined;
                                accountId?: string | undefined;
                                from?: string | undefined;
                                to?: string | undefined;
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    id: string;
                                    username: string;
                                    role: "ADMIN" | "TRADER";
                                    status: string;
                                    canManageAdmins: boolean;
                                    createdAt: string;
                                    updatedAt: string;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                    $post: {
                        input: {
                            json: {
                                username: string;
                                password: string;
                                role: "ADMIN" | "TRADER";
                                canManageAdmins?: boolean | undefined;
                            };
                        };
                        output: {
                            data: {
                                id: string;
                                username: string;
                                role: "ADMIN" | "TRADER";
                                status: string;
                                canManageAdmins: boolean;
                                createdAt: string;
                                updatedAt: string;
                            };
                        };
                        outputFormat: "json";
                        status: 201;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            admin: {
                users: {
                    ":id": import("hono/client").ClientRequest<string, "/api/v1/admin/users/:id", {
                        $patch: {
                            input: {
                                param: {
                                    id: string;
                                };
                            } & {
                                json: {
                                    status?: "ACTIVE" | "DISABLED" | undefined;
                                    canManageAdmins?: boolean | undefined;
                                };
                            };
                            output: {
                                error: {
                                    code: string;
                                    message: string;
                                    requestId: string;
                                    operationAccepted?: false | undefined;
                                    details?: null | undefined;
                                };
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                        } | {
                            input: {
                                param: {
                                    id: string;
                                };
                            } & {
                                json: {
                                    status?: "ACTIVE" | "DISABLED" | undefined;
                                    canManageAdmins?: boolean | undefined;
                                };
                            };
                            output: {
                                data: {
                                    id: string;
                                    username: string;
                                    role: "ADMIN" | "TRADER";
                                    status: string;
                                    canManageAdmins: boolean;
                                    createdAt: string;
                                    updatedAt: string;
                                } | null;
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: 200 | 202;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            ledger: import("hono/client").ClientRequest<string, "/api/v1/ledger", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            items: {
                                createdAt: string;
                                updatedAt: string;
                                id: string;
                                ownerUserId: string;
                                exchangeAccountId: string;
                                tradeId: string | null;
                                orderId: string | null;
                                type: string;
                                amount: string;
                                currency: string | null;
                                balanceAfter: string | null;
                                description: string;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                            source: 'LOCAL_LEDGER';
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            logs: import("hono/client").ClientRequest<string, "/api/v1/logs", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            items: {
                                id: string;
                                ownerUserId: string | null;
                                resourceType: string;
                                resourceId: string | null;
                                type: string;
                                message: string;
                                details: {
                                    [x: string]: import("hono/utils/types").JSONValue;
                                };
                                createdAt: string;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            market: {
                quotes: import("hono/client").ClientRequest<string, "/api/v1/market/quotes", {
                    $get: {
                        input: {
                            query: {
                                accountId?: string | undefined;
                                symbol: string;
                            };
                        };
                        output: {
                            data: {
                                symbol: import("./validation").Symbol;
                                bid: string;
                                ask: string;
                                bidSize: string | null;
                                askSize: string | null;
                                timestamp: string;
                                source: 'BINANCE_STOCKS';
                                timestampSource: 'LOCAL_RECEIPT';
                                tradingStatus: 'TRADING' | 'HALTED' | 'UNKNOWN';
                            }[];
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            orders: import("hono/client").ClientRequest<string, "/api/v1/orders", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            items: {
                                feeCurrency: "USD" | null;
                                priceCurrency: 'USD';
                                averagePrice: string;
                                cancelStartedAt: string | null;
                                clientOrderId: string;
                                createdAt: string;
                                exchangeAccountId: string;
                                exchangeOrderId: string | null;
                                fee: string | null;
                                feeFinalized: boolean;
                                feePending: boolean;
                                filledNotional: string;
                                filledQuantity: string;
                                id: string;
                                idempotencyKey: string | null;
                                notional: string | null;
                                orderType: "LIMIT" | "MARKET";
                                ownerUserId: string;
                                price: string | null;
                                quantity: string | null;
                                quoteCurrency: string | null;
                                reason: string | null;
                                reconciledAt: string | null;
                                requestHash: string;
                                reservationReleased: boolean;
                                reservedCash: string;
                                reservedQuantity: string;
                                sellInventoryBaseline: string | null;
                                sellInventoryVerifiedAt: string | null;
                                side: "BUY" | "SELL";
                                status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                submitStartedAt: string | null;
                                submittedAt: string | null;
                                symbol: string;
                                taskId: string | null;
                                timeInForce: "DAY" | "GTC";
                                tradeEvidencePending: boolean;
                                tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                updatedAt: string;
                                waitDeadlineAt: string | null;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                            source: 'LOCAL_LEDGER';
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
                $post: {
                    input: {
                        json: {
                            accountId: string;
                            symbol: string;
                            orderType?: "LIMIT" | undefined;
                            side: "BUY" | "SELL";
                            price: string;
                            quantity: string;
                            notional?: undefined;
                            tradingSession?: "24H" | "EXTENDED" | "RTH" | undefined;
                            timeInForce?: "DAY" | "GTC" | undefined;
                        } | {
                            accountId: string;
                            symbol: string;
                            orderType: "MARKET";
                            side: "BUY";
                            notional: string;
                            price?: undefined;
                            quantity?: undefined;
                            tradingSession?: undefined;
                            timeInForce?: "DAY" | undefined;
                        } | {
                            accountId: string;
                            symbol: string;
                            orderType: "MARKET";
                            side: "SELL";
                            quantity: string;
                            notional?: undefined;
                            price?: undefined;
                            tradingSession?: undefined;
                            timeInForce?: "DAY" | undefined;
                        };
                    };
                    output: {
                        data: {
                            feeCurrency: "USD" | null;
                            priceCurrency: 'USD';
                            averagePrice: string;
                            cancelStartedAt: string | null;
                            clientOrderId: string;
                            createdAt: string;
                            exchangeAccountId: string;
                            exchangeOrderId: string | null;
                            fee: string | null;
                            feeFinalized: boolean;
                            feePending: boolean;
                            filledNotional: string;
                            filledQuantity: string;
                            id: string;
                            idempotencyKey: string | null;
                            notional: string | null;
                            orderType: "LIMIT" | "MARKET";
                            ownerUserId: string;
                            price: string | null;
                            quantity: string | null;
                            quoteCurrency: string | null;
                            reason: string | null;
                            reconciledAt: string | null;
                            requestHash: string;
                            reservationReleased: boolean;
                            reservedCash: string;
                            reservedQuantity: string;
                            sellInventoryBaseline: string | null;
                            sellInventoryVerifiedAt: string | null;
                            side: "BUY" | "SELL";
                            status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                            submitStartedAt: string | null;
                            submittedAt: string | null;
                            symbol: string;
                            taskId: string | null;
                            timeInForce: "DAY" | "GTC";
                            tradeEvidencePending: boolean;
                            tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                            updatedAt: string;
                            waitDeadlineAt: string | null;
                        };
                    };
                    outputFormat: "json";
                    status: 201;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            orders: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/orders/:id", {
                    $get: {
                        input: {
                            param: {
                                id: string;
                            };
                        };
                        output: {
                            data: {
                                order: {
                                    feeCurrency: "USD" | null;
                                    priceCurrency: 'USD';
                                    averagePrice: string;
                                    cancelStartedAt: string | null;
                                    clientOrderId: string;
                                    createdAt: string;
                                    exchangeAccountId: string;
                                    exchangeOrderId: string | null;
                                    fee: string | null;
                                    feeFinalized: boolean;
                                    feePending: boolean;
                                    filledNotional: string;
                                    filledQuantity: string;
                                    id: string;
                                    idempotencyKey: string | null;
                                    notional: string | null;
                                    orderType: "LIMIT" | "MARKET";
                                    ownerUserId: string;
                                    price: string | null;
                                    quantity: string | null;
                                    quoteCurrency: string | null;
                                    reason: string | null;
                                    reconciledAt: string | null;
                                    requestHash: string;
                                    reservationReleased: boolean;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    sellInventoryBaseline: string | null;
                                    sellInventoryVerifiedAt: string | null;
                                    side: "BUY" | "SELL";
                                    status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                    submitStartedAt: string | null;
                                    submittedAt: string | null;
                                    symbol: string;
                                    taskId: string | null;
                                    timeInForce: "DAY" | "GTC";
                                    tradeEvidencePending: boolean;
                                    tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                    updatedAt: string;
                                    waitDeadlineAt: string | null;
                                };
                                trades: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    ownerUserId: string;
                                    exchangeAccountId: string;
                                    taskId: string | null;
                                    orderId: string;
                                    exchangeTradeId: string;
                                    symbol: string;
                                    side: "BUY" | "SELL";
                                    price: string;
                                    quantity: string;
                                    fee: string | null;
                                    filledAt: string;
                                }[];
                                events: {
                                    id: string;
                                    orderId: string;
                                    ownerUserId: string;
                                    type: string;
                                    message: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                    createdAt: string;
                                }[];
                                source: 'LOCAL_LEDGER';
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            orders: {
                ":id": {
                    cancel: import("hono/client").ClientRequest<string, "/api/v1/orders/:id/cancel", {
                        $post: {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                error: {
                                    code: string;
                                    message: string;
                                    requestId: string;
                                    operationAccepted?: false | undefined;
                                    details?: null | undefined;
                                };
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                        } | {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                data: {
                                    feeCurrency: "USD" | null;
                                    priceCurrency: 'USD';
                                    averagePrice: string;
                                    cancelStartedAt: string | null;
                                    clientOrderId: string;
                                    createdAt: string;
                                    exchangeAccountId: string;
                                    exchangeOrderId: string | null;
                                    fee: string | null;
                                    feeFinalized: boolean;
                                    feePending: boolean;
                                    filledNotional: string;
                                    filledQuantity: string;
                                    id: string;
                                    idempotencyKey: string | null;
                                    notional: string | null;
                                    orderType: "LIMIT" | "MARKET";
                                    ownerUserId: string;
                                    price: string | null;
                                    quantity: string | null;
                                    quoteCurrency: string | null;
                                    reason: string | null;
                                    reconciledAt: string | null;
                                    requestHash: string;
                                    reservationReleased: boolean;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    sellInventoryBaseline: string | null;
                                    sellInventoryVerifiedAt: string | null;
                                    side: "BUY" | "SELL";
                                    status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                    submitStartedAt: string | null;
                                    submittedAt: string | null;
                                    symbol: string;
                                    taskId: string | null;
                                    timeInForce: "DAY" | "GTC";
                                    tradeEvidencePending: boolean;
                                    tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                    updatedAt: string;
                                    waitDeadlineAt: string | null;
                                } | null;
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: 200 | 202;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            orders: {
                ":id": {
                    reconcile: import("hono/client").ClientRequest<string, "/api/v1/orders/:id/reconcile", {
                        $post: {
                            input: {
                                param: {
                                    id: string;
                                };
                            };
                            output: {
                                data: {
                                    feeCurrency: "USD" | null;
                                    priceCurrency: 'USD';
                                    averagePrice: string;
                                    cancelStartedAt: string | null;
                                    clientOrderId: string;
                                    createdAt: string;
                                    exchangeAccountId: string;
                                    exchangeOrderId: string | null;
                                    fee: string | null;
                                    feeFinalized: boolean;
                                    feePending: boolean;
                                    filledNotional: string;
                                    filledQuantity: string;
                                    id: string;
                                    idempotencyKey: string | null;
                                    notional: string | null;
                                    orderType: "LIMIT" | "MARKET";
                                    ownerUserId: string;
                                    price: string | null;
                                    quantity: string | null;
                                    quoteCurrency: string | null;
                                    reason: string | null;
                                    reconciledAt: string | null;
                                    requestHash: string;
                                    reservationReleased: boolean;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    sellInventoryBaseline: string | null;
                                    sellInventoryVerifiedAt: string | null;
                                    side: "BUY" | "SELL";
                                    status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                    submitStartedAt: string | null;
                                    submittedAt: string | null;
                                    symbol: string;
                                    taskId: string | null;
                                    timeInForce: "DAY" | "GTC";
                                    tradeEvidencePending: boolean;
                                    tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                    updatedAt: string;
                                    waitDeadlineAt: string | null;
                                };
                            };
                            outputFormat: "json";
                            status: import("hono/utils/http-status").ContentfulStatusCode;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            orders: {
                preflight: import("hono/client").ClientRequest<string, "/api/v1/orders/preflight", {
                    $post: {
                        input: {
                            json: {
                                accountId: string;
                                symbol: string;
                                orderType?: "LIMIT" | undefined;
                                side: "BUY" | "SELL";
                                price: string;
                                quantity: string;
                                notional?: undefined;
                                tradingSession?: "24H" | "EXTENDED" | "RTH" | undefined;
                                timeInForce?: "DAY" | "GTC" | undefined;
                            } | {
                                accountId: string;
                                symbol: string;
                                orderType: "MARKET";
                                side: "BUY";
                                notional: string;
                                price?: undefined;
                                quantity?: undefined;
                                tradingSession?: undefined;
                                timeInForce?: "DAY" | undefined;
                            } | {
                                accountId: string;
                                symbol: string;
                                orderType: "MARKET";
                                side: "SELL";
                                quantity: string;
                                notional?: undefined;
                                price?: undefined;
                                tradingSession?: undefined;
                                timeInForce?: "DAY" | undefined;
                            };
                        };
                        output: {
                            data: {
                                ok: boolean;
                                checks: {
                                    label: string;
                                    ok: boolean;
                                    message: string;
                                }[];
                                estimatedNotional: string;
                                estimatedFee: string;
                                estimatedTotal: string;
                                availableCash: string | null;
                                availableQuantity: string | null;
                                sellInventory: {
                                    source: 'BINANCE_FUNDING_WALLET';
                                    symbol: string;
                                    assetCode: string;
                                    requestedAt: string;
                                    receivedAt: string;
                                    availableQuantity: string;
                                    localPendingQuantity: string;
                                } | null;
                                quote: import("./validation").Quote | null;
                                side: 'BUY' | 'SELL';
                                quoteCurrency: 'USD';
                                settlementCurrency: 'USDC';
                                walletType: 'CARD';
                                feeEstimateSource: 'RESERVE_POLICY';
                                fundsReceivedAt: string | null;
                                localPendingCash: string;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            overview: import("hono/client").ClientRequest<string, "/api/v1/overview", {
                $get: {
                    input: {};
                    output: {
                        data: {
                            account: {
                                cashBalance: null;
                                availableCash: string | null;
                                hasCredentials: boolean;
                                source: "BINANCE_WALLET" | "UNAVAILABLE";
                                assetsAvailable: boolean;
                                assetMessage: string;
                                buyReady: boolean;
                                sellReady: boolean;
                                tradingReady: boolean;
                                quoteCurrency: 'USD';
                                settlementCurrency: 'USDC';
                                localSnapshot: {
                                    cashBalance: null;
                                    reservedCash: string;
                                    availableCash: null;
                                };
                                externalSnapshot: {
                                    source: "BINANCE_WALLET" | "UNAVAILABLE";
                                    receivedAt: string | null;
                                    cashBalance: null;
                                    availableCash: string | null;
                                    positions: null;
                                };
                                adminBlockReason: string | null;
                                adminTradingBlocked: boolean;
                                apiKeyLast4: string | null;
                                connectionMessage: string | null;
                                connectionStatus: string;
                                createdAt: string;
                                exchange: string;
                                id: string;
                                label: string;
                                lastSyncAt: string | null;
                                ownerUserId: string;
                                reservedCash: string;
                                status: string;
                                tradingEnabled: boolean;
                                tradingRevision: number;
                                updatedAt: string;
                                walletSnapshot: {
                                    source: 'BINANCE_WALLET';
                                    receivedAt: string;
                                    funding: import("./validation").FundingSnapshot | null;
                                    spotUsdc: import("./validation").WalletAssetBalance | null;
                                    permissions: {
                                        reading: boolean | null;
                                        spotAndMarginTrading: boolean | null;
                                        withdrawals: boolean | null;
                                        ipRestricted: boolean | null;
                                    };
                                } | null;
                                walletSyncError: string | null;
                            } | null;
                            recordSource: 'LOCAL_LEDGER';
                            assetsAvailable: boolean;
                            assetMessage: string;
                            counts: {
                                runningTasks: number;
                                openOrders: number;
                                positions: number;
                                recoveryRequired: number;
                            };
                            today: {
                                buyQuantity: string;
                                sellQuantity: string;
                                buyAmount: string;
                                sellAmount: string;
                                quoteCurrency: string;
                                source: 'LOCAL_TRADE_NOTIONAL';
                                cashFlowVerified: false;
                            };
                            recentOrders: {
                                feeCurrency: "USD" | null;
                                priceCurrency: 'USD';
                                averagePrice: string;
                                cancelStartedAt: string | null;
                                clientOrderId: string;
                                createdAt: string;
                                exchangeAccountId: string;
                                exchangeOrderId: string | null;
                                fee: string | null;
                                feeFinalized: boolean;
                                feePending: boolean;
                                filledNotional: string;
                                filledQuantity: string;
                                id: string;
                                idempotencyKey: string | null;
                                notional: string | null;
                                orderType: "LIMIT" | "MARKET";
                                ownerUserId: string;
                                price: string | null;
                                quantity: string | null;
                                quoteCurrency: string | null;
                                reason: string | null;
                                reconciledAt: string | null;
                                requestHash: string;
                                reservationReleased: boolean;
                                reservedCash: string;
                                reservedQuantity: string;
                                sellInventoryBaseline: string | null;
                                sellInventoryVerifiedAt: string | null;
                                side: "BUY" | "SELL";
                                status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                submitStartedAt: string | null;
                                submittedAt: string | null;
                                symbol: string;
                                taskId: string | null;
                                timeInForce: "DAY" | "GTC";
                                tradeEvidencePending: boolean;
                                tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                updatedAt: string;
                                waitDeadlineAt: string | null;
                            }[];
                            issues: {
                                createdAt: string;
                                updatedAt: string;
                                id: string;
                                ownerUserId: string;
                                exchangeAccountId: string;
                                name: string;
                                symbol: string;
                                side: "BUY" | "SELL";
                                orderType: "LIMIT" | "MARKET";
                                targetQuantity: string | null;
                                targetNotional: string | null;
                                config: {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    targetQuantity: string;
                                    quantityMode: "FIXED" | "RANDOM";
                                    fixedQuantity: string;
                                    randomQuantityMin: number;
                                    randomQuantityMax: number;
                                    orderType: "LIMIT";
                                    side: "BUY" | "SELL";
                                    priceRule: "ASK_1" | "BID_1" | "FIXED";
                                    fixedPrice: string | null;
                                    priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                    tradingSession: "24H" | "EXTENDED" | "RTH";
                                    timeInForce: "DAY" | "GTC";
                                } | {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    targetQuantity: string;
                                    quantityMode: "FIXED" | "RANDOM";
                                    fixedQuantity: string;
                                    randomQuantityMin: number;
                                    randomQuantityMax: number;
                                    orderType: "MARKET";
                                    timeInForce: "DAY";
                                    side: "SELL";
                                } | {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    orderType: "MARKET";
                                    timeInForce: "DAY";
                                    side: "BUY";
                                    targetNotional: string;
                                    notionalMode: "FIXED" | "RANDOM";
                                    fixedNotional: string;
                                    randomNotionalMin: string;
                                    randomNotionalMax: string;
                                };
                                status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                                filledQuantity: string;
                                filledNotional: string;
                                reservedCash: string;
                                reservedQuantity: string;
                                scheduledStartAt: string | null;
                                startedAt: string | null;
                                deadlineAt: string | null;
                                endedAt: string | null;
                                lastFilledAt: string | null;
                                nextRunAt: string | null;
                                stopReason: string | null;
                                reason: string | null;
                                leaseOwner: string | null;
                                leaseUntil: string | null;
                                lastInterruption: {
                                    eventId: string;
                                    status: 'PAUSED' | 'RECOVERY_REQUIRED' | 'RECONCILING';
                                    reason: string;
                                    stopReason: string | null;
                                    occurredAt: string;
                                } | null;
                            }[];
                            worker: {
                                online: boolean;
                                lastSeenAt: string;
                                status: string;
                            };
                            environment: {
                                environment: 'production';
                                label: string;
                                tradingReady: boolean;
                                availability: 'AVAILABLE' | 'PARTIAL';
                                buySupported: boolean;
                                sellSupported: boolean;
                                capabilities: {
                                    quotes: boolean;
                                    orders: boolean;
                                    trades: boolean;
                                    assets: boolean;
                                    buy: boolean;
                                    sell: boolean;
                                };
                                blockers: string[];
                                apiVersion: string;
                            };
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            positions: import("hono/client").ClientRequest<string, "/api/v1/positions", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            items: {
                                createdAt: string;
                                updatedAt: string;
                                id: string;
                                ownerUserId: string;
                                exchangeAccountId: string;
                                symbol: string;
                                quantity: string;
                                reservedQuantity: string;
                                averageCost: string;
                                notionalCost: string;
                                realizedPnl: string;
                                availableQuantity: null;
                                localAvailableQuantity: string;
                                exchangeQuantity: null;
                                exchangeReservedQuantity: null;
                                source: 'LOCAL_LEDGER';
                                assetsAvailable: false;
                                unrealizedPnl: null;
                                markPrice: null;
                                quoteTimestamp: null;
                                quoteCurrency: 'USD';
                                settlementCurrency: 'USDC';
                                valuationEstimated: false;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                            source: 'LOCAL_LEDGER';
                            assetsAvailable: false;
                            unavailableReason: string;
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            reconciliations: import("hono/client").ClientRequest<string, "/api/v1/reconciliations", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            id: string;
                            ownerUserId: string;
                            exchangeAccountId: string;
                            status: string;
                            details: {
                                [x: string]: import("hono/utils/types").JSONValue;
                            };
                            createdAt: string;
                        }[];
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            tasks: import("hono/client").ClientRequest<string, "/api/v1/tasks", {
                $get: {
                    input: {
                        query: {
                            symbol?: string | undefined;
                            status?: string | undefined;
                            ownerUserId?: string | undefined;
                            accountId?: string | undefined;
                            from?: string | undefined;
                            to?: string | undefined;
                            search?: string | undefined;
                            page?: string | string[] | undefined;
                            pageSize?: string | string[] | undefined;
                        };
                    };
                    output: {
                        data: {
                            items: {
                                createdAt: string;
                                updatedAt: string;
                                id: string;
                                ownerUserId: string;
                                exchangeAccountId: string;
                                name: string;
                                symbol: string;
                                side: "BUY" | "SELL";
                                orderType: "LIMIT" | "MARKET";
                                targetQuantity: string | null;
                                targetNotional: string | null;
                                config: {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    targetQuantity: string;
                                    quantityMode: "FIXED" | "RANDOM";
                                    fixedQuantity: string;
                                    randomQuantityMin: number;
                                    randomQuantityMax: number;
                                    orderType: "LIMIT";
                                    side: "BUY" | "SELL";
                                    priceRule: "ASK_1" | "BID_1" | "FIXED";
                                    fixedPrice: string | null;
                                    priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                    tradingSession: "24H" | "EXTENDED" | "RTH";
                                    timeInForce: "DAY" | "GTC";
                                } | {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    targetQuantity: string;
                                    quantityMode: "FIXED" | "RANDOM";
                                    fixedQuantity: string;
                                    randomQuantityMin: number;
                                    randomQuantityMax: number;
                                    orderType: "MARKET";
                                    timeInForce: "DAY";
                                    side: "SELL";
                                } | {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    orderType: "MARKET";
                                    timeInForce: "DAY";
                                    side: "BUY";
                                    targetNotional: string;
                                    notionalMode: "FIXED" | "RANDOM";
                                    fixedNotional: string;
                                    randomNotionalMin: string;
                                    randomNotionalMax: string;
                                };
                                status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                                filledQuantity: string;
                                filledNotional: string;
                                reservedCash: string;
                                reservedQuantity: string;
                                scheduledStartAt: string | null;
                                startedAt: string | null;
                                deadlineAt: string | null;
                                endedAt: string | null;
                                lastFilledAt: string | null;
                                nextRunAt: string | null;
                                stopReason: string | null;
                                reason: string | null;
                                leaseOwner: string | null;
                                leaseUntil: string | null;
                                lastInterruption: {
                                    eventId: string;
                                    status: 'PAUSED' | 'RECOVERY_REQUIRED' | 'RECONCILING';
                                    reason: string;
                                    stopReason: string | null;
                                    occurredAt: string;
                                } | null;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                            source: 'LOCAL_LEDGER';
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                };
                $post: {
                    input: {
                        json: {
                            accountId: string;
                            name: string;
                            symbol: string;
                            executionWindowSeconds: number;
                            scheduledStartAt?: string | null | undefined;
                            executionMode?: "INTERVAL" | "SERIAL" | undefined;
                            globalIntervalSeconds?: number | undefined;
                            intervalMode?: "FIXED" | "RANDOM" | undefined;
                            fixedIntervalSeconds?: number | undefined;
                            randomIntervalMin?: number | undefined;
                            randomIntervalMax?: number | undefined;
                            autoCancelMode?: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP" | undefined;
                            orderTimeoutSeconds?: number | undefined;
                            remainderPolicy?: "EXACT" | "FIXED" | undefined;
                            targetQuantity: string;
                            quantityMode?: "FIXED" | "RANDOM" | undefined;
                            fixedQuantity?: string | undefined;
                            randomQuantityMin?: number | undefined;
                            randomQuantityMax?: number | undefined;
                            targetNotional?: undefined;
                            notionalMode?: undefined;
                            fixedNotional?: undefined;
                            randomNotionalMin?: undefined;
                            randomNotionalMax?: undefined;
                            orderType?: "LIMIT" | undefined;
                            side: "BUY" | "SELL";
                            priceRule?: "ASK_1" | "BID_1" | "FIXED" | undefined;
                            fixedPrice?: string | null | undefined;
                            priceRounding?: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE" | undefined;
                            tradingSession?: "24H" | "EXTENDED" | "RTH" | undefined;
                            timeInForce?: "DAY" | "GTC" | undefined;
                        } | {
                            accountId: string;
                            name: string;
                            symbol: string;
                            executionWindowSeconds: number;
                            scheduledStartAt?: string | null | undefined;
                            executionMode?: "INTERVAL" | "SERIAL" | undefined;
                            globalIntervalSeconds?: number | undefined;
                            intervalMode?: "FIXED" | "RANDOM" | undefined;
                            fixedIntervalSeconds?: number | undefined;
                            randomIntervalMin?: number | undefined;
                            randomIntervalMax?: number | undefined;
                            autoCancelMode?: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP" | undefined;
                            orderTimeoutSeconds?: number | undefined;
                            remainderPolicy?: "EXACT" | "FIXED" | undefined;
                            targetQuantity: string;
                            quantityMode?: "FIXED" | "RANDOM" | undefined;
                            fixedQuantity?: string | undefined;
                            randomQuantityMin?: number | undefined;
                            randomQuantityMax?: number | undefined;
                            targetNotional?: undefined;
                            notionalMode?: undefined;
                            fixedNotional?: undefined;
                            randomNotionalMin?: undefined;
                            randomNotionalMax?: undefined;
                            orderType: "MARKET";
                            priceRule?: undefined;
                            fixedPrice?: undefined;
                            priceRounding?: undefined;
                            tradingSession?: undefined;
                            timeInForce?: "DAY" | undefined;
                            side: "SELL";
                        } | {
                            accountId: string;
                            name: string;
                            symbol: string;
                            executionWindowSeconds: number;
                            scheduledStartAt?: string | null | undefined;
                            executionMode?: "INTERVAL" | "SERIAL" | undefined;
                            globalIntervalSeconds?: number | undefined;
                            intervalMode?: "FIXED" | "RANDOM" | undefined;
                            fixedIntervalSeconds?: number | undefined;
                            randomIntervalMin?: number | undefined;
                            randomIntervalMax?: number | undefined;
                            autoCancelMode?: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP" | undefined;
                            orderTimeoutSeconds?: number | undefined;
                            remainderPolicy?: "EXACT" | "FIXED" | undefined;
                            orderType: "MARKET";
                            priceRule?: undefined;
                            fixedPrice?: undefined;
                            priceRounding?: undefined;
                            tradingSession?: undefined;
                            timeInForce?: "DAY" | undefined;
                            side: "BUY";
                            targetNotional: string;
                            notionalMode?: "FIXED" | "RANDOM" | undefined;
                            fixedNotional?: string | undefined;
                            randomNotionalMin?: string | undefined;
                            randomNotionalMax?: string | undefined;
                            targetQuantity?: undefined;
                            quantityMode?: undefined;
                            fixedQuantity?: undefined;
                            randomQuantityMin?: undefined;
                            randomQuantityMax?: undefined;
                        };
                    };
                    output: {
                        data: {
                            config: {
                                accountId: string;
                                name: string;
                                symbol: string;
                                executionWindowSeconds: number;
                                scheduledStartAt?: string | null | undefined;
                                executionMode: "INTERVAL" | "SERIAL";
                                globalIntervalSeconds: number;
                                intervalMode: "FIXED" | "RANDOM";
                                fixedIntervalSeconds: number;
                                randomIntervalMin: number;
                                randomIntervalMax: number;
                                autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                orderTimeoutSeconds: number;
                                remainderPolicy: "EXACT" | "FIXED";
                                targetQuantity: string;
                                quantityMode: "FIXED" | "RANDOM";
                                fixedQuantity: string;
                                randomQuantityMin: number;
                                randomQuantityMax: number;
                                orderType: "LIMIT";
                                side: "BUY" | "SELL";
                                priceRule: "ASK_1" | "BID_1" | "FIXED";
                                fixedPrice: string | null;
                                priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                tradingSession: "24H" | "EXTENDED" | "RTH";
                                timeInForce: "DAY" | "GTC";
                            } | {
                                accountId: string;
                                name: string;
                                symbol: string;
                                executionWindowSeconds: number;
                                scheduledStartAt?: string | null | undefined;
                                executionMode: "INTERVAL" | "SERIAL";
                                globalIntervalSeconds: number;
                                intervalMode: "FIXED" | "RANDOM";
                                fixedIntervalSeconds: number;
                                randomIntervalMin: number;
                                randomIntervalMax: number;
                                autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                orderTimeoutSeconds: number;
                                remainderPolicy: "EXACT" | "FIXED";
                                targetQuantity: string;
                                quantityMode: "FIXED" | "RANDOM";
                                fixedQuantity: string;
                                randomQuantityMin: number;
                                randomQuantityMax: number;
                                orderType: "MARKET";
                                timeInForce: "DAY";
                                side: "SELL";
                            } | {
                                accountId: string;
                                name: string;
                                symbol: string;
                                executionWindowSeconds: number;
                                scheduledStartAt?: string | null | undefined;
                                executionMode: "INTERVAL" | "SERIAL";
                                globalIntervalSeconds: number;
                                intervalMode: "FIXED" | "RANDOM";
                                fixedIntervalSeconds: number;
                                randomIntervalMin: number;
                                randomIntervalMax: number;
                                autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                orderTimeoutSeconds: number;
                                remainderPolicy: "EXACT" | "FIXED";
                                orderType: "MARKET";
                                timeInForce: "DAY";
                                side: "BUY";
                                targetNotional: string;
                                notionalMode: "FIXED" | "RANDOM";
                                fixedNotional: string;
                                randomNotionalMin: string;
                                randomNotionalMax: string;
                            };
                            createdAt: string;
                            deadlineAt: string | null;
                            endedAt: string | null;
                            exchangeAccountId: string;
                            filledNotional: string;
                            filledQuantity: string;
                            id: string;
                            lastFilledAt: string | null;
                            leaseOwner: string | null;
                            leaseUntil: string | null;
                            name: string;
                            nextRunAt: string | null;
                            orderType: "LIMIT" | "MARKET";
                            ownerUserId: string;
                            reason: string | null;
                            reservedCash: string;
                            reservedQuantity: string;
                            scheduledStartAt: string | null;
                            side: "BUY" | "SELL";
                            startedAt: string | null;
                            status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                            stopReason: string | null;
                            symbol: string;
                            targetNotional: string | null;
                            targetQuantity: string | null;
                            updatedAt: string;
                        };
                    };
                    outputFormat: "json";
                    status: 201;
                };
            }>;
        };
    };
} & {
    api: {
        v1: {
            tasks: {
                ":id": import("hono/client").ClientRequest<string, "/api/v1/tasks/:id", {
                    $get: {
                        input: {
                            param: {
                                id: string;
                            };
                        };
                        output: {
                            data: {
                                task: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    ownerUserId: string;
                                    exchangeAccountId: string;
                                    name: string;
                                    symbol: string;
                                    side: "BUY" | "SELL";
                                    orderType: "LIMIT" | "MARKET";
                                    targetQuantity: string | null;
                                    targetNotional: string | null;
                                    config: {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        targetQuantity: string;
                                        quantityMode: "FIXED" | "RANDOM";
                                        fixedQuantity: string;
                                        randomQuantityMin: number;
                                        randomQuantityMax: number;
                                        orderType: "LIMIT";
                                        side: "BUY" | "SELL";
                                        priceRule: "ASK_1" | "BID_1" | "FIXED";
                                        fixedPrice: string | null;
                                        priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                        tradingSession: "24H" | "EXTENDED" | "RTH";
                                        timeInForce: "DAY" | "GTC";
                                    } | {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        targetQuantity: string;
                                        quantityMode: "FIXED" | "RANDOM";
                                        fixedQuantity: string;
                                        randomQuantityMin: number;
                                        randomQuantityMax: number;
                                        orderType: "MARKET";
                                        timeInForce: "DAY";
                                        side: "SELL";
                                    } | {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        orderType: "MARKET";
                                        timeInForce: "DAY";
                                        side: "BUY";
                                        targetNotional: string;
                                        notionalMode: "FIXED" | "RANDOM";
                                        fixedNotional: string;
                                        randomNotionalMin: string;
                                        randomNotionalMax: string;
                                    };
                                    status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                                    filledQuantity: string;
                                    filledNotional: string;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    scheduledStartAt: string | null;
                                    startedAt: string | null;
                                    deadlineAt: string | null;
                                    endedAt: string | null;
                                    lastFilledAt: string | null;
                                    nextRunAt: string | null;
                                    stopReason: string | null;
                                    reason: string | null;
                                    leaseOwner: string | null;
                                    leaseUntil: string | null;
                                };
                                lastInterruption: {
                                    eventId: string;
                                    status: 'PAUSED' | 'RECOVERY_REQUIRED' | 'RECONCILING';
                                    reason: string;
                                    stopReason: string | null;
                                    occurredAt: string;
                                } | null;
                                source: 'LOCAL_LEDGER';
                                orders: {
                                    feeCurrency: "USD" | null;
                                    priceCurrency: 'USD';
                                    averagePrice: string;
                                    cancelStartedAt: string | null;
                                    clientOrderId: string;
                                    createdAt: string;
                                    exchangeAccountId: string;
                                    exchangeOrderId: string | null;
                                    fee: string | null;
                                    feeFinalized: boolean;
                                    feePending: boolean;
                                    filledNotional: string;
                                    filledQuantity: string;
                                    id: string;
                                    idempotencyKey: string | null;
                                    notional: string | null;
                                    orderType: "LIMIT" | "MARKET";
                                    ownerUserId: string;
                                    price: string | null;
                                    quantity: string | null;
                                    quoteCurrency: string | null;
                                    reason: string | null;
                                    reconciledAt: string | null;
                                    requestHash: string;
                                    reservationReleased: boolean;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    sellInventoryBaseline: string | null;
                                    sellInventoryVerifiedAt: string | null;
                                    side: "BUY" | "SELL";
                                    status: "ACCEPTED" | "CANCELED" | "CANCELING" | "EXPIRED" | "FILLED" | "PARTIALLY_FILLED" | "PLANNED" | "REJECTED" | "SUBMITTING" | "UNKNOWN";
                                    submitStartedAt: string | null;
                                    submittedAt: string | null;
                                    symbol: string;
                                    taskId: string | null;
                                    timeInForce: "DAY" | "GTC";
                                    tradeEvidencePending: boolean;
                                    tradingSession: "24H" | "EXTENDED" | "RTH" | null;
                                    updatedAt: string;
                                    waitDeadlineAt: string | null;
                                }[];
                                trades: {
                                    createdAt: string;
                                    updatedAt: string;
                                    id: string;
                                    ownerUserId: string;
                                    exchangeAccountId: string;
                                    taskId: string | null;
                                    orderId: string;
                                    exchangeTradeId: string;
                                    symbol: string;
                                    side: "BUY" | "SELL";
                                    price: string;
                                    quantity: string;
                                    fee: string | null;
                                    filledAt: string;
                                }[];
                                events: {
                                    id: string;
                                    taskId: string;
                                    ownerUserId: string;
                                    type: string;
                                    message: string;
                                    details: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    };
                                    createdAt: string;
                                }[];
                                summary: {
                                    targetQuantity: string | null;
                                    filledQuantity: string;
                                    remainingQuantity: string | null;
                                    targetNotional: string | null;
                                    filledNotional: string;
                                    remainingNotional: string | null;
                                    submittedOrders: number;
                                    filledOrders: number;
                                    partialOrders: number;
                                    canceledOrders: number;
                                    rejectedOrders: number;
                                };
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                    $patch: {
                        input: {
                            param: {
                                id: string;
                            };
                        } & {
                            json: {
                                accountId: string;
                                name: string;
                                symbol: string;
                                executionWindowSeconds: number;
                                scheduledStartAt?: string | null | undefined;
                                executionMode?: "INTERVAL" | "SERIAL" | undefined;
                                globalIntervalSeconds?: number | undefined;
                                intervalMode?: "FIXED" | "RANDOM" | undefined;
                                fixedIntervalSeconds?: number | undefined;
                                randomIntervalMin?: number | undefined;
                                randomIntervalMax?: number | undefined;
                                autoCancelMode?: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP" | undefined;
                                orderTimeoutSeconds?: number | undefined;
                                remainderPolicy?: "EXACT" | "FIXED" | undefined;
                                targetQuantity: string;
                                quantityMode?: "FIXED" | "RANDOM" | undefined;
                                fixedQuantity?: string | undefined;
                                randomQuantityMin?: number | undefined;
                                randomQuantityMax?: number | undefined;
                                targetNotional?: undefined;
                                notionalMode?: undefined;
                                fixedNotional?: undefined;
                                randomNotionalMin?: undefined;
                                randomNotionalMax?: undefined;
                                orderType?: "LIMIT" | undefined;
                                side: "BUY" | "SELL";
                                priceRule?: "ASK_1" | "BID_1" | "FIXED" | undefined;
                                fixedPrice?: string | null | undefined;
                                priceRounding?: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE" | undefined;
                                tradingSession?: "24H" | "EXTENDED" | "RTH" | undefined;
                                timeInForce?: "DAY" | "GTC" | undefined;
                            } | {
                                accountId: string;
                                name: string;
                                symbol: string;
                                executionWindowSeconds: number;
                                scheduledStartAt?: string | null | undefined;
                                executionMode?: "INTERVAL" | "SERIAL" | undefined;
                                globalIntervalSeconds?: number | undefined;
                                intervalMode?: "FIXED" | "RANDOM" | undefined;
                                fixedIntervalSeconds?: number | undefined;
                                randomIntervalMin?: number | undefined;
                                randomIntervalMax?: number | undefined;
                                autoCancelMode?: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP" | undefined;
                                orderTimeoutSeconds?: number | undefined;
                                remainderPolicy?: "EXACT" | "FIXED" | undefined;
                                targetQuantity: string;
                                quantityMode?: "FIXED" | "RANDOM" | undefined;
                                fixedQuantity?: string | undefined;
                                randomQuantityMin?: number | undefined;
                                randomQuantityMax?: number | undefined;
                                targetNotional?: undefined;
                                notionalMode?: undefined;
                                fixedNotional?: undefined;
                                randomNotionalMin?: undefined;
                                randomNotionalMax?: undefined;
                                orderType: "MARKET";
                                priceRule?: undefined;
                                fixedPrice?: undefined;
                                priceRounding?: undefined;
                                tradingSession?: undefined;
                                timeInForce?: "DAY" | undefined;
                                side: "SELL";
                            } | {
                                accountId: string;
                                name: string;
                                symbol: string;
                                executionWindowSeconds: number;
                                scheduledStartAt?: string | null | undefined;
                                executionMode?: "INTERVAL" | "SERIAL" | undefined;
                                globalIntervalSeconds?: number | undefined;
                                intervalMode?: "FIXED" | "RANDOM" | undefined;
                                fixedIntervalSeconds?: number | undefined;
                                randomIntervalMin?: number | undefined;
                                randomIntervalMax?: number | undefined;
                                autoCancelMode?: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP" | undefined;
                                orderTimeoutSeconds?: number | undefined;
                                remainderPolicy?: "EXACT" | "FIXED" | undefined;
                                orderType: "MARKET";
                                priceRule?: undefined;
                                fixedPrice?: undefined;
                                priceRounding?: undefined;
                                tradingSession?: undefined;
                                timeInForce?: "DAY" | undefined;
                                side: "BUY";
                                targetNotional: string;
                                notionalMode?: "FIXED" | "RANDOM" | undefined;
                                fixedNotional?: string | undefined;
                                randomNotionalMin?: string | undefined;
                                randomNotionalMax?: string | undefined;
                                targetQuantity?: undefined;
                                quantityMode?: undefined;
                                fixedQuantity?: undefined;
                                randomQuantityMin?: undefined;
                                randomQuantityMax?: undefined;
                            };
                        };
                        output: {
                            data: {
                                config: {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    targetQuantity: string;
                                    quantityMode: "FIXED" | "RANDOM";
                                    fixedQuantity: string;
                                    randomQuantityMin: number;
                                    randomQuantityMax: number;
                                    orderType: "LIMIT";
                                    side: "BUY" | "SELL";
                                    priceRule: "ASK_1" | "BID_1" | "FIXED";
                                    fixedPrice: string | null;
                                    priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                    tradingSession: "24H" | "EXTENDED" | "RTH";
                                    timeInForce: "DAY" | "GTC";
                                } | {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    targetQuantity: string;
                                    quantityMode: "FIXED" | "RANDOM";
                                    fixedQuantity: string;
                                    randomQuantityMin: number;
                                    randomQuantityMax: number;
                                    orderType: "MARKET";
                                    timeInForce: "DAY";
                                    side: "SELL";
                                } | {
                                    accountId: string;
                                    name: string;
                                    symbol: string;
                                    executionWindowSeconds: number;
                                    scheduledStartAt?: string | null | undefined;
                                    executionMode: "INTERVAL" | "SERIAL";
                                    globalIntervalSeconds: number;
                                    intervalMode: "FIXED" | "RANDOM";
                                    fixedIntervalSeconds: number;
                                    randomIntervalMin: number;
                                    randomIntervalMax: number;
                                    autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                    orderTimeoutSeconds: number;
                                    remainderPolicy: "EXACT" | "FIXED";
                                    orderType: "MARKET";
                                    timeInForce: "DAY";
                                    side: "BUY";
                                    targetNotional: string;
                                    notionalMode: "FIXED" | "RANDOM";
                                    fixedNotional: string;
                                    randomNotionalMin: string;
                                    randomNotionalMax: string;
                                };
                                createdAt: string;
                                deadlineAt: string | null;
                                endedAt: string | null;
                                exchangeAccountId: string;
                                filledNotional: string;
                                filledQuantity: string;
                                id: string;
                                lastFilledAt: string | null;
                                leaseOwner: string | null;
                                leaseUntil: string | null;
                                name: string;
                                nextRunAt: string | null;
                                orderType: "LIMIT" | "MARKET";
                                ownerUserId: string;
                                reason: string | null;
                                reservedCash: string;
                                reservedQuantity: string;
                                scheduledStartAt: string | null;
                                side: "BUY" | "SELL";
                                startedAt: string | null;
                                status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                                stopReason: string | null;
                                symbol: string;
                                targetNotional: string | null;
                                targetQuantity: string | null;
                                updatedAt: string;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            tasks: {
                ":id": {
                    control: import("hono/client").ClientRequest<string, "/api/v1/tasks/:id/control", {
                        $post: {
                            input: {
                                param: {
                                    id: string;
                                };
                            } & {
                                json: {
                                    action: "pause" | "reconcile" | "resume" | "start" | "stop";
                                };
                            };
                            output: {
                                error: {
                                    code: string;
                                    message: string;
                                    requestId: string;
                                    operationAccepted?: false | undefined;
                                    details?: null | undefined;
                                };
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: -1 | 100 | 102 | 103 | 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
                        } | {
                            input: {
                                param: {
                                    id: string;
                                };
                            } & {
                                json: {
                                    action: "pause" | "reconcile" | "resume" | "start" | "stop";
                                };
                            };
                            output: {
                                data: {
                                    config: {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        targetQuantity: string;
                                        quantityMode: "FIXED" | "RANDOM";
                                        fixedQuantity: string;
                                        randomQuantityMin: number;
                                        randomQuantityMax: number;
                                        orderType: "LIMIT";
                                        side: "BUY" | "SELL";
                                        priceRule: "ASK_1" | "BID_1" | "FIXED";
                                        fixedPrice: string | null;
                                        priceRounding: "CEIL" | "HALF_UP" | "REJECT" | "SIDE_SAFE" | "TRUNCATE";
                                        tradingSession: "24H" | "EXTENDED" | "RTH";
                                        timeInForce: "DAY" | "GTC";
                                    } | {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        targetQuantity: string;
                                        quantityMode: "FIXED" | "RANDOM";
                                        fixedQuantity: string;
                                        randomQuantityMin: number;
                                        randomQuantityMax: number;
                                        orderType: "MARKET";
                                        timeInForce: "DAY";
                                        side: "SELL";
                                    } | {
                                        accountId: string;
                                        name: string;
                                        symbol: string;
                                        executionWindowSeconds: number;
                                        scheduledStartAt?: string | null | undefined;
                                        executionMode: "INTERVAL" | "SERIAL";
                                        globalIntervalSeconds: number;
                                        intervalMode: "FIXED" | "RANDOM";
                                        fixedIntervalSeconds: number;
                                        randomIntervalMin: number;
                                        randomIntervalMax: number;
                                        autoCancelMode: "AFTER_TIMEOUT" | "AT_TASK_END" | "KEEP";
                                        orderTimeoutSeconds: number;
                                        remainderPolicy: "EXACT" | "FIXED";
                                        orderType: "MARKET";
                                        timeInForce: "DAY";
                                        side: "BUY";
                                        targetNotional: string;
                                        notionalMode: "FIXED" | "RANDOM";
                                        fixedNotional: string;
                                        randomNotionalMin: string;
                                        randomNotionalMax: string;
                                    };
                                    createdAt: string;
                                    deadlineAt: string | null;
                                    endedAt: string | null;
                                    exchangeAccountId: string;
                                    filledNotional: string;
                                    filledQuantity: string;
                                    id: string;
                                    lastFilledAt: string | null;
                                    leaseOwner: string | null;
                                    leaseUntil: string | null;
                                    name: string;
                                    nextRunAt: string | null;
                                    orderType: "LIMIT" | "MARKET";
                                    ownerUserId: string;
                                    reason: string | null;
                                    reservedCash: string;
                                    reservedQuantity: string;
                                    scheduledStartAt: string | null;
                                    side: "BUY" | "SELL";
                                    startedAt: string | null;
                                    status: "COMPLETED" | "CREATED" | "EXPIRED" | "FAILED" | "PAUSED" | "READY" | "RECONCILING" | "RECOVERY_REQUIRED" | "RUNNING" | "SCHEDULED" | "STOPPED" | "STOPPING" | "VALIDATING";
                                    stopReason: string | null;
                                    symbol: string;
                                    targetNotional: string | null;
                                    targetQuantity: string | null;
                                    updatedAt: string;
                                } | null;
                                operation: {
                                    id: string;
                                    actorUserId: string;
                                    kind: "ACCOUNT_CHECK" | "ACCOUNT_RECONCILE" | "ACCOUNT_RESTRICT" | "ACCOUNT_SYNC" | "ORDER_CANCEL" | "PLATFORM_UPDATE" | "TASK_CONTROL" | "USER_UPDATE";
                                    targetType: "ACCOUNT" | "ORDER" | "PLATFORM" | "TASK" | "USER";
                                    targetId: string;
                                    status: "CONFLICT" | "PROCESSING" | "REJECTED" | "SUCCEEDED" | "UNKNOWN";
                                    phase: string;
                                    outcome: string | null;
                                    createdAt: string;
                                    updatedAt: string;
                                    finishedAt: string | null;
                                    result: {
                                        [x: string]: import("hono/utils/types").JSONValue;
                                    } | null;
                                    error: {
                                        code: string;
                                        message: string;
                                    } | null;
                                };
                            };
                            outputFormat: "json";
                            status: 200 | 202;
                        };
                    }>;
                };
            };
        };
    };
} & {
    api: {
        v1: {
            market: {
                holdings: import("hono/client").ClientRequest<string, "/api/v1/market/holdings", {
                    $get: {
                        input: {
                            query: {
                                accountId: string;
                            };
                        };
                        output: {
                            data: {
                                accountId: string;
                                source: "BINANCE_FUNDING_WALLET";
                                requestedAt: string;
                                receivedAt: string;
                                sourceUpdatedAt: null;
                                items: {
                                    symbol: string;
                                    assetCode: string;
                                    stockTicker: string;
                                    fundingFreeQuantity: string;
                                    lockedQuantity: string;
                                    freezeQuantity: string | null;
                                    withdrawingQuantity: string | null;
                                }[];
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            market: {
                symbols: import("hono/client").ClientRequest<string, "/api/v1/market/symbols", {
                    $get: {
                        input: {
                            query: {
                                accountId: string | string[];
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                                refresh?: "false" | "true" | boolean | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    symbol: string;
                                    tradability: string | null;
                                    extendedSession: boolean | null;
                                    overnightSupported: boolean | null;
                                    fractionable: boolean | null;
                                    fractionableEh: boolean | null;
                                    listingTime: number | null;
                                    delistingTime: number | null;
                                    maxNumOrders: number | null;
                                    stepSize: string | null;
                                    minQuantity: string | null;
                                    maxQuantity: string | null;
                                    minNotional: string | null;
                                    maxNotional: string | null;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                                source: 'BINANCE_STOCKS';
                                fetchedAt: string;
                                expiresAt: string;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            market: {
                holdings: import("hono/client").ClientRequest<string, "/api/v1/market/holdings", {
                    $get: {
                        input: {
                            query: {
                                accountId: string;
                            };
                        };
                        output: {
                            data: {
                                accountId: string;
                                source: "BINANCE_FUNDING_WALLET";
                                requestedAt: string;
                                receivedAt: string;
                                sourceUpdatedAt: null;
                                items: {
                                    symbol: string;
                                    assetCode: string;
                                    stockTicker: string;
                                    fundingFreeQuantity: string;
                                    lockedQuantity: string;
                                    freezeQuantity: string | null;
                                    withdrawingQuantity: string | null;
                                }[];
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            market: {
                "quote-stream": import("hono/client").ClientRequest<string, "/api/v1/market/quote-stream", {
                    $get: {
                        input: {
                            query: {
                                accountId: string;
                                symbol: string;
                            };
                        };
                        output: {};
                        outputFormat: string;
                        status: import("hono/utils/http-status").StatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            market: {
                symbols: import("hono/client").ClientRequest<string, "/api/v1/market/symbols", {
                    $get: {
                        input: {
                            query: {
                                accountId: string | string[];
                                search?: string | undefined;
                                page?: string | string[] | undefined;
                                pageSize?: string | string[] | undefined;
                                refresh?: "false" | "true" | boolean | undefined;
                            };
                        };
                        output: {
                            data: {
                                items: {
                                    symbol: string;
                                    tradability: string | null;
                                    extendedSession: boolean | null;
                                    overnightSupported: boolean | null;
                                    fractionable: boolean | null;
                                    fractionableEh: boolean | null;
                                    listingTime: number | null;
                                    delistingTime: number | null;
                                    maxNumOrders: number | null;
                                    stepSize: string | null;
                                    minQuantity: string | null;
                                    maxQuantity: string | null;
                                    minNotional: string | null;
                                    maxNotional: string | null;
                                }[];
                                total: number;
                                page: number;
                                pageSize: number;
                                source: 'BINANCE_STOCKS';
                                fetchedAt: string;
                                expiresAt: string;
                            };
                        };
                        outputFormat: "json";
                        status: import("hono/utils/http-status").ContentfulStatusCode;
                    };
                }>;
            };
        };
    };
} & {
    api: {
        v1: {
            meta: import("hono/client").ClientRequest<string, "/api/v1/meta", {
                $get: {
                    output: {
                        data: {
                            environment: 'production';
                            label: string;
                            tradingReady: boolean;
                            availability: 'AVAILABLE' | 'PARTIAL';
                            buySupported: boolean;
                            sellSupported: boolean;
                            capabilities: {
                                quotes: boolean;
                                orders: boolean;
                                trades: boolean;
                                assets: boolean;
                                buy: boolean;
                                sell: boolean;
                            };
                            blockers: string[];
                            apiVersion: string;
                        };
                    };
                    outputFormat: "json";
                    status: import("hono/utils/http-status").ContentfulStatusCode;
                    input: {};
                };
            }>;
        };
    };
} & {
    healthz: import("hono/client").ClientRequest<string, "/healthz", {
        $get: {
            output: {
                data: {
                    status: string;
                    database: {
                        online: boolean;
                        environmentValid: boolean;
                    };
                    worker: {
                        online: boolean;
                        lastSeenAt: string | null;
                        status: string;
                    };
                    environment: string;
                    time: string;
                };
            };
            outputFormat: "json";
            status: 200 | 503;
            input: {};
        };
    }>;
};
export type ApiClient = typeof contract;
