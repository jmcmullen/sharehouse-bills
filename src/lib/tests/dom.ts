import { JSDOM } from "jsdom";

// Gives bun:test a browser-like global scope so React Testing Library can
// render components. Import it before anything that touches the DOM.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "http://localhost",
});
for (const name of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLSelectElement",
	"Element",
	"Node",
	"NodeFilter",
	"MutationObserver",
	"CustomEvent",
	"Event",
]) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: name === "window" ? dom.window : Reflect.get(dom.window, name),
	});
}
Object.assign(globalThis, {
	getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
	IS_REACT_ACT_ENVIRONMENT: true,
});
