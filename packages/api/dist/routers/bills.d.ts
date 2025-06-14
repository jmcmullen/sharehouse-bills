import { z } from "zod";
export declare const billsRouter: {
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
    }>, z.ZodObject<{
        id: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
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
    }>, z.ZodObject<{
        billerName: z.ZodString;
        totalAmount: z.ZodNumber;
        dueDate: z.ZodDate;
        pdfUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
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
    }>, z.ZodObject<{
        billerName: z.ZodString;
        totalAmount: z.ZodNumber;
        dueDate: z.ZodDate;
        pdfUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
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
    }>, z.ZodObject<{
        debtId: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
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
    }, z.ZodObject<{
        billerName: z.ZodString;
        totalAmount: z.ZodNumber;
        dueDate: z.ZodString;
        emailFrom: z.ZodString;
        emailSubject: z.ZodString;
        filename: z.ZodString;
        billType: z.ZodOptional<z.ZodString>;
        accountNumber: z.ZodOptional<z.ZodString>;
        referenceNumber: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
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
