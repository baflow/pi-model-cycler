import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/* ─── Types ─── */
interface PickerModel {
	provider: string;
	id: string;
	name: string;
	reasoning: boolean;
	input: readonly string[];
	contextWindow: number;
	maxTokens: number;
	cost: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
}

interface ModelRowSection {
	kind: "section";
	label: string;
}
interface ModelRowItem {
	kind: "model";
	model: PickerModel;
}
type ModelRow = ModelRowSection | ModelRowItem;

type ModelResult = { model: PickerModel } | undefined;

/* ─── Render helpers (analogous to pi-subagents/render-helpers.ts) ─── */
function pad(s: string, len: number): string {
	const vis = visibleWidth(s);
	return s + " ".repeat(Math.max(0, len - vis));
}

function row(content: string, width: number, theme: Theme): string {
	const innerW = width - 2;
	const singleLine = content.replace(/[\r\n]+/g, " ").replace(/\t/g, "  ");
	const clipped = truncateToWidth(singleLine, innerW);
	return theme.fg("border", "│") + pad(clipped, innerW) + theme.fg("border", "│");
}

function renderHeader(text: string, width: number, theme: Theme): string {
	const innerW = width - 2;
	const padLen = Math.max(0, innerW - visibleWidth(text));
	const padLeft = Math.floor(padLen / 2);
	const padRight = padLen - padLeft;
	return (
		theme.fg("border", "╭" + "─".repeat(padLeft)) +
		theme.fg("accent", text) +
		theme.fg("border", "─".repeat(padRight) + "╮")
	);
}

function renderFooter(text: string, width: number, theme: Theme): string {
	const innerW = width - 2;
	const padLen = Math.max(0, innerW - visibleWidth(text));
	const padLeft = Math.floor(padLen / 2);
	const padRight = padLen - padLeft;
	return (
		theme.fg("border", "╰" + "─".repeat(padLeft)) +
		theme.fg("dim", text) +
		theme.fg("border", "─".repeat(padRight) + "╯")
	);
}

/* ─── Favorites persistence ─── */
function loadFavorites(extensionDir: string): Set<string> {
	const favPath = path.join(extensionDir, "favorites.json");
	try {
		if (!fs.existsSync(favPath)) return new Set();
		const content = fs.readFileSync(favPath, "utf-8");
		const parsed = JSON.parse(content);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((s): s is string => typeof s === "string"));
	} catch {
		return new Set();
	}
}

function saveFavorites(extensionDir: string, favorites: Set<string>): void {
	const favPath = path.join(extensionDir, "favorites.json");
	fs.writeFileSync(favPath, JSON.stringify([...favorites], null, 2) + "\n", "utf-8");
}

/* ─── Model Picker Component ─── */
class ModelPickerComponent implements Component {
	private readonly allModels: PickerModel[];
	private rows: ModelRow[] = [];
	private cursor = 0;
	private scrollOffset = 0;
	private readonly viewportHeight = 16;
	private readonly width = 84;
	private filterQuery = "";
	private favorites: Set<string>;
	private readonly currentModelId?: string;
	private readonly extensionDir: string;
	private tui: TUI;
	private theme: Theme;
	private done: (result: ModelResult) => void;

