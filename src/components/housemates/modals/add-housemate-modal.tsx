import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validators } from "@/utils/tanstack-form";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import type { HousemateFormData } from "../types";

interface AddHousemateModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	formData: HousemateFormData;
	onFormDataChange: (data: HousemateFormData) => void;
	onSubmit: () => void;
	isLoading: boolean;
}

export function AddHousemateModal({
	open,
	onOpenChange,
	formData,
	onFormDataChange,
	onSubmit,
	isLoading,
}: AddHousemateModalProps) {
	const form = useForm({
		defaultValues: formData,
		onSubmit: async () => {
			onSubmit();
		},
	});

	// Sync external formData with form state
	useEffect(() => {
		if (open) {
			form.reset(formData);
		}
	}, [open, formData, form]);

	// Update parent when form values change
	useEffect(() => {
		const subscription = form.store.subscribe(() => {
			const state = form.store.state;
			onFormDataChange(state.values);
		});
		return () => subscription();
	}, [form.store, onFormDataChange]);

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			form.reset();
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>Add New Housemate</DialogTitle>
						<DialogDescription>
							Add a new member to your household for bill tracking
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<form.Field
							name="name"
							validators={{
								onChange: validators.required("Name is required").onChange,
							}}
						>
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="add-name">Name *</Label>
									<Input
										id="add-name"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										placeholder="Enter full name"
									/>
									{field.state.meta.errors.map((error) => (
										<p key={error} className="text-red-500 text-sm">
											{error}
										</p>
									))}
								</div>
							)}
						</form.Field>

						<form.Field
							name="email"
							validators={{
								onChange: ({ value }) => {
									if (value && !validators.email().onChange({ value })) {
										return undefined;
									}
									return validators.email().onChange({ value });
								},
							}}
						>
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="add-email">Email</Label>
									<Input
										id="add-email"
										type="email"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										placeholder="Enter email address"
									/>
									{field.state.meta.errors.map((error) => (
										<p key={error} className="text-red-500 text-sm">
											{error}
										</p>
									))}
								</div>
							)}
						</form.Field>

						<form.Field name="bankAlias">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="add-bankAlias">Bank Alias</Label>
									<Input
										id="add-bankAlias"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										placeholder="Name used in bank transfers"
									/>
								</div>
							)}
						</form.Field>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
						>
							Cancel
						</Button>
						<form.Subscribe>
							{(state) => (
								<Button
									type="submit"
									disabled={!state.canSubmit || state.isSubmitting || isLoading}
								>
									{state.isSubmitting || isLoading
										? "Adding..."
										: "Add Housemate"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
