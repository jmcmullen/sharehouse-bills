import { z } from "zod";
export declare const parsedBillSchema: z.ZodObject<{
    billerName: z.ZodString;
    totalAmount: z.ZodNumber;
    dueDate: z.ZodString;
    billType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accountNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    referenceNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    billerName: string;
    totalAmount: number;
    dueDate: string;
    billType?: string | null | undefined;
    accountNumber?: string | null | undefined;
    referenceNumber?: string | null | undefined;
}, {
    billerName: string;
    totalAmount: number;
    dueDate: string;
    billType?: string | null | undefined;
    accountNumber?: string | null | undefined;
    referenceNumber?: string | null | undefined;
}>;
export type ParsedBill = z.infer<typeof parsedBillSchema>;
export declare class AIParserService {
    parsePdfFromBuffer(pdfBuffer: Buffer, filename: string, mimeType?: string): Promise<ParsedBill>;
    testConnection(): Promise<boolean>;
}
