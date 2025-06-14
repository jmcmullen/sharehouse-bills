import { type ParsedBill } from "./ai-parser";
export interface FileAttachment {
    filename: string;
    contentType: string;
    buffer: Buffer;
    size: number;
}
export interface ProcessingResult {
    success: boolean;
    billId?: number;
    filename: string;
    error?: string;
    parsedData?: ParsedBill;
}
export declare class BillProcessorService {
    private aiParser;
    constructor();
    processEmailAttachments(attachments: FileAttachment[], emailFrom: string, emailSubject: string): Promise<ProcessingResult[]>;
    processPdfAttachment(attachment: FileAttachment, emailFrom: string, emailSubject: string): Promise<ProcessingResult>;
    testAIConnection(): Promise<boolean>;
}
