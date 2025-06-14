import { useEffect, useState } from "react";

export function useTheme() {
	const [theme, setTheme] = useState<"light" | "dark">("light");

	useEffect(() => {
		// Only run on client
		if (typeof window === "undefined") return;

		// Get initial theme preference
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const isDark = mediaQuery.matches;
		setTheme(isDark ? "dark" : "light");

		// Apply dark class to html element
		if (isDark) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}

		// Listen for changes to system preference
		const handleChange = (e: MediaQueryListEvent) => {
			const newTheme = e.matches ? "dark" : "light";
			setTheme(newTheme);

			// Update dark class
			if (e.matches) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
		};

		mediaQuery.addEventListener("change", handleChange);

		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, []);

	return theme;
}
