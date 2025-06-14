import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconFileText, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import type { UploadResult } from "../types";

interface AddBillModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedFile: File | null;
	onFileSelect: (file: File | null) => void;
	onUpload: () => Promise<boolean>;
	uploadResult: UploadResult | null;
	setUploadResult: (result: UploadResult | null) => void;
	isUploading: boolean;
}

export function AddBillModal({
	open,
	onOpenChange,
	selectedFile,
	onFileSelect,
	onUpload,
	uploadResult,
	setUploadResult,
	isUploading,
}: AddBillModalProps) {
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			if (file.type === "application/pdf") {
				onFileSelect(file);
				setUploadResult(null);
			} else {
				toast.error("Invalid file type", {
					description: "Please select a valid bill file (PDF format).",
				});
				e.target.value = "";
			}
		}
	};

	const handleUpload = async () => {
		const success = await onUpload();
		if (success) {
			onOpenChange(false);
		}
	};

	const handleCancel = () => {
		setUploadResult(null);
		onFileSelect(null);
		onOpenChange(false);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-lg">
				<AlertDialogHeader>
					<AlertDialogTitle>Add New Bill</AlertDialogTitle>
					<AlertDialogDescription>
						Upload a bill to automatically extract details and split costs among
						all active housemates.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-4 py-4">
					<div>
						<Label htmlFor="billPdf" className="font-medium text-sm">
							Bill File
						</Label>
						<div className="mt-2">
							{selectedFile ? (
								<div className="rounded-lg border-2 border-green-300 border-dashed bg-green-50 p-6 text-center dark:border-green-600 dark:bg-green-950">
									<div className="space-y-2">
										<div className="flex items-center justify-center">
											<IconFileText className="h-8 w-8 text-green-600" />
										</div>
										<p className="font-medium text-green-600 text-sm">
											{selectedFile.name}
										</p>
										<p className="text-muted-foreground text-xs">
											{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
										</p>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => onFileSelect(null)}
											disabled={isUploading}
										>
											Remove
										</Button>
									</div>
								</div>
							) : (
								<div className="relative">
									<Input
										id="billPdf"
										type="file"
										accept=".pdf"
										onChange={handleFileChange}
										disabled={isUploading}
										className="hidden"
									/>
									<Label
										htmlFor="billPdf"
										className="block cursor-pointer rounded-lg border-2 border-border border-dashed bg-muted/20 p-6 text-center transition-colors hover:border-border/70 hover:bg-muted/40"
									>
										<div className="space-y-2">
											<div className="flex items-center justify-center">
												<IconPlus className="h-8 w-8 text-muted-foreground" />
											</div>
											<div>
												<p className="font-medium text-sm">
													Click to select your bill
												</p>
												<p className="text-muted-foreground text-xs">
													Supports PDF files up to 10MB
												</p>
											</div>
										</div>
									</Label>
								</div>
							)}
						</div>
					</div>

					{uploadResult && (
						<div
							className={`rounded-lg p-3 ${uploadResult.success ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}
						>
							<p
								className={`text-sm ${uploadResult.success ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}
							>
								{uploadResult.success ? "✅ " : "❌ "}
								{uploadResult.message}
								{uploadResult.error && `: ${uploadResult.error}`}
							</p>
						</div>
					)}

					<div className="flex gap-2 pt-4">
						<AlertDialogCancel asChild>
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								disabled={isUploading}
								onClick={handleCancel}
							>
								Cancel
							</Button>
						</AlertDialogCancel>
						<Button
							onClick={handleUpload}
							className="flex-1"
							disabled={isUploading || !selectedFile}
						>
							{isUploading ? (
								<>
									<span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-white border-b-2" />
									Processing...
								</>
							) : (
								"Upload & Process"
							)}
						</Button>
					</div>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	);
}
