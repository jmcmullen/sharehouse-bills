import type { Context as HonoContext } from "hono";
export type CreateContextOptions = {
    context?: HonoContext;
    req?: Request;
};
export declare function createContext({ context, req }: CreateContextOptions): Promise<{
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
}>;
export type Context = Awaited<ReturnType<typeof createContext>>;
