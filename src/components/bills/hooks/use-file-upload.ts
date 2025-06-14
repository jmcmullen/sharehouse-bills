import { useState } from "react";
import { toast } from "sonner";

export function useFileUpload() {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	const handleFileSelect = (file: File | null) => {
		if (file && file.type !== "application/pdf") {
			toast.error("Invalid file type", {
				description: "Please select a valid PDF file.",
			});
			return;
		}
		setSelectedFile(file);
	};

	const resetFile = () => {
		setSelectedFile(null);
	};

	return {
		selectedFile,
		handleFileSelect,
		resetFile,
	};
}
