import z from "zod/v4";
export declare const todoRouter: {
    getAll: import("@orpc/server").DecoratedProcedure<{
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
    }, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<{
        text: string;
        id: number;
        completed: boolean;
    }[], {
        text: string;
        id: number;
        completed: boolean;
    }[]>, Record<never, never>, Record<never, never>>;
    create: import("@orpc/server").DecoratedProcedure<{
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
    }, z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strip>, import("@orpc/contract").Schema<{
        text: string;
        id: number;
        completed: boolean;
    }, {
        text: string;
        id: number;
        completed: boolean;
    }>, Record<never, never>, Record<never, never>>;
    toggle: import("@orpc/server").DecoratedProcedure<{
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
    }, z.ZodObject<{
        id: z.ZodNumber;
        completed: z.ZodBoolean;
    }, z.core.$strip>, import("@orpc/contract").Schema<{
        success: boolean;
    }, {
        success: boolean;
    }>, Record<never, never>, Record<never, never>>;
    delete: import("@orpc/server").DecoratedProcedure<{
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
    }, z.ZodObject<{
        id: z.ZodNumber;
    }, z.core.$strip>, import("@orpc/contract").Schema<{
        success: boolean;
    }, {
        success: boolean;
    }>, Record<never, never>, Record<never, never>>;
};