	constructor(
		tui: TUI,
		theme: Theme,
		done: (result: ModelResult) => void,
		models: PickerModel[],
		favorites: Set<string>,
		currentModelId: string | undefined,
		extensionDir: string,
	) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.allModels = models;
		this.favorites = favorites;
		this.currentModelId = currentModelId;
		this.extensionDir = extensionDir;
		this.rebuildRows();
		this.cursor = this.findNextModelIndex(-1, 1);
		this.ensureScrollVisible();
		this.ensureScrollVisible();
	}

	private rebuildRows(): void {
		const query = this.filterQuery.toLowerCase().trim();
		let models = this.allModels;
		if (query) {
			models = this.allModels.filter(
				(m) =>
					m.name.toLowerCase().includes(query) ||
					m.id.toLowerCase().includes(query) ||
					m.provider.toLowerCase().includes(query),
			);
		}

		const byProvider = new Map<string, PickerModel[]>();
		for (const m of models) {
			if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
			byProvider.get(m.provider)!.push(m);
		}
		const sortedProviders = [...byProvider.keys()].sort();

		this.rows = [];
		for (const provider of sortedProviders) {
			const providerModels = byProvider.get(provider)!.sort((a, b) => a.name.localeCompare(b.name));
			this.rows.push({ kind: "section", label: provider });
			for (const m of providerModels) {
				this.rows.push({ kind: "model", model: m });
			}
		}

		if (this.rows.length === 0) {
			this.cursor = 0;
			this.scrollOffset = 0;
			return;
		}
		if (!this.rows[this.cursor] || this.rows[this.cursor].kind !== "model") {
			this.cursor = this.findNextModelIndex(-1, 1);
		}
		this.ensureScrollVisible();
	}

	private findNextModelIndex(start: number, direction: 1 | -1): number {
		let i = start + direction;
		while (i >= 0 && i < this.rows.length) {
			if (this.rows[i].kind === "model") return i;
			i += direction;
		}
		if (start >= 0 && start < this.rows.length && this.rows[start].kind === "model") return start;
		for (let j = 0; j < this.rows.length; j++) {
			if (this.rows[j].kind === "model") return j;
		}
		return 0;
	}

	private ensureScrollVisible(): void {
		if (this.rows.length === 0) {
			this.scrollOffset = 0;
			return;
		}
		if (this.cursor < this.scrollOffset) {
			this.scrollOffset = this.cursor;
		} else if (this.cursor >= this.scrollOffset + this.viewportHeight) {
			this.scrollOffset = this.cursor - this.viewportHeight + 1;
		}
		const maxOffset = Math.max(0, this.rows.length - this.viewportHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxOffset));
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q")) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "return")) {
			const row = this.rows[this.cursor];
			if (row?.kind === "model") {
				this.done({ model: row.model });
			}
			return;
		}
		if (matchesKey(data, "space")) {
			const row = this.rows[this.cursor];
			if (row?.kind === "model") {
				const key = `${row.model.provider}/${row.model.id}`;
				if (this.favorites.has(key)) {
					this.favorites.delete(key);
				} else {
					this.favorites.add(key);
				}
				saveFavorites(this.extensionDir, this.favorites);
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "up")) {
			this.cursor = this.findNextModelIndex(this.cursor, -1);
			this.ensureScrollVisible();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "down")) {
			this.cursor = this.findNextModelIndex(this.cursor, 1);
			this.ensureScrollVisible();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "backspace")) {
			if (this.filterQuery.length > 0) {
				this.filterQuery = this.filterQuery.slice(0, -1);
				this.rebuildRows();
				this.tui.requestRender();
			}
			return;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.filterQuery += data;
			this.rebuildRows();
			this.tui.requestRender();
			return;
		}
	}

	render(width: number): string[] {
		const w = Math.min(width, this.width);
		const innerW = w - 2;
		const lines: string[] = [];

		lines.push(renderHeader(" Model Picker ", w, this.theme));

		// Filter row
		const cursor = this.theme.fg("accent", "│");
		const queryDisplay = this.filterQuery
			? `${this.filterQuery}${cursor}`
			: `${cursor}${this.theme.fg("dim", "type to filter...")}`;
		const searchIcon = this.theme.fg("dim", "◎");
		lines.push(row(` ${searchIcon}  ${queryDisplay}`, w, this.theme));
		lines.push(row("", w, this.theme));

		if (this.rows.length === 0) {
			lines.push(row(this.theme.fg("dim", " No models match the filter"), w, this.theme));
			for (let i = 0; i < this.viewportHeight - 1; i++) {
				lines.push(row("", w, this.theme));
			}
		} else {
			const visible = this.rows.slice(this.scrollOffset, this.scrollOffset + this.viewportHeight);
			for (let i = 0; i < visible.length; i++) {
				const rowItem = visible[i]!;
				const globalIndex = this.scrollOffset + i;

				if (rowItem.kind === "section") {
					const sectionText = `─── ${rowItem.label} ───`;
					const visW = visibleWidth(sectionText);
					const padLeft = Math.max(0, Math.floor((innerW - visW) / 2));
					const padded = " ".repeat(padLeft) + this.theme.fg("accent", sectionText);
					lines.push(row(padded, w, this.theme));
					continue;
				}

				const m = rowItem.model;
				const isCursor = globalIndex === this.cursor;
				const isCurrent = `${m.provider}/${m.id}` === this.currentModelId;
				const isFav = this.favorites.has(`${m.provider}/${m.id}`);

				const marker = isCursor ? this.theme.fg("accent", ">") : " ";
				const star = isFav ? this.theme.fg("success", "★") : " ";
				const currentMark = isCurrent ? this.theme.fg("warning", " (current)") : "";

				const idText = ` ${m.provider}/${m.id}`;
				const nameText = `${m.name}${currentMark}`;
				const maxNameWidth = Math.max(0, innerW - 4 - visibleWidth(this.theme.fg("dim", idText)));
				const truncatedName = truncateToWidth(nameText, maxNameWidth);
				const lineText = `${marker} ${star} ${truncatedName}${this.theme.fg("dim", idText)}`;

				lines.push(row(lineText, w, this.theme));
			}
			for (let i = visible.length; i < this.viewportHeight; i++) {
				lines.push(row("", w, this.theme));
			}
		}

		// Scroll info
		const above = this.scrollOffset;
		const below = Math.max(0, this.rows.length - (this.scrollOffset + this.viewportHeight));
		let scrollInfo = "";
		if (above > 0) scrollInfo += `↑ ${above} more`;
		if (below > 0) scrollInfo += `${scrollInfo ? "  " : ""}↓ ${below} more`;
		if (scrollInfo) {
			lines.push(row(this.theme.fg("dim", scrollInfo), w, this.theme));
		} else {
			lines.push(row("", w, this.theme));
		}

		const footerText = " ↑↓ = nav  Enter = pick  Space = fav  Esc = close ";
		lines.push(renderFooter(footerText, w, this.theme));
		return lines;
	}

	invalidate(): void {
		// no-op
	}

	dispose(): void {
		// no-op
	}
}

