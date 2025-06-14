export declare const o: import("@orpc/server").Builder<{
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
} & Record<never, never>, {
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
}, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<unknown, unknown>, Record<never, never>, Record<never, never>>;
export declare const publicProcedure: import("@orpc/server").Builder<{
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
} & Record<never, never>, {
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
}, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<unknown, unknown>, Record<never, never>, Record<never, never>>;
export declare const protectedProcedure: import("@orpc/server").BuilderWithMiddlewares<import("@orpc/server").MergedInitialContext<{
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
} & Record<never, never>, {
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
} & Record<never, never>, {
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
}>, import("@orpc/server").MergedCurrentContext<{
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    } | null;
}, {
    session: {
        session: {
            id: string;
            token: string;
            userId: string;
            expiresAt: Date;
            createdAt: Date;
            updatedAt: Date;
            ipAddress?: string | null | undefined | undefined;
            userAgent?: string | null | undefined | undefined;
        };
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    };
}>, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<unknown, unknown>, Record<never, never>, Record<never, never>>;
