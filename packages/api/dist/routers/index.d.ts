export declare const appRouter: {
    healthCheck: import("@orpc/server").DecoratedProcedure<{
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
    }, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<string, string>, Record<never, never>, Record<never, never>>;
    privateData: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
    }>, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<{
        message: string;
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    }, {
        message: string;
        user: {
            id: string;
            name: string;
            emailVerified: boolean;
            email: string;
            createdAt: Date;
            updatedAt: Date;
            image?: string | null | undefined | undefined;
        };
    }>, Record<never, never>, Record<never, never>>;
    todo: {
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
        }, import("zod/v4").ZodObject<{
            text: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, import("@orpc/contract").Schema<{
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
        }, import("zod/v4").ZodObject<{
            id: import("zod/v4").ZodNumber;
            completed: import("zod/v4").ZodBoolean;
        }, import("zod/v4/core").$strip>, import("@orpc/contract").Schema<{
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
        }, import("zod/v4").ZodObject<{
            id: import("zod/v4").ZodNumber;
        }, import("zod/v4/core").$strip>, import("@orpc/contract").Schema<{
            success: boolean;
        }, {
            success: boolean;
        }>, Record<never, never>, Record<never, never>>;
    };
    bills: {
        getAllBills: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<{
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            } | null;
            housemate: {
                id: number;
                name: string;
                email: string | null;
                createdAt: Date;
                updatedAt: Date;
                bankAlias: string | null;
                isActive: boolean;
                isOwner: boolean;
            } | null;
        }[], {
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            } | null;
            housemate: {
                id: number;
                name: string;
                email: string | null;
                createdAt: Date;
                updatedAt: Date;
                bankAlias: string | null;
                isActive: boolean;
                isOwner: boolean;
            } | null;
        }[]>, Record<never, never>, Record<never, never>>;
        getBillById: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            id: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
        }, {
            id: number;
        }>, import("@orpc/contract").Schema<{
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            } | null;
            housemate: {
                id: number;
                name: string;
                email: string | null;
                createdAt: Date;
                updatedAt: Date;
                bankAlias: string | null;
                isActive: boolean;
                isOwner: boolean;
            } | null;
        }[], {
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            } | null;
            housemate: {
                id: number;
                name: string;
                email: string | null;
                createdAt: Date;
                updatedAt: Date;
                bankAlias: string | null;
                isActive: boolean;
                isOwner: boolean;
            } | null;
        }[]>, Record<never, never>, Record<never, never>>;
        createBill: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            billerName: import("zod").ZodString;
            totalAmount: import("zod").ZodNumber;
            dueDate: import("zod").ZodDate;
            pdfUrl: import("zod").ZodOptional<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
            billerName: string;
            totalAmount: number;
            dueDate: Date;
            pdfUrl?: string | undefined;
        }, {
            billerName: string;
            totalAmount: number;
            dueDate: Date;
            pdfUrl?: string | undefined;
        }>, import("@orpc/contract").Schema<{
            id: number;
            createdAt: Date;
            updatedAt: Date;
            billerName: string;
            totalAmount: number;
            dueDate: Date;
            status: "pending" | "partially_paid" | "paid";
            pdfUrl: string | null;
        }, {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            billerName: string;
            totalAmount: number;
            dueDate: Date;
            status: "pending" | "partially_paid" | "paid";
            pdfUrl: string | null;
        }>, Record<never, never>, Record<never, never>>;
        createBillFromParsedData: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            billerName: import("zod").ZodString;
            totalAmount: import("zod").ZodNumber;
            dueDate: import("zod").ZodDate;
            pdfUrl: import("zod").ZodOptional<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
            billerName: string;
            totalAmount: number;
            dueDate: Date;
            pdfUrl?: string | undefined;
        }, {
            billerName: string;
            totalAmount: number;
            dueDate: Date;
            pdfUrl?: string | undefined;
        }>, import("@orpc/contract").Schema<{
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            } | null;
            housemate: {
                id: number;
                name: string;
                email: string | null;
                createdAt: Date;
                updatedAt: Date;
                bankAlias: string | null;
                isActive: boolean;
                isOwner: boolean;
            } | null;
        }[], {
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            } | null;
            housemate: {
                id: number;
                name: string;
                email: string | null;
                createdAt: Date;
                updatedAt: Date;
                bankAlias: string | null;
                isActive: boolean;
                isOwner: boolean;
            } | null;
        }[]>, Record<never, never>, Record<never, never>>;
        markDebtAsPaid: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            debtId: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            debtId: number;
        }, {
            debtId: number;
        }>, import("@orpc/contract").Schema<{
            success: boolean;
            debtId: number;
            billStatus: string;
        }, {
            success: boolean;
            debtId: number;
            billStatus: string;
        }>, Record<never, never>, Record<never, never>>;
        getBillsSummary: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<{
            totalBills: number;
            paidBills: number;
            pendingBills: number;
            partiallyPaidBills: number;
            totalAmount: number;
            paidAmount: number;
            outstandingAmount: number;
        }, {
            totalBills: number;
            paidBills: number;
            pendingBills: number;
            partiallyPaidBills: number;
            totalAmount: number;
            paidAmount: number;
            outstandingAmount: number;
        }>, Record<never, never>, Record<never, never>>;
        createBillFromEmail: import("@orpc/server").DecoratedProcedure<{
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
        }, import("zod").ZodObject<{
            billerName: import("zod").ZodString;
            totalAmount: import("zod").ZodNumber;
            dueDate: import("zod").ZodString;
            emailFrom: import("zod").ZodString;
            emailSubject: import("zod").ZodString;
            filename: import("zod").ZodString;
            billType: import("zod").ZodOptional<import("zod").ZodString>;
            accountNumber: import("zod").ZodOptional<import("zod").ZodString>;
            referenceNumber: import("zod").ZodOptional<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
            billerName: string;
            totalAmount: number;
            dueDate: string;
            emailFrom: string;
            emailSubject: string;
            filename: string;
            billType?: string | undefined;
            accountNumber?: string | undefined;
            referenceNumber?: string | undefined;
        }, {
            billerName: string;
            totalAmount: number;
            dueDate: string;
            emailFrom: string;
            emailSubject: string;
            filename: string;
            billType?: string | undefined;
            accountNumber?: string | undefined;
            referenceNumber?: string | undefined;
        }>, import("@orpc/contract").Schema<{
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debts: {
                debt: {
                    id: number;
                    createdAt: Date;
                    updatedAt: Date;
                    billId: number;
                    housemateId: number;
                    amountOwed: number;
                    isPaid: boolean;
                    paidAt: Date | null;
                } | null;
                housemate: {
                    id: number;
                    name: string;
                    email: string | null;
                    createdAt: Date;
                    updatedAt: Date;
                    bankAlias: string | null;
                    isActive: boolean;
                    isOwner: boolean;
                } | null;
            }[];
            metadata: {
                emailFrom: string;
                emailSubject: string;
                filename: string;
                processingDate: Date;
            };
        }, {
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
            debts: {
                debt: {
                    id: number;
                    createdAt: Date;
                    updatedAt: Date;
                    billId: number;
                    housemateId: number;
                    amountOwed: number;
                    isPaid: boolean;
                    paidAt: Date | null;
                } | null;
                housemate: {
                    id: number;
                    name: string;
                    email: string | null;
                    createdAt: Date;
                    updatedAt: Date;
                    bankAlias: string | null;
                    isActive: boolean;
                    isOwner: boolean;
                } | null;
            }[];
            metadata: {
                emailFrom: string;
                emailSubject: string;
                filename: string;
                processingDate: Date;
            };
        }>, Record<never, never>, Record<never, never>>;
    };
    housemates: {
        getAllHousemates: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }[], {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }[]>, Record<never, never>, Record<never, never>>;
        getActiveHousemates: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("@orpc/contract").Schema<unknown, unknown>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }[], {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }[]>, Record<never, never>, Record<never, never>>;
        getHousemateById: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            id: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
        }, {
            id: number;
        }>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }, {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }>, Record<never, never>, Record<never, never>>;
        createHousemate: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            name: import("zod").ZodString;
            email: import("zod").ZodOptional<import("zod").ZodString>;
            bankAlias: import("zod").ZodOptional<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
            name: string;
            email?: string | undefined;
            bankAlias?: string | undefined;
        }, {
            name: string;
            email?: string | undefined;
            bankAlias?: string | undefined;
        }>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }, {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }>, Record<never, never>, Record<never, never>>;
        updateHousemate: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            name: import("zod").ZodOptional<import("zod").ZodString>;
            email: import("zod").ZodOptional<import("zod").ZodString>;
            bankAlias: import("zod").ZodOptional<import("zod").ZodString>;
            isActive: import("zod").ZodOptional<import("zod").ZodBoolean>;
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
            name?: string | undefined;
            email?: string | undefined;
            bankAlias?: string | undefined;
            isActive?: boolean | undefined;
        }, {
            id: number;
            name?: string | undefined;
            email?: string | undefined;
            bankAlias?: string | undefined;
            isActive?: boolean | undefined;
        }>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }, {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }>, Record<never, never>, Record<never, never>>;
        getHousemateDebts: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            housemateId: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            housemateId: number;
        }, {
            housemateId: number;
        }>, import("@orpc/contract").Schema<{
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            };
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
        }[], {
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            };
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
        }[]>, Record<never, never>, Record<never, never>>;
        getHousemateOutstandingDebts: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            housemateId: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            housemateId: number;
        }, {
            housemateId: number;
        }>, import("@orpc/contract").Schema<{
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            };
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
        }[], {
            debt: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billId: number;
                housemateId: number;
                amountOwed: number;
                isPaid: boolean;
                paidAt: Date | null;
            };
            bill: {
                id: number;
                createdAt: Date;
                updatedAt: Date;
                billerName: string;
                totalAmount: number;
                dueDate: Date;
                status: "pending" | "partially_paid" | "paid";
                pdfUrl: string | null;
            };
        }[]>, Record<never, never>, Record<never, never>>;
        getHousemateStats: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            housemateId: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            housemateId: number;
        }, {
            housemateId: number;
        }>, import("@orpc/contract").Schema<{
            totalDebts: number;
            paidDebts: number;
            unpaidDebts: number;
            totalOwed: number;
            totalPaid: number;
            totalOutstanding: number;
            paymentRate: number;
        }, {
            totalDebts: number;
            paidDebts: number;
            unpaidDebts: number;
            totalOwed: number;
            totalPaid: number;
            totalOutstanding: number;
            paymentRate: number;
        }>, Record<never, never>, Record<never, never>>;
        deactivateHousemate: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            id: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
        }, {
            id: number;
        }>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }, {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }>, Record<never, never>, Record<never, never>>;
        reactivateHousemate: import("@orpc/server").DecoratedProcedure<import("@orpc/server").MergedInitialContext<{
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
        }>, import("zod").ZodObject<{
            id: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
        }, {
            id: number;
        }>, import("@orpc/contract").Schema<{
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }, {
            id: number;
            name: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            bankAlias: string | null;
            isActive: boolean;
            isOwner: boolean;
        }>, Record<never, never>, Record<never, never>>;
    };
};
export type AppRouter = typeof appRouter;