/* ─── Open picker ─── */
async function openModelPicker(pi: ExtensionAPI, ctx: ExtensionContext, extensionDir: string) {
	if (!ctx.hasUI) {
		ctx.ui.notify("Model picker requires interactive UI", "warning");
		return;
	}
	const models = ctx.modelRegistry.getAvailable() as PickerModel[];
	if (models.length === 0) {
		ctx.ui.notify("No models available", "warning");
		return;
	}
	const favorites = loadFavorites(extensionDir);
	const currentModelId = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

	const result = await ctx.ui.custom<ModelResult | undefined>(
		(tui, theme, _kb, done) =>
			new ModelPickerComponent(tui, theme, done, models, favorites, currentModelId, extensionDir),
		{ overlay: true, overlayOptions: { anchor: "center", width: 84, maxHeight: "80%" } },
	);

	if (result?.model) {
		const success = await pi.setModel(result.model);
		if (success) {
			ctx.ui.notify(`Switched to ${result.model.provider}/${result.model.id}`, "success");
		} else {
			ctx.ui.notify("Failed to switch model", "error");
		}
	}
}

/* ─── Cycle favorite models (Ctrl+Shift+L) ─── */
async function cycleFavoriteModel(pi: ExtensionAPI, ctx: ExtensionContext, extensionDir: string) {
	const favorites = loadFavorites(extensionDir);
	const available = ctx.modelRegistry.getAvailable() as PickerModel[];
	const current = ctx.model;
	const currentKey = current ? `${current.provider}/${current.id}` : undefined;

	const favModels = available.filter((m) => favorites.has(`${m.provider}/${m.id}`));
	if (favModels.length === 0) {
		ctx.ui.notify("No favorite models available", "warning");
		return;
	}

	let nextIndex = 0;
	if (currentKey) {
		const idx = favModels.findIndex((m) => `${m.provider}/${m.id}` === currentKey);
		if (idx !== -1) {
			nextIndex = (idx + 1) % favModels.length;
		}
	}
	const nextModel = favModels[nextIndex];
	const success = await pi.setModel(nextModel);
	if (success) {
		ctx.ui.notify(`Switched to ${nextModel.provider}/${nextModel.id}`, "success");
	} else {
		ctx.ui.notify(`Failed to switch to ${nextModel.provider}/${nextModel.id}`, "error");
	}
}

/* ─── Extension export ─── */
export default function (pi: ExtensionAPI) {
	const extensionDir = path.dirname(fileURLToPath(import.meta.url));

	// Ensure favorites file exists
	const favPath = path.join(extensionDir, "favorites.json");
	if (!fs.existsSync(favPath)) {
		fs.writeFileSync(favPath, "[]\n", "utf-8");
	}

	pi.registerCommand("model-picker", {
		description: "Show interactive model picker with favorites",
		handler: async (_args, ctx) => {
			await openModelPicker(pi, ctx, extensionDir);
		},
	});

	pi.registerShortcut("ctrl+alt+m", {
		handler: async (ctx) => {
			await openModelPicker(pi, ctx, extensionDir);
		},
	});

	pi.registerShortcut("ctrl+shift+l", {
		handler: async (ctx) => {
			await cycleFavoriteModel(pi, ctx, extensionDir);
		},
	});
}
