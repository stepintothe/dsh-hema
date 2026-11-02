/**
 * 何马行动板 v3 —— 浏览器半侧（手写 bundle）
 *
 * 格式与外壳的模块加载器一致：window.__ModuleLoader__.load({ id, factory })。
 * 基座外无依赖：只用平台 seed 里的 react 与 ctx.slots。
 *
 * 全功能版：概览 / 靶标 / 漏洞 / 战果 / PoC / 得分 / 会话 / 技能 / 提示词 / 人设 /
 * 智能体 / 环境 —— 数据全部由插件自带 JSON 存储层（/dsh-hema/api）支撑。
 * 布局是右侧全高抽屉 + 左侧竖排图标栏。
 */
window.__ModuleLoader__.load({ id: "dsh-hema", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	const name = "dsh-hema";

	/* 失败显形器：任何阶段炸了直接在页面顶部弹红条，别让失败无声无息 */
	function hemaFail(stage, err) {
		try { beacon("FAIL:" + stage, String((err && (err.stack || err.message)) || err)) } catch (e3) { /* ignore */ }
		try {
			window.__HEMA_ERR__ = { stage, message: String((err && (err.stack || err.message)) || err) };
			var old = document.getElementById("hema-fail-banner");
			if (old) old.remove();
			var el = document.createElement("div");
			el.id = "hema-fail-banner";
			el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fecaca;padding:10px 16px;font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap";
			el.textContent = "🐴 何马加载失败 [" + stage + "] " + String((err && err.message) || err);
			(document.body || document.documentElement).appendChild(el);
			if (window.console && console.error) console.error("[hema:" + stage + "]", err);
		} catch (e2) { /* ignore */ }
	}

	/* 回传信标：往宿主桥打点（fire-and-forget），宿主落盘 boot-beacon.log */
	function beacon(stage, detail) {
		try {
			fetch("/dsh-hema/api", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ op: "clientBoot", stage: stage, detail: detail == null ? "" : detail }),
			}).catch(function () { /* ignore */ });
		} catch (e4) { /* ignore */
		}
	}

	let react = null;
	try { react = require("react"); } catch (err) { hemaFail("require:react", err); return module.exports; }
	beacon("factory", "react ok");

	/* 开机图体检：浏览器实际拿到的 __DSH_BOOT__ 里有没有我 */
	(function bootProbe() {
		try {
			const g = window.__DSH_BOOT__;
			const entries = (g && g.entries) || [];
			const batches = (g && g.batches) || [];
			const row = entries.find((e) => e && e.id === "dsh-hema");
			const inBatch = batches.some((b) => b && Array.isArray(b.entries) && b.entries.indexOf("dsh-hema") !== -1);
			beacon("boot", "graphRev=" + (g && g.rev) + " entries=" + entries.length
				+ " hema-in-entries=" + (row ? "yes(url=" + row.url + ")" : "NO")
				+ " hema-in-batches=" + (inBatch ? "yes" : "NO")
				+ " loaderMode=" + (window.__ModuleLoader__ && window.__ModuleLoader__.mode));
		} catch (e5) { beacon("boot-probe-fail", String(e5)) }
	})();
	const h = react.createElement;
	const { useState, useEffect, useRef, useCallback } = react;

	const RT_API = "/dsh-hema/api";
	const HEMA_API = "/dsh-hema/api";

	function post(url, payload) {
		return fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload || {}),
		}).then((r) => r.json()).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
	}
	const rt = (payload) => post(RT_API, payload);
	const hm = (payload) => post(HEMA_API, payload);

	/* ── 模块级 UI 状态（面板开关/页签），hema-ui 事件总线广播 ── */
	let ui = { open: false, tab: "overview" };
	function setUI(patch) {
		ui = Object.assign({}, ui, patch);
		try { window.dispatchEvent(new CustomEvent("hema-ui", { detail: Object.assign({}, ui) })) } catch (e) { /* ignore */ }
	}

	/* ── toast ── */
	const CSS = `
.hm-wrap{position:fixed;top:0;right:0;bottom:0;z-index:70;display:flex;box-sizing:border-box;
  width:760px;max-width:96vw;background:color-mix(in srgb,#101014 94%,transparent);
  border-left:1px dashed #f59e0b66;box-shadow:-24px 0 60px #0009;color:#e8e8ea;
  font-size:13px;line-height:1.55;font-family:ui-monospace,Menlo,Consolas,monospace}
.hm-rail{width:58px;flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 0;
  border-right:1px solid #f59e0b33;background:#0c0c10;overflow:auto}
.hm-rail::-webkit-scrollbar{width:0}
.hm-rail button{width:46px;height:44px;border:1px solid transparent;background:transparent;color:#8a8a94;
  border-radius:8px;cursor:pointer;font-size:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;flex:none}
.hm-rail button:hover{background:#f59e0b14;color:#e8e8ea}
.hm-rail button.on{border-color:#f59e0b88;color:#f59e0b;background:#f59e0b1a}
.hm-rail .hm-rail-t{font-size:8.5px;letter-spacing:1px}
.hm-logo{font-size:20px;opacity:.9;margin-bottom:6px}
.hm-main{flex:1;min-width:0;display:flex;flex-direction:column}
.hm-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px dashed #f59e0b44;flex-wrap:wrap}
.hm-title{font-weight:700;font-size:14px;letter-spacing:2px;color:#f59e0b;white-space:nowrap}
.hm-sub{font-size:10px;color:#8a8a94;letter-spacing:1px}
.hm-spacer{flex:1}
.hm-btn{border:1px solid #f59e0b44;background:#f59e0b0f;color:#e8e8ea;border-radius:5px;
  padding:3px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
.hm-btn:hover{border-color:#f59e0b;background:#f59e0b1f}
.hm-btn-pri{background:#f59e0b;border-color:#f59e0b;color:#111;font-weight:700}
.hm-btn:disabled{opacity:.45;cursor:default}
.hm-body{flex:1;min-height:0;overflow:auto;padding:14px}
.hm-select{background:#17171d;border:1px solid #f59e0b44;color:#e8e8ea;border-radius:5px;padding:3px 7px;font-size:12px;font-family:inherit;max-width:200px}
.hm-select option{background:#17171d;color:#e8e8ea}
.hm-input{background:#17171d;border:1px solid #f59e0b33;color:#e8e8ea;border-radius:5px;padding:4px 8px;font-size:12px;font-family:inherit;outline:none}
.hm-input:focus{border-color:#f59e0b}
.hm-tiles{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.hm-tile{flex:1;min-width:110px;border:1px dashed #f59e0b44;border-radius:8px;padding:10px 12px;background:#141419}
.hm-tile b{display:block;font-size:22px;color:#f59e0b;font-weight:700}
.hm-tile span{font-size:11px;color:#8a8a94;letter-spacing:1px}
.hm-sec{margin-bottom:14px}
.hm-sec>h4{margin:0 0 6px;font-size:11px;color:#f59e0b;letter-spacing:2px;border-bottom:1px solid #f59e0b22;padding-bottom:4px}
.hm-row{display:flex;gap:8px;align-items:baseline;padding:5px 2px;border-bottom:1px solid #ffffff0d;font-size:12px;flex-wrap:wrap}
.hm-row b{color:#f59e0b;min-width:76px;flex:none;font-size:11px}
.hm-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;flex:none}
.hm-dot.live{background:#10b981}.hm-dot.dead{background:#5a5a66}
.hm-chip{display:inline-block;border:1px solid #f59e0b44;color:#f59e0b;background:#f59e0b0f;border-radius:4px;
  padding:0 7px;font-size:10.5px;margin-right:5px;cursor:pointer;white-space:nowrap}
.hm-chip.on{background:#f59e0b;color:#111;font-weight:700}
.hm-chip.gray{color:#8a8a94;border-color:#3a3a44;background:transparent}
.hm-crit{color:#ef4444;border-color:#ef444477;background:#ef444414}
.hm-high{color:#f97316;border-color:#f9731677;background:#f9731614}
.hm-med{color:#eab308;border-color:#eab30877;background:#eab30814}
.hm-low{color:#64748b;border-color:#64748b77}
.hm-okc{color:#10b981;border-color:#10b98166;background:#10b98114}
.hm-exp{border-top:1px dashed #f59e0b33;margin-top:4px;padding:8px 2px;font-size:11.5px;color:#b9b9c2}
.hm-msg{border:1px dashed #f59e0b55;border-radius:6px;padding:7px 10px;margin-bottom:10px;font-size:12px}
.hm-msg.err{border-color:#ef444488;color:#f3a1a1;background:#ef44440d}
.hm-msg.okm{color:#8fe0bd}
.hm-textarea{width:100%;min-height:320px;background:#0e0e13;border:1px solid #f59e0b33;color:#d9d9df;
  border-radius:6px;padding:10px;font-size:11.5px;font-family:inherit;line-height:1.6;resize:vertical;outline:none;box-sizing:border-box}
.hm-textarea:focus{border-color:#f59e0b}
.hm-pre{background:#0e0e13;border:1px solid #ffffff14;border-radius:6px;padding:10px;font-size:11.5px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto;color:#c9c9d2}
.hm-note{font-size:10.5px;color:#6a6a76;margin-top:8px;line-height:1.7}
.hm-copy{cursor:pointer;border-bottom:1px dotted #f59e0b88}
.hm-add{margin:8px 0 12px}
.hm-add-body{border:1px dashed #f59e0b44;border-radius:8px;padding:10px;margin-top:6px;display:flex;flex-direction:column;gap:8px;background:#121218}
.hm-f{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8a8a94}
.hm-f input,.hm-f textarea,.hm-f select{background:#0e0e13;border:1px solid #f59e0b33;color:#e8e8ea;border-radius:5px;
  padding:5px 8px;font-size:12px;font-family:inherit;outline:none}
.hm-f input:focus,.hm-f textarea:focus,.hm-f select:focus{border-color:#f59e0b}
.hm-icon-btn{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:inherit;cursor:pointer;
  font-family:inherit;font-size:12px;padding:4px 6px;border-radius:6px}
.hm-icon-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.hm-icon-btn.on{color:#f59e0b}
.hm-card{border:1px solid #ffffff14;border-left:3px solid #5a5a66;border-radius:8px;background:#141419;
  margin-bottom:10px;overflow:hidden}
.hm-card.sev-critical{border-left-color:#ef4444}
.hm-card.sev-high{border-left-color:#f97316}
.hm-card.sev-medium{border-left-color:#eab308}
.hm-card.sev-low{border-left-color:#64748b}
.hm-card.sev-info{border-left-color:#4b5563}
.hm-card-head{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;flex-wrap:wrap}
.hm-card-head:hover{background:#ffffff08}
.hm-card-title{flex:1;min-width:160px;font-size:12.5px;font-weight:600;color:#e8e8ea}
.hm-card-meta{display:flex;gap:14px;flex-wrap:wrap;padding:0 12px 8px;font-size:11px;color:#8a8a94}
.hm-card-meta b{color:#b9b9c2;font-weight:600}
.hm-card-body{border-top:1px dashed #f59e0b33;padding:10px 12px}
.hm-kv{display:flex;gap:8px;margin-bottom:8px;font-size:12px;flex-wrap:wrap;align-items:baseline}
.hm-kv>b{color:#f59e0b;min-width:76px;flex:none;font-size:11px}
.hm-kv>span{color:#c9c9d2;word-break:break-word;white-space:pre-wrap;flex:1;min-width:200px}
.hm-prebox{margin:6px 0 10px;border:1px solid #ffffff14;border-radius:6px;overflow:hidden}
.hm-prebox-head{display:flex;align-items:center;gap:8px;background:#0c0c10;padding:4px 10px;font-size:10.5px;
  color:#8a8a94;letter-spacing:1px;border-bottom:1px solid #ffffff10}
.hm-prebox-head b{color:#f59e0b;font-weight:600}
.hm-prebox-head .hm-copy{margin-left:auto}
.hm-prebox>pre{margin:0;padding:9px 11px;font-size:11.5px;white-space:pre-wrap;word-break:break-word;
  max-height:300px;overflow:auto;color:#c9c9d2;background:#0e0e13}
.hm-evi{border:1px dashed #ffffff20;border-radius:6px;padding:8px 10px;margin-bottom:8px}
.hm-evi-head{display:flex;gap:8px;align-items:center;font-size:11.5px;margin-bottom:4px;flex-wrap:wrap}
.hm-evi-head b{color:#f59e0b}
.hm-modal{position:fixed;inset:0;z-index:90;background:#000a;display:flex;align-items:center;justify-content:center;padding:24px}
.hm-modal-box{width:860px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;
  background:#121218;border:1px dashed #f59e0b55;border-radius:10px;box-shadow:0 18px 60px #000c}
.hm-modal-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px dashed #f59e0b44}
.hm-modal-head b{color:#f59e0b;font-size:13px;letter-spacing:1px}
.hm-modal-body{flex:1;overflow:auto;padding:12px 16px}
.hm-modal-body>pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.65;color:#d9d9df}
.hm-sec-sticky{position:sticky;top:-14px;background:color-mix(in srgb,#101014 96%,transparent);z-index:5;
  padding-top:2px;margin-bottom:8px}
.hm-sec-sticky>h4{margin:0;font-size:11px;color:#f59e0b;letter-spacing:2px;border-bottom:1px solid #f59e0b22;padding:6px 0 4px}
.hm-body::-webkit-scrollbar{width:9px}
.hm-body::-webkit-scrollbar-thumb{background:#f59e0b33;border-radius:5px}
.hm-body::-webkit-scrollbar-track{background:transparent}
`;

	function toast(text, kind) {
		try { window.dispatchEvent(new CustomEvent("hema-toast", { detail: { text, kind: kind || "okm" } })) } catch (e) { /* ignore */ }
	}
	function Toast() {
		const [item, setItem] = useState(null);
		useEffect(() => {
			const on = (e) => {
				setItem(e.detail);
				setTimeout(() => setItem(null), 2600);
			};
			window.addEventListener("hema-toast", on);
			return () => window.removeEventListener("hema-toast", on);
		}, []);
		if (!item) return null;
		return h("div", {
			style: { position: "fixed", right: 18, bottom: 18, zIndex: 99, padding: "8px 14px", borderRadius: 8,
				fontSize: 12, maxWidth: 420, border: "1px solid " + (item.kind === "err" ? "#ef4444" : "#f59e0b"),
				background: item.kind === "err" ? "#2a1414" : "#241d0e", color: item.kind === "err" ? "#f3a1a1" : "#f59e0b" },
		}, item.text);
	}

	/* ── 共享 UI 原子 ── */
	function Msg(props) { return props.text ? h("div", { className: "hm-msg " + (props.kind === "err" ? "err" : "okm") }, props.text) : null }
	function SevTag(props) {
		const s = String(props.s || "").toLowerCase();
		const cls = s === "critical" ? "hm-chip crit" : s === "high" ? "hm-chip high" : s === "medium" ? "hm-chip med" : "hm-chip low";
		const label = { critical: "严重", high: "高危", medium: "中危", low: "低危", info: "信息" }[s] || (s || "—");
		return h("span", { className: cls }, label);
	}
	function Copyable(props) {
		const [done, setDone] = useState(false);
		const text = String(props.value == null ? "" : props.value);
		return h("span", { className: "hm-copy", title: "点击复制", onClick: (e) => {
			e.stopPropagation();
			try { navigator.clipboard.writeText(text) } catch (e2) { /* ignore */ }
			setDone(true); setTimeout(() => setDone(false), 900);
		} }, done ? "✓已复制" : text || "—");
	}
	/** 折叠的行内新增表单。fields: [{k,label,ph,type,options,rows}] */
	function AddForm(props) {
		const [open, setOpen] = useState(false);
		const [vals, setVals] = useState({});
		const [busy, setBusy] = useState(false);
		const submit = () => {
			setBusy(true);
			Promise.resolve(props.onSubmit(Object.assign({}, vals))).then((r) => {
				setBusy(false);
				if (r && r.ok !== false) { toast("已添加"); setVals({}); setOpen(false); }
				else toast((r && r.error) || "添加失败", "err");
			});
		};
		return h("div", { className: "hm-add" },
			h("span", { className: "hm-chip", onClick: () => setOpen(!open) }, open ? "× 收起" : "+ 添加"),
			open ? h("div", { className: "hm-add-body" },
				props.fields.map((f) => f.options
					? h("label", { key: f.k, className: "hm-f" }, h("span", null, f.label),
						h("select", { value: vals[f.k] || (f.options[0] && f.options[0].v) || "", onChange: (e) => setVals((v) => ({ ...v, [f.k]: e.target.value })) },
							f.options.map((o) => h("option", { key: o.v, value: o.v }, o.t))))
					: f.rows
						? h("label", { key: f.k, className: "hm-f" }, h("span", null, f.label),
							h("textarea", { rows: f.rows, value: vals[f.k] || "", placeholder: f.ph || "", onChange: (e) => setVals((v) => ({ ...v, [f.k]: e.target.value })) }))
						: h("label", { key: f.k, className: "hm-f" }, h("span", null, f.label),
							h("input", { value: vals[f.k] || "", placeholder: f.ph || "", onChange: (e) => setVals((v) => ({ ...v, [f.k]: e.target.value })) }))),
				h("div", null, h("button", { className: "hm-btn hm-btn-pri", onClick: submit, disabled: busy }, busy ? "提交中…" : "提交"))) : null);
	}
	function usePersist(key, initial) {
		const [v, setV] = useState(() => {
			try { const raw = window.localStorage.getItem("hema." + key); return raw === null ? initial : JSON.parse(raw) } catch { return initial }
		});
		const set = useCallback((nv) => {
			setV(nv);
			try { window.localStorage.setItem("hema." + key, JSON.stringify(nv)) } catch { /* ignore */ }
		}, [key]);
		return [v, set];
	}

	/* ── 概览 ── */
	function Overview(props) {
		const eng = props.eng;
		const [snap, setSnap] = useState(null);
		const [digest, setDigest] = useState(null);
		const [err, setErr] = useState(null);
		const load = () => {
			if (!eng) { setSnap(null); return }
			rt({ op: "snapshot", engagement: eng }).then((r) => {
				if (r && r.ok !== false) { setSnap(r); setErr(null); } else setErr((r && r.error) || "快照读取失败");
			});
			rt({ op: "consoleDigest", engagement: eng }).then((r) => { if (r && r.ok !== false) setDigest(r) });
		};
		useEffect(() => { load(); }, [eng]);
		const st = (snap && snap.stats) || {};
		const ts = (snap && snap.tests) || {};
		const segments = (snap && snap.segments) || [];
		const tiles = [
			["资产", st.assets], ["存活", st.liveAssets], ["开放端口", st.openPorts], ["服务", st.services],
			["漏洞", st.vulns], ["凭证", st.credentials], ["权限", st.accesses], ["网段", st.segments],
		];
		const TSTAT = [["untested", "未测"], ["testing", "在测"], ["tested", "已测"], ["blocked", "被封"], ["abandoned", "放弃"], ["no_surface", "无面"]];
		return h("div", null,
			h(Msg, { kind: "err", text: err }),
			!snap && !err && eng ? h("div", { className: "hm-note" }, "读取行动快照…") : null,
			!eng ? h("div", { className: "hm-note" }, "没有行动。在上方输入名称新建一个（即红队的 engagement）。") : null,
			tiles.length ? h("div", { className: "hm-tiles" }, tiles.map(([t, v], i) => h("div", { key: i, className: "hm-tile" }, h("b", null, String(v == null ? 0 : v)), h("span", null, t)))) : null,
			h("div", { className: "hm-sec" },
				h("h4", null, "测试状态"),
				TSTAT.map(([k, label]) => h("span", { key: k, className: "hm-chip gray", style: { marginRight: 6 } }, label + " " + (ts[k] || 0)))),
			segments.length ? h("div", { className: "hm-sec" },
				h("h4", null, "网段"),
				segments.slice(0, 12).map((sg, i) => h("div", { key: i, className: "hm-row" },
					h("b", null, sg.cidr),
					h("span", null, "资产 " + sg.assets + " · 存活 " + sg.live + " · 端口 " + sg.open_ports + (sg.country ? " · " + sg.country : "") + (sg.scope === "internal" ? " · 内网" : ""))))) : null,
			digest && digest.sections ? h("div", { className: "hm-sec" },
				h("h4", null, "各区最新"),
				Object.entries(digest.sections).map(([k, v]) => h("div", { key: k, className: "hm-row" },
					h("b", null, k), h("span", null, String(v.count || 0) + " 条" + (v.at ? " · " + String(v.at).slice(0, 16).replace("T", " ") : ""))))) : null);
	}

	/* ── 靶标 ── */
	const TSTATUS = ["untested", "testing", "tested", "blocked", "abandoned", "no_surface"];
	const TSTATUS_LABEL = { untested: "未测", testing: "在测", tested: "已测", blocked: "被封", abandoned: "放弃", no_surface: "无面" };
	function Targets(props) {
		const eng = props.eng;
		const [view, setView] = usePersist("targets.view", "list");
		const [q, setQ] = usePersist("targets.q", "");
		const [state, setState] = useState({ items: [], loading: false, error: null });
		const [openId, setOpenId] = useState(null);
		const [detail, setDetail] = useState(null);
		const timer = useRef(null);
		const load = (qq) => {
			if (!eng) return;
			setState((s) => ({ ...s, loading: true }));
			const op = view === "domains" ? "domains" : view === "web" ? "web" : view === "http" ? "httpEvidence" : "assets";
			rt({ op, engagement: eng, q: (qq == null ? q : qq) || undefined }).then((r) => {
				setState({ items: (r && r.items) || [], loading: false, error: (r && r.ok === false) ? (r.error || "读取失败") : null });
			});
		};
		useEffect(() => { load(); }, [eng, view]);
		const onSearch = (v) => {
			setQ(v);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => load(v), 400);
		};
		const openAsset = (it) => {
			if (openId === it.id) { setOpenId(null); setDetail(null); return }
			setOpenId(it.id); setDetail(null);
			rt({ op: "asset", engagement: eng, id: it.id }).then((r) => { if (r && r.asset) setDetail(r.asset) });
		};
		const cycleTest = (it) => {
			const idx = TSTATUS.indexOf(it.test_status || "untested");
			const next = TSTATUS[(idx + 1) % TSTATUS.length];
			rt({ op: "assetTest", engagement: eng, test: { asset_id: it.id, status: next } }).then((r) => {
				if (r && r.ok !== false) { toast(it.ip + " → " + TSTATUS_LABEL[next]); load(); }
				else toast((r && r.error) || "标记失败", "err");
			});
		};
		const items = state.items || [];
		return h("div", null,
			h("div", { style: { display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" } },
				[["list", "资产"], ["domains", "域名"], ["web", "Web"], ["http", "HTTP证据"]].map(([v, label]) =>
					h("span", { key: v, className: "hm-chip" + (view === v ? " on" : " gray"), onClick: () => setView(v) }, label)),
				h("input", { className: "hm-input", style: { flex: 1, minWidth: 120 }, value: q, placeholder: "过滤（防抖自动搜）…", onChange: (e) => onSearch(e.target.value) }),
				h("button", { className: "hm-btn", onClick: () => load(), disabled: state.loading }, state.loading ? "…" : "刷")),
			h(Msg, { kind: "err", text: state.error }),
			!eng ? h("div", { className: "hm-note" }, "先在顶部选行动。") : null,
			view === "list" && items.map((it) => h("div", { key: it.id, className: "hm-sec" },
				h("div", { className: "hm-row", style: { cursor: "pointer" }, onClick: () => openAsset(it) },
					h("span", { className: "hm-dot " + (it.state === "live" ? "live" : "dead") }),
					h("b", null, it.ip),
					h("span", null, (it.scope === "internal" ? "内" : "外") + " · " + (it.priority || "?")),
					h("span", { className: "hm-chip " + ((it.test_status || "untested") === "blocked" ? "crit" : "gray"),
						style: { marginLeft: "auto" }, onClick: (e) => { e.stopPropagation(); cycleTest(it) }, title: "点击切换测试状态" },
						TSTATUS_LABEL[it.test_status || "untested"] + (it.blocked_count ? "(封" + it.blocked_count + ")" : ""))),
				openId === it.id ? h("div", { className: "hm-exp" },
					!detail ? "载入详情…" : h("div", null,
						((detail.ports) || []).filter((p) => p.state === "open").map((p, i) => h("div", { key: i, className: "hm-row" },
							h("b", null, String(p.port) + "/" + (p.proto || "tcp")),
							h("span", null, [p.service, p.product, p.version].filter(Boolean).join(" ") || "未知",
								p.url ? " · " : null,
								p.url ? h("a", { href: p.url, target: "_blank", rel: "noreferrer", style: { color: "#f59e0b" } }, p.title || p.url) : null))),
						((detail.fingerprints) || []).map((f, i) => h("div", { key: "f" + i, className: "hm-row" },
							h("b", null, "指纹"), h("span", null, [f.category, f.vendor, f.product, f.version].filter(Boolean).join(" ")))),
						((detail.observations) || []).slice(0, 8).map((o, i) => h("div", { key: "o" + i, className: "hm-row" },
							h("b", null, o.attr || "观测"), h("span", null, (o.value || "") + " · " + (o.tool || "?")))),
						detail.test_notes ? h("div", { className: "hm-row" }, h("b", null, "笔记"), h("span", null, String(detail.test_notes).slice(0, 500))) : null)) : null)),
			view !== "list" && items.map((it, i) => h("div", { key: i, className: "hm-row" },
				h("b", null, String(it.host || it.domain || it.url || it.ip || it.name || "—")),
				h("span", null, [it.title, it.service, it.status, it.note, it.method].filter(Boolean).join(" · ")),
				it.url ? h("a", { href: it.url, target: "_blank", rel: "noreferrer", style: { color: "#f59e0b", marginLeft: 4 } }, "↗") : null)),
			eng && items.length === 0 && !state.loading ? h("div", { className: "hm-note" }, "没有记录。资产由测试/扫描工具写入。") : null);
	}

	/* ── 报告与详情共享工具 ── */
	function sevLabel(s) {
		return { critical: "严重", high: "高危", medium: "中危", low: "低危", info: "信息" }[String(s || "").toLowerCase()] || (s || "—");
	}
	function downloadText(name, text) {
		try {
			const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = name;
			document.body.appendChild(a);
			a.click();
			setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { /* ignore */ } }, 800);
			toast("已下载 " + name);
		} catch (e) { toast("下载失败: " + (e && e.message), "err"); }
	}
	/** 带 CopyBar 的 pre 块 */
	function PreBox(props) {
		const [done, setDone] = useState(false);
		const text = String(props.text == null ? "" : props.text);
		return h("div", { className: "hm-prebox" },
			h("div", { className: "hm-prebox-head" },
				h("b", null, props.label || "内容"),
				props.extra || null,
				h("span", { className: "hm-copy", onClick: (e) => {
					e.stopPropagation();
					try { navigator.clipboard.writeText(text) } catch (e2) { /* ignore */ }
					setDone(true); setTimeout(() => setDone(false), 900);
				} }, done ? "✓已复制" : "复制")),
			h("pre", null, text || "—"));
	}
	/** Markdown 报告弹层：预览 + 复制 + 下载（hook 必须在早退之前，否则 React #310） */
	function ReportModal(props) {
		const [done, setDone] = useState(false);
		if (!props.open) return null;
		const text = String(props.text || "");
		return h("div", { className: "hm-modal", onClick: props.onClose },
			h("div", { className: "hm-modal-box", onClick: (e) => e.stopPropagation() },
				h("div", { className: "hm-modal-head" },
					h("b", null, props.title || "报告预览"),
					h("span", { className: "hm-note", style: { marginTop: 0, flex: 1 } }, (text.length / 1000).toFixed(1) + "k 字符"),
					h("button", { className: "hm-btn", onClick: () => {
						try { navigator.clipboard.writeText(text) } catch (e) { /* ignore */ }
						setDone(true); setTimeout(() => setDone(false), 900);
					} }, done ? "✓已复制" : "复制全文"),
					h("button", { className: "hm-btn hm-btn-pri", onClick: () => downloadText(props.filename || "report.md", text) }, "下载 .md"),
					h("button", { className: "hm-btn", onClick: props.onClose }, "✕")),
				h("div", { className: "hm-modal-body" }, h("pre", null, text))));
	}
	/** 按漏洞特征生成利用方法要点（本地模板，可直接当 checklist） */
	function exploitNotesOf(v) {
		const t = String((v.title || "") + " " + (v.cve || "") + " " + (v.source || ""));
		let lines;
		if (/SQL|sql注入|sqlmap/i.test(t)) lines = [
			"1. 定位注入点参数，手工加 ' 比对报错/布尔差异确认可注",
			"2. sqlmap -u \"URL\" --batch --level 3 --risk 2 --random-agent（过 WAF 加 --tamper=space2comment）",
			"3. --dbs --tables 摸库，--dump 拉关键表，注意控制速率",
			"4. 拿到的数据/凭证回填到「战果」页",
		];
		else if (/RCE|命令注入|command|代码执行/i.test(t)) lines = [
			"1. 探测注入语义：;id |id `id` $(id) 逐一试回显",
			"2. 无回显走外带：DNS/HTTP Log（OAST 域名）确认执行",
			"3. 升级为稳定 webshell，落点记入「落file」",
			"4. 第一时间记录获得的身份/权限到「权限」",
		];
		else if (/弱口令|口令|凭证|credential|登录|爆破/i.test(t)) lines = [
			"1. 用户名字典 + 定向弱口令字典（管理后台/中间件默认口令优先）",
			"2. 限速爆破防封禁，命中后立刻登录验证真实权限",
			"3. 凭证录入「凭证」页（含 hash 原文可复用性）",
		];
		else if (/上传|upload|webshell/i.test(t)) lines = [
			"1. 绕过姿势清单：双扩展名 / Content-Type / 大小写 / 图片马 / .htaccess",
			"2. 上传后验证解析（访问返回 webshell 特征）",
			"3. 连通后录入「Webshell」，连通性用「会话」页探测",
		];
		else if (/反序列|deserial|gadget/i.test(t)) lines = [
			"1. 指纹确认组件与精确版本（影响 gadget 链选择）",
			"2. 用对应 gadget 生成 payload，先 DNS 外带证真",
			"3. 证真后再升级 RCE，全程留原始请求为证",
		];
		else if (/未授权|越权|IDOR|auth|权限/i.test(t)) lines = [
			"1. 无凭证直连接口/页面，与带凭证响应比对 200/403 差异",
			"2. 替换/去掉身份参数（user_id/token）横向遍历",
			"3. 越权拉取的数据截图/存证，敏感样本记入证据",
		];
		else if (/ SSRF|ssrf|请求伪造/i.test(t)) lines = [
			"1. 参数替换 url=http://127.0.0.1:PORT 与 file:///etc/passwd 证真",
			"2. gopher 扩展打内网（redis/mysql）",
			"3. 云上环境试 metadata 端点，命中即高危",
		];
		else if (/XSS|xss|跨站/i.test(t)) lines = [
			"1. 反射点先 <script>alert(1)</script>，被过滤换 img/svg 事件",
			"2. 编码绕过：大小写/双写/HTML实体/unicode",
			"3. 存储点确认触发范围（谁看谁中），评估危害等级",
		];
		else lines = [
			"1. 按 CVE/组件名在「PoC」页直接搜索公开利用代码" + (v.cve ? "（搜 " + v.cve + "）" : ""),
			"2. 构造最小验证请求先证真，再谈利用",
			"3. 证真后把原始请求/响应存为 HTTP 证据，供复现报告引用",
		];
		return lines.join("\n");
	}
	/** 单漏洞 → Markdown 复现报告 */
	function buildVulnReport(v) {
		const L = [];
		L.push("# 漏洞复现报告：" + (v.title || "未命名漏洞"));
		L.push("");
		L.push("| 项目 | 内容 |");
		L.push("| --- | --- |");
		L.push("| 目标 | " + (v.target || v.asset_ip || "—") + " |");
		if (v.asset_ip) L.push("| 资产 | " + v.asset_ip + (v.segment_cidr ? "（" + v.segment_cidr + "）" : "") + " |");
		L.push("| 等级 | " + sevLabel(v.severity) + " |");
		L.push("| 状态 | " + (VSTATUS_LABEL[v.status] || v.status || "—") + " |");
		if (v.cve) L.push("| CVE | " + v.cve + " |");
		if (v.confidence) L.push("| 置信度 | " + v.confidence + " |");
		if (v.source) L.push("| 来源 | " + v.source + " |");
		L.push("| 发现时间 | " + String(v.found_at || "—").replace("T", " ").slice(0, 19) + " |");
		if (v.found_by_agent || v.agent) L.push("| 发现者 | " + (v.found_by_agent || v.agent) + " |");
		L.push("");
		L.push("## 漏洞描述 / 证据");
		L.push("");
		L.push(v.evidence || "（待补充）");
		L.push("");
		L.push("## 利用方法");
		L.push("");
		L.push("```text");
		L.push(exploitNotesOf(v));
		L.push("```");
		if ((v.http_evidence || []).length) {
			L.push("");
			L.push("## 复现流量");
			for (const e of v.http_evidence) {
				L.push("");
				L.push("### " + (e.label || ((e.method || "GET") + " " + (e.url || ""))));
				L.push("");
				L.push("- 请求：`" + (e.method || "GET") + " " + (e.url || "") + "`" + (e.status ? " → HTTP " + e.status : ""));
				if (e.note) L.push("- 备注：" + e.note);
				if (e.request) { L.push(""); L.push("**原始请求**"); L.push(""); L.push("```http"); L.push(e.request); L.push("```"); }
				if (e.response) { L.push(""); L.push("**原始响应**（截断展示）"); L.push(""); L.push("```"); L.push(String(e.response).slice(0, 4000)); L.push("```"); }
			}
		}
		if (v.gained) { L.push(""); L.push("## 战果"); L.push(""); L.push(v.gained); }
		L.push("");
		L.push("---");
		L.push("*由大案组·何马行动板生成*");
		return L.join("\n");
	}

	/* ── 漏洞 ── */
	const VSEV = [["critical", "严重"], ["high", "高危"], ["medium", "中危"], ["low", "低危"], ["info", "信息"]];
	const VSTATUS_ORDER = ["candidate", "confirmed", "exploited", "fixed", "false_positive"];
	const VSTATUS_LABEL = { candidate: "候选", confirmed: "已确认", exploited: "已利用", fixed: "已修复", false_positive: "误报" };
	function Vulns(props) {
		const eng = props.eng;
		const [sev, setSev] = usePersist("vulns.sev", "");
		const [state, setState] = useState({ items: [], stats: null, error: null });
		const [openId, setOpenId] = usePersist("vulns.open", null);
		const [report, setReport] = useState(null);
		const [edit, setEdit] = useState(null);
		const [editVal, setEditVal] = useState("");
		const load = () => {
			if (!eng) return;
			rt({ op: "vulns", engagement: eng, severity: sev || undefined }).then((r) => {
				setState({ items: (r && r.items) || [], stats: (r && r.stats) || null, error: (r && r.ok === false) ? r.error : null });
			});
		};
		useEffect(() => { load(); }, [eng, sev]);
		const patch = (v, p, okText) => {
			rt({ op: "updateVuln", engagement: eng, id: v.id, patch: p }).then((r) => {
				if (r && r.ok !== false) { toast(okText || "已更新"); setEdit(null); load(); }
				else toast((r && r.error) || "更新失败", "err");
			});
		};
		const cycle = (v) => {
			const idx = VSTATUS_ORDER.indexOf(v.status);
			const next = VSTATUS_ORDER[(idx + 1) % VSTATUS_ORDER.length];
			patch(v, { status: next }, "状态 → " + VSTATUS_LABEL[next]);
		};
		const startEdit = (v, field) => {
			setEdit({ id: v.id, field });
			setEditVal(String(v[field] || ""));
		};
		const saveEdit = (v) => {
			if (!edit) return;
			const p = {};
			p[edit.field] = editVal;
			patch(v, p, "已保存" + (edit.field === "evidence" ? "描述/证据" : "战果"));
		};
		const stats = state.stats || {};
		const bySev = stats.bySeverity || {};
		const byStatus = stats.byStatus || {};
		const editorFor = (v, field, label) => edit && edit.id === v.id && edit.field === field
			? h("div", { style: { margin: "6px 0 10px" } },
				h("textarea", { className: "hm-textarea", style: { minHeight: 110 }, value: editVal, spellCheck: false,
					onChange: (e) => setEditVal(e.target.value) }),
				h("div", { style: { display: "flex", gap: 6, marginTop: 6 } },
					h("button", { className: "hm-btn hm-btn-pri", onClick: () => saveEdit(v) }, "保存"),
					h("button", { className: "hm-btn", onClick: () => setEdit(null) }, "取消")))
			: null;
		const items = state.items || [];
		return h("div", null,
			h("div", { className: "hm-sec-sticky" }, h("h4", null,
				"漏洞 " + items.length + " · 确认 " + (byStatus.confirmed || 0) + " · 已利用 " + (byStatus.exploited || 0)
				+ " · 有战果 " + (stats.withGained || 0) + " · 目标组 " + (stats.targetGroups || 0))),
			h("div", { style: { marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 4 } },
				h("span", { className: "hm-chip" + (sev === "" ? " on" : " gray"), onClick: () => setSev("") }, "全部 " + items.length),
				VSEV.map(([v, label]) => h("span", { key: v, className: "hm-chip" + (sev === v ? " on" : " gray"),
					title: String(bySev[v] || 0) + " 条", onClick: () => setSev(v) }, label + " " + (bySev[v] || 0)))),
			h(AddForm, {
				fields: [
					{ k: "target", label: "目标", ph: "TARGET / IP / URL" },
					{ k: "title", label: "标题", ph: "漏洞名称" },
					{ k: "severity", label: "等级", options: VSEV.map(([v2, t]) => ({ v: v2, t })) },
					{ k: "cve", label: "CVE", ph: "CVE-2024-XXXX（可空）" },
					{ k: "evidence", label: "描述/证据", rows: 3, ph: "漏洞成因、验证要点（可空）" },
					{ k: "gained", label: "战果", ph: "拿到什么（可空）" },
					{ k: "confidence", label: "置信度", options: [{ v: "confirmed", t: "confirmed 已证真" }, { v: "likely", t: "likely 很可能" }, { v: "possible", t: "possible 可能" }, { v: "false_positive", t: "false_positive 误报" }] },
				],
				onSubmit: (vals) => rt({ op: "addVuln", engagement: eng, vuln: { ...vals, status: "confirmed" } }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}),
			h(Msg, { kind: "err", text: state.error }),
			!eng ? h("div", { className: "hm-note" }, "先在顶部选行动。") : null,
			items.map((v) => {
				const open = openId === v.id;
				return h("div", { key: v.id, className: "hm-card sev-" + (v.severity || "info") },
					h("div", { className: "hm-card-head", onClick: () => setOpenId(open ? null : v.id) },
						h(SevTag, { s: v.severity }),
						h("span", { className: "hm-card-title" }, (v.cve ? "[" + v.cve + "] " : "") + (v.title || "未命名漏洞")),
						h("span", { className: "hm-chip " + (v.status === "exploited" ? "okc" : "gray"), onClick: (e) => { e.stopPropagation(); cycle(v) }, title: "点击切换状态" }, VSTATUS_LABEL[v.status] || v.status || "—")),
					h("div", { className: "hm-card-meta" },
						h("span", null, "目标 ", h("b", null, v.target || v.asset_ip || "—")),
						(v.asset_ip && v.target !== v.asset_ip) ? h("span", null, "资产 ", h("b", null, v.asset_ip + (v.segment_cidr ? " · " + v.segment_cidr : ""))) : null,
						v.found_at ? h("span", null, h("b", null, String(v.found_at).replace("T", " ").slice(0, 16))) : null,
						(v.http_evidence || []).length ? h("span", null, "流量 ", h("b", null, String(v.http_evidence.length))) : null,
						v.gained ? h("span", { className: "hm-okc" }, "✔ " + v.gained) : null),
					open ? h("div", { className: "hm-card-body" },
						h("div", { className: "hm-kv" },
							h("b", null, "置信度"), h("span", null, v.confidence || "—"),
							h("b", null, "来源"), h("span", null, v.source || "—"),
							h("b", null, "发现者"), h("span", null, v.found_by_agent || v.agent || "—")),
						h("div", { className: "hm-kv" }, h("b", null, "描述/证据"),
							h("span", { className: "hm-copy", style: { marginLeft: 0 }, onClick: (e) => { e.stopPropagation(); startEdit(v, "evidence") } }, "✎ 编辑")),
						editorFor(v, "evidence"),
						(!edit || edit.id !== v.id || edit.field !== "evidence") ? h(PreBox, { label: "漏洞描述 / 证据", text: v.evidence || "（待补充——点上面 ✎ 编辑填写）" }) : null,
						h(PreBox, { label: "利用方法（按特征生成）", text: exploitNotesOf(v) }),
						((v.http_evidence) || []).length ? h("div", { className: "hm-kv" }, h("b", null, "复现流量")) : null,
						((v.http_evidence) || []).map((e, i) => h("div", { key: e.id || i, className: "hm-evi" },
							h("div", { className: "hm-evi-head" },
								h("b", null, e.label || ("证据 #" + (e.id || i + 1))),
								h("span", null, (e.method || "GET") + " " + (e.url || "")),
								e.status ? h("span", { className: "hm-chip gray" }, "HTTP " + e.status) : null),
							e.note ? h("div", { className: "hm-kv" }, h("b", null, "备注"), h("span", null, e.note)) : null,
							e.request ? h(PreBox, { label: "原始请求", text: e.request }) : null,
							e.response ? h(PreBox, { label: "原始响应", text: String(e.response).slice(0, 8000) }) : null)),
						h("div", { className: "hm-kv" }, h("b", null, "战果"),
							h("span", { className: "hm-copy", style: { marginLeft: 0 }, onClick: (e) => { e.stopPropagation(); startEdit(v, "gained") } }, "✎ 编辑")),
						editorFor(v, "gained"),
						(!edit || edit.id !== v.id || edit.field !== "gained") ? (v.gained
							? h(PreBox, { label: "已获战果", text: v.gained })
							: h("div", { className: "hm-note", style: { marginTop: 0 } }, "尚无战果记录。")) : null,
						h("div", { style: { display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" } },
							h("button", { className: "hm-btn hm-btn-pri", onClick: () => setReport({
								title: "复现报告 — " + (v.title || ("漏洞 #" + v.id)),
								text: buildVulnReport(v),
								filename: "vuln-report-" + (v.cve ? v.cve.toLowerCase() : "id" + v.id) + ".md",
							}) }, "生成复现报告"),
							h("span", { className: "hm-note", style: { marginTop: 0 } }, "Markdown 全文：描述 + 利用方法 + 复现流量 + 战果，可复制可下载"))) : null);
			}),
			eng && items.length === 0 ? h("div", { className: "hm-note" }, "没有漏洞记录。用上方表单登记，或让测试智能体回填。") : null,
			h(ReportModal, {
				open: !!report, title: report && report.title, text: report && report.text,
				filename: report && report.filename, onClose: () => setReport(null),
			}));
	}

	/* ── 战果（凭证/权限/Webshell/隧道/落file）── */
	function Loot(props) {
		const eng = props.eng;
		const [sub, setSub] = usePersist("loot.sub", "creds");
		const [data, setData] = useState({});
		const [detail, setDetail] = useState(null);
		const load = () => {
			if (!eng) return;
			const ops = { creds: "credentials", access: "access", shells: "webshells", tunnels: "tunnels", files: "attackFiles" };
			rt({ op: ops[sub], engagement: eng }).then((r) => {
				const items = (r && r.items) || [];
				setData((d) => ({ ...d, [sub]: items, tree: sub === "files" ? items : d.tree }));
			});
		};
		useEffect(() => { load(); }, [eng, sub]);
		const read = (id) => {
			rt({ op: "readAttackFile", engagement: eng, id }).then((r) => { if (r && r.ok !== false) setDetail(r.file || r) });
		};
		const cycle = (op, it, statuses) => {
			const idx = statuses.indexOf(it.status);
			const next = statuses[(idx + 1) % statuses.length];
			rt({ op, engagement: eng, id: it.id, patch: { status: next } }).then((r) => {
				if (r && r.ok !== false) { toast("状态 → " + next); load(); } else toast((r && r.error) || "更新失败", "err");
			});
		};
		const S3 = ["active", "dead", "unknown"];
		const S3L = { active: "存活", dead: "失活", unknown: "未知" };
		const rows = data[sub] || [];
		return h("div", null,
			h("div", { style: { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" } },
				[["creds", "凭证"], ["access", "权限"], ["shells", "Webshell"], ["tunnels", "隧道"], ["files", "落file"]].map(([v, label]) =>
					h("span", { key: v, className: "hm-chip" + (sub === v ? " on" : " gray"), onClick: () => setSub(v) }, label))),
			!eng ? h("div", { className: "hm-note" }, "先在顶部选行动。") : null,
			sub === "creds" ? h(AddForm, {
				fields: [
					{ k: "target", label: "目标", ph: "TARGET" }, { k: "username", label: "账号", ph: "user" },
					{ k: "password", label: "口令", ph: "pass" }, { k: "hash", label: "哈希", ph: "可空" },
					{ k: "note", label: "备注", ph: "可空" },
				],
				onSubmit: (vals) => rt({ op: "addCredential", engagement: eng, credential: vals }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}) : null,
			sub === "access" ? h(AddForm, {
				fields: [
					{ k: "target", label: "目标", ph: "TARGET" }, { k: "kind", label: "类型", ph: "shell / rdp / ssh…" },
					{ k: "user", label: "身份", ph: "who" }, { k: "note", label: "备注", ph: "可空" },
				],
				onSubmit: (vals) => rt({ op: "addAccess", engagement: eng, access: vals }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}) : null,
			sub === "shells" ? h(AddForm, {
				fields: [
					{ k: "target", label: "目标", ph: "TARGET" }, { k: "url", label: "URL", ph: "http://TARGET/x.php" },
					{ k: "kind", label: "类型", ph: "哥斯拉 / 冰蝎 / 蚁剑…" }, { k: "note", label: "备注", ph: "可空" },
				],
				onSubmit: (vals) => rt({ op: "addWebshell", engagement: eng, webshell: { ...vals, status: "active" } }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}) : null,
			sub === "tunnels" ? h(AddForm, {
				fields: [
					{ k: "target", label: "目标", ph: "TARGET" }, { k: "kind", label: "类型", ph: "suo5 / frp / ssh-L…" },
					{ k: "note", label: "备注", ph: "可空" },
				],
				onSubmit: (vals) => rt({ op: "addTunnel", engagement: eng, tunnel: { ...vals, status: "active" } }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}) : null,
			sub === "files" ? h(AddForm, {
				fields: [
					{ k: "target", label: "目标", ph: "TARGET" }, { k: "path", label: "路径", ph: "/var/www/x.php" },
					{ k: "kind", label: "类型", ph: "webshell / 工具 / 数据" }, { k: "note", label: "备注", ph: "可空" },
				],
				onSubmit: (vals) => rt({ op: "addAttackFile", engagement: eng, file: vals }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}) : null,
			rows.map((it, i) => h("div", { key: it.id || i, className: "hm-sec" },
				h("div", { className: "hm-row" },
					h("b", null, it.target || it.host || it.ip || "—"),
					h("span", { style: { flex: 1 } }, [it.username, it.kind, it.user, it.path, it.url].filter(Boolean).join(" · "),
						it.password ? h("span", { style: { marginLeft: 6 } }, "口令: ", h(Copyable, { value: it.password })) : null,
						it.hash ? h("span", { style: { marginLeft: 6 } }, h(Copyable, { value: it.hash })) : null),
					(sub === "shells" || sub === "tunnels") ? h("span", { className: "hm-chip " + (it.status === "active" ? "okc" : "gray"),
						style: { marginLeft: "auto" }, onClick: () => cycle(sub === "shells" ? "updateWebshell" : "updateTunnel", it, S3), title: "点击切换" },
						S3L[it.status] || it.status || "—") : null),
				it.note ? h("div", { className: "hm-row" }, h("b", null, "备注"), h("span", null, it.note)) : null,
				sub === "files" ? h("span", { className: "hm-chip gray", onClick: () => read(it.id) }, "看内容") : null)),
			detail ? h("div", { className: "hm-pre", style: { marginTop: 8 } }, String(detail.content || detail.body || JSON.stringify(detail, null, 2)).slice(0, 4000)) : null,
			eng && rows.length === 0 ? h("div", { className: "hm-note" }, "没有记录。") : null);
	}

	/* ── PoC ── */
	function Pocs() {
		const [q, setQ] = usePersist("poc.q", "");
		const [state, setState] = useState({ items: [], stats: null });
		const [detail, setDetail] = useState(null);
		const timer = useRef(null);
		const load = (qq) => {
			rt({ op: "pocSearch", q: (qq == null ? q : qq) || undefined, limit: 60 }).then((r) => {
				setState({ items: (r && r.items) || [], stats: (r && r.stats) || null, error: (r && r.ok === false) ? r.error : null });
			});
		};
		useEffect(() => { load(); }, []);
		const onSearch = (v) => {
			setQ(v);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => load(v), 400);
		};
		const open = (it) => {
			rt({ op: "pocGet", id: it.id }).then((r) => { if (r && r.ok !== false) setDetail(r.poc || r) });
		};
		const use = (it) => {
			rt({ op: "pocUse", id: it.id, used_on: "行动板手动标记" }).then(() => toast("已标记使用"));
		};
		return h("div", null,
			h("div", { style: { display: "flex", gap: 6, marginBottom: 10 } },
				h("input", { className: "hm-input", style: { flex: 1 }, value: q, placeholder: "搜 PoC（编号/标题/组件）…", onChange: (e) => onSearch(e.target.value) }),
				h("button", { className: "hm-btn", onClick: () => load() }, "刷")),
			state.stats ? h("div", { style: { marginBottom: 8 } },
				h("span", { className: "hm-chip gray" }, "库内 " + (state.stats.total || state.items.length) + " 条")) : null,
			h(Msg, { kind: "err", text: state.error }),
			(state.items || []).map((it) => h("div", { key: it.id, className: "hm-sec" },
				h("div", { className: "hm-row", style: { cursor: "pointer" }, onClick: () => open(it) },
					h("b", null, it.code || it.id),
					h("span", { style: { flex: 1 } }, it.title || it.name || ""),
					h("span", { className: "hm-chip gray", onClick: (e) => { e.stopPropagation(); use(it) }, title: "标记已用" }, it.used ? "已用" : "标用")),
				detail && (detail.id === it.id || detail.code === it.code) ? h("div", { className: "hm-pre" },
					String(detail.description || detail.content || detail.payload || JSON.stringify(detail, null, 2)).slice(0, 3000)) : null)),
			(state.items || []).length === 0 ? h("div", { className: "hm-note" }, "没有匹配。") : null);
	}

	/* ── 得分 ── */
	function Scores(props) {
		const eng = props.eng;
		const [state, setState] = useState({ items: [], chain: null });
		const load = () => {
			if (!eng) return;
			Promise.all([
				rt({ op: "scores", engagement: eng }),
				rt({ op: "scoreChain", engagement: eng }),
			]).then(([s, c]) => {
				setState({ items: (s && s.items) || s || [], chain: c && c.ok !== false ? c : null });
			});
		};
		useEffect(() => { load(); }, [eng]);
		const del = (id) => {
			rt({ op: "deleteScorePoint", engagement: eng, id }).then(() => { toast("已删除"); load(); });
		};
		const items = state.items && state.items.items ? state.items.items : (state.items || []);
		return h("div", null,
			!eng ? h("div", { className: "hm-note" }, "先在顶部选行动。") : null,
			h(AddForm, {
				fields: [
					{ k: "label", label: "条目", ph: "拿到什么" },
					{ k: "points", label: "分值", ph: "如 10" },
					{ k: "note", label: "备注", ph: "可空" },
				],
				onSubmit: (vals) => rt({ op: "saveScorePoint", engagement: eng, point: vals }).then((r) => { if (r && r.ok !== false) load(); return r }),
			}),
			h(Msg, { kind: "err", text: state.error }),
			state.chain ? h("div", { className: "hm-sec" }, h("h4", null, "链路"),
				h("div", { className: "hm-pre" }, String(state.chain.summary || state.chain.text || JSON.stringify(state.chain, null, 2)).slice(0, 1500))) : null,
			items.map((it, i) => h("div", { key: it.id || i, className: "hm-row" },
				h("b", null, String(it.points != null ? it.points : "—") + " 分"),
				h("span", { style: { flex: 1 } }, it.label || it.title || it.note || ""),
				h("span", { className: "hm-chip crit", onClick: () => del(it.id) }, "删"))),
			eng && items.length === 0 ? h("div", { className: "hm-note" }, "没有得分记录。") : null);
	}

	/* ── 报告（行动汇总） ── */
	function Report(props) {
		const eng = props.eng;
		const [busy, setBusy] = useState(false);
		const [modal, setModal] = useState(null);
		const build = async () => {
			if (!eng) { toast("先在顶部选行动", "err"); return }
			setBusy(true);
			try {
				const [vs, cs, ac, ws, tn, fl, sc, chain, snap] = await Promise.all([
					rt({ op: "vulns", engagement: eng, limit: 500 }),
					rt({ op: "credentials", engagement: eng }),
					rt({ op: "access", engagement: eng }),
					rt({ op: "webshells", engagement: eng }),
					rt({ op: "tunnels", engagement: eng }),
					rt({ op: "attackFiles", engagement: eng }),
					rt({ op: "scores", engagement: eng }),
					rt({ op: "scoreChain", engagement: eng }),
					rt({ op: "snapshot", engagement: eng }),
				]);
				const L = [];
				L.push("# 红队行动报告 — " + eng);
				L.push("");
				L.push("> 生成时间：" + new Date().toLocaleString("zh-CN") + " · 大案组·何马行动板");
				L.push("");
				const st = (snap && snap.stats) || {};
				L.push("## 一、行动概览");
				L.push("");
				L.push("| 指标 | 数量 |");
				L.push("| --- | --- |");
				[["资产", st.assets], ["存活资产", st.liveAssets], ["开放端口", st.openPorts], ["服务", st.services], ["网段", st.segments], ["漏洞", st.vulns], ["凭证", st.credentials], ["权限", st.accesses]].forEach(([k, n]) => L.push("| " + k + " | " + (n == null ? 0 : n) + " |"));
				const ts = (snap && snap.tests) || {};
				L.push("");
				L.push("测试进度：未测 " + (ts.untested || 0) + " · 在测 " + (ts.testing || 0) + " · 已测 " + (ts.tested || 0) + " · 被封 " + (ts.blocked || 0) + " · 放弃 " + (ts.abandoned || 0) + " · 无攻击面 " + (ts.no_surface || 0));
				const items = (vs && vs.items) || [];
				L.push("");
				L.push("## 二、漏洞清单与复现（" + items.length + " 条）");
				for (const v of items) { L.push(""); L.push(buildVulnReport(v)); }
				if (items.length === 0) { L.push(""); L.push("（本行动暂无漏洞记录）"); }
				L.push("");
				L.push("## 三、战果清单");
				const creds = (cs && (cs.items || cs)) || [];
				const credsArr = Array.isArray(creds) ? creds : (creds.items || []);
				L.push("");
				L.push("### 凭证（" + credsArr.length + "）");
				credsArr.forEach((c) => L.push("- " + (c.target || "—") + " · `" + (c.username || "?") + "` / `" + (c.password || (c.hash ? "(hash) " + String(c.hash).slice(0, 24) + "…" : "?")) + "`" + (c.note ? " — " + c.note : "")));
				const acc = (ac && (ac.items || ac)) || [];
				const accArr = Array.isArray(acc) ? acc : (acc.items || []);
				L.push("");
				L.push("### 权限（" + accArr.length + "）");
				accArr.forEach((a) => L.push("- " + (a.target || "—") + " · " + (a.kind || "?") + (a.user ? " · " + a.user : "") + (a.note ? " — " + a.note : "")));
				const sh = (ws && (ws.items || ws)) || [];
				const shArr = Array.isArray(sh) ? sh : (sh.items || []);
				L.push("");
				L.push("### Webshell（" + shArr.length + "）");
				shArr.forEach((w) => L.push("- " + (w.target || "—") + " · " + (w.kind || "?") + " · " + (w.url || "") + " · " + (w.status || "—")));
				const tn2 = (tn && (tn.items || tn)) || [];
				const tnArr = Array.isArray(tn2) ? tn2 : (tn2.items || []);
				L.push("");
				L.push("### 隧道（" + tnArr.length + "）");
				tnArr.forEach((t) => L.push("- " + (t.target || "—") + " · " + (t.kind || "?") + " · " + (t.status || "—") + (t.note ? " — " + t.note : "")));
				const fl2 = (fl && (fl.items || fl)) || [];
				const flArr = Array.isArray(fl2) ? fl2 : (fl2.items || []);
				L.push("");
				L.push("### 落file（" + flArr.length + "）");
				flArr.forEach((f) => L.push("- " + (f.target || "—") + " · " + (f.path || "") + " · " + (f.kind || "")));
				const sc2 = (sc && (sc.items || sc)) || [];
				const scArr = Array.isArray(sc2) ? sc2 : (sc2.items || []);
				let total = 0;
				L.push("");
				L.push("## 四、得分（" + scArr.length + " 项）");
				scArr.forEach((s) => { total += Number(s.points) || 0; L.push("- **" + (s.points != null ? s.points : "?") + " 分** " + (s.label || s.title || s.note || "")); });
				L.push("");
				L.push("**合计：" + total + " 分**");
				if (chain && chain.ok !== false) {
					const text = String(chain.summary || chain.text || "");
					if (text) { L.push(""); L.push("## 五、攻击链"); L.push(""); L.push("```text"); L.push(text.slice(0, 2000)); L.push("```"); }
				}
				L.push("");
				L.push("---");
				L.push("*由大案组·何马行动板生成*");
				setModal({ title: "行动汇总报告 — " + eng, text: L.join("\n"), filename: "hema-report-" + eng + "-" + new Date().toISOString().slice(0, 10) + ".md" });
			} finally { setBusy(false); }
		};
		return h("div", null,
			!eng ? h("div", { className: "hm-note" }, "先在顶部选行动。") : null,
			eng ? h("div", { className: "hm-sec" },
				h("h4", null, "汇总报告"),
				h("div", { className: "hm-note", style: { marginTop: 0, marginBottom: 10 } },
					"一键聚合本行动全部数据：概览统计 + 全部漏洞（含描述/利用方法/复现流量/战果）+ 凭证/权限/Webshell/隧道/落file + 得分与攻击链。生成 Markdown，可复制可下载。"),
				h("button", { className: "hm-btn hm-btn-pri", onClick: build, disabled: busy }, busy ? "生成中…" : "生成行动汇总报告")) : null,
			h(ReportModal, {
				open: !!modal, title: modal && modal.title, text: modal && modal.text,
				filename: modal && modal.filename, onClose: () => setModal(null),
			}));
	}

	/* ── 会话 ── */
	function Sessions(props) {
		const eng = props.eng;
		const [data, setData] = useState(null);
		const [busy, setBusy] = useState(false);
		const load = () => {
			if (!eng) return;
			rt({ op: "sessions", engagement: eng }).then((r) => { if (r && r.ok !== false) setData(r) });
		};
		useEffect(() => { load(); }, [eng]);
		const probe = () => {
			setBusy(true);
			rt({ op: "probeSessions", engagement: eng, timeoutMs: 6000 }).then(() => { setBusy(false); toast("探测完成"); load(); });
		};
		if (!eng) return h("div", { className: "hm-note" }, "先在顶部选行动。");
		const shells = (data && (data.shells || data.webshells)) || [];
		const tunnels = (data && data.tunnels) || [];
		return h("div", null,
			h("div", { style: { marginBottom: 10 } }, h("button", { className: "hm-btn hm-btn-pri", onClick: probe, disabled: busy }, busy ? "探测中…" : "发起真实连通性探测")),
			h(Msg, { kind: "err", text: data && data.error }),
			h("div", { className: "hm-sec" }, h("h4", null, "Webshell（" + shells.length + "）"),
				shells.map((w, i) => h("div", { key: w.id || i, className: "hm-row" },
					h("b", null, w.target || "—"), h("span", null, w.url || w.kind || ""),
					h("span", { className: "hm-chip " + (w.status === "active" ? "okc" : "gray"), style: { marginLeft: "auto" } }, w.status || "—")))),
			h("div", { className: "hm-sec" }, h("h4", null, "隧道（" + tunnels.length + "）"),
				tunnels.map((t, i) => h("div", { key: t.id || i, className: "hm-row" },
					h("b", null, t.target || "—"), h("span", null, t.kind || ""),
					h("span", { className: "hm-chip " + (t.status === "active" ? "okc" : "gray"), style: { marginLeft: "auto" } }, t.status || "—")))),
			!data ? h("div", { className: "hm-note" }, "读取会话…") : null);
	}

	/* ── 技能 ── */
	function Skills() {
		const [state, setState] = useState({ items: [], active: null, content: "" });
		const load = (refresh) => {
			rt({ op: "skillCatalog", refresh: refresh === true }).then((r) => {
				setState((s) => ({ ...s, items: (r && r.items) || [], error: (r && r.ok === false) ? r.error : null }));
			});
		};
		useEffect(() => { load(false); }, []);
		const read = (name, library) => {
			rt({ op: "skillRead", name, library: library || "hema" }).then((r) => {
				if (r && r.ok) setState((s) => ({ ...s, active: name, content: r.content || "" }));
			});
		};
		return h("div", null,
			h("div", { style: { marginBottom: 10 } }, h("span", { className: "hm-chip gray", onClick: () => load(true) }, "重新自检")),
			h("div", { className: "hm-note", style: { marginBottom: 8 } }, "共 " + state.items.length + " 条技能 · 点条目看全文"),
			h(Msg, { kind: "err", text: state.error }),
			state.items.map((s) => h("div", { key: (s.library || "rt") + ":" + s.name, className: "hm-sec" },
				h("div", { className: "hm-row", style: { cursor: "pointer" }, onClick: () => read(s.name, s.library) },
					h("b", null, s.name),
					h("span", { style: { flex: 1 } }, (s.description || "").slice(0, 90)),
					h("span", { className: "hm-chip " + (s.availability === "ready" ? "okc" : "gray") }, s.availability || "?")),
				state.active === s.name ? h("div", { className: "hm-pre" }, state.content.slice(0, 4000)) : null)));
	}

	/* ── 提示词（红队角色提示词）── */
	function Prompts(props) {
		const eng = props.eng;
		const [roles, setRoles] = useState([]);
		const [active, setActive] = usePersist("prompts.role", "");
		const [draft, setDraft] = useState("");
		const [msg, setMsg] = useState(null);
		const load = () => {
			if (!eng) return;
			rt({ op: "prompts", engagement: eng }).then((r) => {
				const list = (r && r.roles) || [];
				setRoles(list);
				const cur = list.find((p) => p.role === active) || list[0];
				if (cur) { setActive(cur.role); setDraft(cur.content || ""); }
			});
		};
		useEffect(() => { load(); }, [eng]);
		const pick = (role) => {
			const p = roles.find((x) => x.role === role);
			setActive(role);
			if (p) setDraft(p.content || "");
		};
		const save = () => {
			rt({ op: "savePrompt", engagement: eng, role: active, content: draft }).then((r) => {
				setMsg(r && r.ok !== false ? { okm: "已保存（" + active + "，" + ((r && r.bytes) || 0) + " 字节）" } : { err: (r && r.error) || "保存失败" });
			});
		};
		const reset = () => {
			rt({ op: "resetPrompts", engagement: eng, role: active }).then(() => { toast("已恢复默认"); load(); });
		};
		if (!eng) return h("div", { className: "hm-note" }, "先在顶部选行动。");
		return h("div", null,
			h(Msg, { kind: "err", text: msg && msg.err }), h(Msg, { kind: "okm", text: msg && msg.okm }),
			h("div", { style: { display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" } },
				roles.map((p) => h("span", { key: p.role, className: "hm-chip" + (active === p.role ? " on" : " gray"),
					title: p.title + (p.planner ? "（主会话人设参考）" : "（派出角色）"), onClick: () => pick(p.role) }, p.title || p.role))),
			h("textarea", { className: "hm-textarea", value: draft, spellCheck: false, onChange: (e) => setDraft(e.target.value) }),
			h("div", { style: { display: "flex", gap: 6, marginTop: 8 } },
				h("button", { className: "hm-btn hm-btn-pri", onClick: save }, "保存"),
				h("button", { className: "hm-btn", onClick: reset }, "恢复默认")));
	}

	/* ── 人设 ── */
	function Persona() {
		const [draft, setDraft] = useState("");
		const [loaded, setLoaded] = useState(false);
		const [busy, setBusy] = useState(false);
		const [msg, setMsg] = useState(null);
		const load = () => {
			setBusy(true);
			hm({ op: "personaGet" }).then((r) => {
				if (r && r.ok) { setDraft(r.prefix); setMsg(null); } else setMsg({ err: (r && r.error) || "读取失败" });
				setLoaded(true); setBusy(false);
			});
		};
		useEffect(() => { if (!loaded) load(); }, []);
		const save = () => {
			if (!draft.trim()) { setMsg({ err: "人设文本不能为空" }); return; }
			setBusy(true);
			hm({ op: "personaSave", prefix: draft }).then((r) => {
				setMsg(r && r.ok ? { okm: r.note || "已保存" } : { err: (r && r.error) || "保存失败" });
				setBusy(false);
			});
		};
		return h("div", null,
			h(Msg, { kind: "err", text: msg && msg.err }), h(Msg, { kind: "okm", text: msg && msg.okm }),
			h("textarea", { className: "hm-textarea", value: draft, spellCheck: false,
				onChange: (e) => setDraft(e.target.value),
				placeholder: "「大案组·何马」的人设正文…（保存写回两份 agent.cordis.yml）" }),
			h("div", { style: { display: "flex", gap: 6, marginTop: 8 } },
				h("button", { className: "hm-btn hm-btn-pri", onClick: save, disabled: busy }, busy ? "保存中…" : "保存人设"),
				h("button", { className: "hm-btn", onClick: load, disabled: busy }, "重新加载")),
			h("div", { className: "hm-note" },
				"保存后重启 dsh web 生效（只影响新开的何马会话）。引擎级注入每 5 秒重读本文件——重启之后改人设，新会话直接用新框架，不用再重启。"));
	}

	/* ── 智能体 ── */
	function Agents() {
		const [data, setData] = useState(null);
		const [max, setMax] = useState(null);
		const load = () => {
			rt({ op: "agentsStatus" }).then((r) => { if (r && r.ok) { setData(r); setMax(r.max); } });
		};
		useEffect(() => { load(); }, []);
		const setM = () => {
			rt({ op: "setAgentsMax", max: Number(max) }).then((r) => {
				if (r && r.ok) { toast(r.note || "已保存"); load(); } else toast((r && r.error) || "失败", "err");
			});
		};
		return h("div", null,
			!data ? h("div", { className: "hm-note" }, "读取并发状态…") : null,
			data ? h("div", null,
				h("div", { className: "hm-tiles" },
					h("div", { className: "hm-tile" }, h("b", null, String(data.used)), h("span", null, "运行中")),
					h("div", { className: "hm-tile" }, h("b", null, String(data.free)), h("span", null, "空闲")),
					h("div", { className: "hm-tile" }, h("b", null, String(data.max)), h("span", null, "并发上限"))),
				h("div", { className: "hm-sec" }, h("h4", null, "并发上限"),
					h("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
						h("input", { className: "hm-input", style: { width: 80 }, value: max == null ? "" : String(max), onChange: (e) => setMax(e.target.value) }),
						h("button", { className: "hm-btn hm-btn-pri", onClick: setM }, "设置"),
						h("span", { className: "hm-note", style: { marginTop: 0 } }, "立即生效，不用重启。"))),
				h("div", { className: "hm-sec" }, h("h4", null, "运行中的子会话"),
					(data.running || []).slice(0, 15).map((r, i) => h("div", { key: i, className: "hm-row" },
						h("b", null, "RUN"), h("span", null, (r.label || r.session) + (r.mode ? " · " + r.mode : "")))),
					(data.running || []).length === 0 ? h("div", { className: "hm-note" }, "当前没有在跑的智能体。") : null)) : null);
	}

	/* ── 环境 ── */
	function Env() {
		const [cfg, setCfg] = useState(null);
		const [adapt, setAdapt] = useState(null);
		const [ver, setVer] = useState(null);
		const load = () => {
			rt({ op: "platformConfigGet" }).then((r) => { if (r && r.ok !== false) setCfg(r) });
			rt({ op: "platformEnvAdaptStatus" }).then((r) => { if (r && r.ok !== false) setAdapt(r) });
			rt({ op: "version" }).then((r) => { if (r && r.ok !== false) setVer(r) });
		};
		useEffect(() => { load(); }, []);
		const skip = () => {
			rt({ op: "platformEnvAdaptSkip", skip: true }).then(() => { toast("已跳过环境适配引导"); load(); });
		};
		return h("div", null,
			adapt ? h("div", { className: "hm-sec" },
				h("h4", null, "环境适配"),
				h("div", { className: "hm-row" }, h("b", null, "就绪"), h("span", { className: adapt.ready ? "hm-okc" : "" }, adapt.ready ? "是" : "否" + (adapt.message ? " · " + adapt.message : ""))),
				h("div", { style: { marginTop: 6 } }, h("span", { className: "hm-chip gray", onClick: skip }, "跳过适配引导"))) : null,
			ver ? h("div", { className: "hm-sec" },
				h("h4", null, "版本"),
				h("div", { className: "hm-row" }, h("b", null, "当前"), h("span", null, (ver.plugin && ver.plugin.version) || "未知")),
				h("div", { className: "hm-row" }, h("b", null, "安装态"), h("span", null, (ver.install && ver.install.mode) || "—")),) : null,
			cfg ? h("div", { className: "hm-sec" },
				h("h4", null, "平台配置"),
				Object.entries(cfg).filter(([k]) => k !== "ok").map(([k, v]) => h("div", { key: k, className: "hm-row" },
					h("b", null, k), h("span", null, typeof v === "object" ? JSON.stringify(v) : String(v == null ? "—" : v))))) : null,
			h("div", { className: "hm-note" }, "这里读的是插件自带的环境/平台配置（data/config.json）。可在此查看与调整平台信息。"));
	}

	/* 常驻自足 dock：关=右下角悬浮马头球，开=全高行动板。
	   单 occupant 走 shell.overlay（list 槽，已证可渲染），
	   外套自带错误边界——渲染崩溃自己显形，不靠壳子吞。 */
	function HemaDock() {
		const [open, setOpen] = useState(ui.open);
		useEffect(() => {
			beacon("dock-mounted");
			const on = (e) => setOpen(Boolean(e.detail && e.detail.open));
			window.addEventListener("hema-ui", on);
			return () => window.removeEventListener("hema-ui", on);
		}, []);
		if (!open) {
			return h("button", {
				type: "button",
				title: "何马行动板",
				"aria-label": "何马行动板",
				onClick: () => setUI({ open: true }),
				style: {
					position: "fixed", right: 20, bottom: 20, zIndex: 69,
					width: 46, height: 46, borderRadius: "50%",
					border: "1px solid #f59e0b88", background: "#1a1608ee",
					fontSize: 20, cursor: "pointer", boxShadow: "0 4px 18px #0009",
					display: "flex", alignItems: "center", justifyContent: "center",
				},
			}, "🐴");
		}
		return h(Panel, null);
	}

	class HemaSafe extends react.Component {
		constructor(p) { super(p); this.state = { failed: null }; }
		static getDerivedStateFromError(error) { return { failed: error }; }
		componentDidCatch(error) { try { beacon("render-crash", String((error && (error.stack || error.message)) || error)) } catch (e7) { /* ignore */ } }
		render() {
			if (this.state.failed) {
				return h("div", {
					style: { position: "fixed", right: 20, bottom: 20, zIndex: 999, background: "#7f1d1d",
						color: "#fecaca", padding: "10px 14px", borderRadius: 8, fontSize: 12,
						maxWidth: 460, fontFamily: "ui-monospace,monospace" },
				}, "🐴 行动板渲染崩溃: " + String(this.state.failed && this.state.failed.message));
			}
			return h(HemaDock, this.props);
		}
	}

	function Panel() {
		const [st, setSt] = useState(() => Object.assign({}, ui));
		const [engs, setEngs] = useState([]);
		const [eng, setEng] = usePersist("eng", null);
		const [newName, setNewName] = useState("");
		useEffect(() => { beacon("panel-mounted"); }, []);
		useEffect(() => {
			const on = (e) => setSt(Object.assign({}, e.detail));
			window.addEventListener("hema-ui", on);
			return () => window.removeEventListener("hema-ui", on);
		}, []);
		useEffect(() => {
			rt({ op: "bootstrap" }).then((r) => {
				const list = (r && r.engagements) || [];
				setEngs(list);
				setEng((cur) => (cur && list.some((x) => x.id === cur) ? cur : ((r && r.current) || (list[0] && list[0].id) || null)));
			});
		}, []);
		useEffect(() => {
			const onKey = (e) => { if (e.key === "Escape" && ui.open) setUI({ open: false }) };
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, []);
		const activate = (id) => {
			setEng(id || null);
			if (id) rt({ op: "activateEngagement", engagement: id });
		};
		const createEng = () => {
			const name = String(newName || "").trim();
			if (!name) return;
			rt({ op: "openEngagement", name }).then((r) => {
				if (r && r.ok !== false) {
					toast("行动已创建");
					setNewName("");
					rt({ op: "bootstrap" }).then((b) => {
						const list = (b && b.engagements) || [];
						setEngs(list);
						const created = r.engagement && r.engagement.id;
						activate(created || (b && b.current) || (list[0] && list[0].id) || null);
					});
				} else toast((r && r.error) || "创建失败", "err");
			});
		};
		const tab = st.tab || "overview";
		const TABS = [
			["overview", "🎯", "概览"], ["targets", "🗂", "靶标"], ["vulns", "🩸", "漏洞"], ["loot", "🔑", "战果"],
			["poc", "🧪", "PoC"], ["scores", "📊", "得分"], ["report", "📋", "报告"], ["sessions", "🖥", "会话"],
			["skills", "🧰", "技能"], ["prompts", "💬", "提示词"], ["persona", "🐴", "人设"], ["agents", "🤖", "智能体"], ["env", "⚙", "环境"],
		];
		return h("div", { className: "hm-wrap", style: { display: st.open ? "flex" : "none" } },
			h("div", { className: "hm-rail" },
				h("div", { className: "hm-logo", title: "大案组·何马" }, "🐴"),
				TABS.map(([key, icon, label]) => h("button", {
					key, className: tab === key ? "on" : "", title: label,
					onClick: () => setUI({ tab: key }),
				}, h("span", null, icon), h("span", { className: "hm-rail-t" }, label)))),
			h("div", { className: "hm-main" },
				h("div", { className: "hm-head" },
					h("div", null,
						h("div", { className: "hm-title" }, "何马行动板"),
						h("div", { className: "hm-sub" }, "HEMA OPS CONSOLE")),
					h("div", { className: "hm-spacer" }),
					h("select", { className: "hm-select", value: eng || "", onChange: (e) => activate(e.target.value || null) },
						engs.length === 0 ? h("option", { value: "" }, "（无行动）") : null,
						engs.map((e2) => h("option", { key: e2.id, value: e2.id }, e2.name || e2.id))),
					h("input", { className: "hm-input", style: { width: 110 }, value: newName, placeholder: "新行动名", onChange: (e) => setNewName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") createEng() } }),
					h("button", { className: "hm-btn", onClick: createEng }, "建"),
					h("button", { className: "hm-btn", title: "收起（Esc）", onClick: () => setUI({ open: false }) }, "✕")),
				h("div", { className: "hm-body" },
					tab === "overview" ? h(Overview, { eng }) : null,
					tab === "targets" ? h(Targets, { eng }) : null,
					tab === "vulns" ? h(Vulns, { eng }) : null,
					tab === "loot" ? h(Loot, { eng }) : null,
					tab === "poc" ? h(Pocs, null) : null,
					tab === "scores" ? h(Scores, { eng }) : null,
					tab === "report" ? h(Report, { eng }) : null,
					tab === "sessions" ? h(Sessions, { eng }) : null,
					tab === "skills" ? h(Skills, null) : null,
					tab === "prompts" ? h(Prompts, { eng }) : null,
					tab === "persona" ? h(Persona, null) : null,
					tab === "agents" ? h(Agents, null) : null,
					tab === "env" ? h(Env, null) : null)),
			h(Toast, null));
	}

	function SidebarButton(props) {
		const [open, setOpen] = useState(ui.open);
		useEffect(() => {
			const on = (e) => setOpen(Boolean(e.detail && e.detail.open));
			window.addEventListener("hema-ui", on);
			return () => window.removeEventListener("hema-ui", on);
		}, []);
		return h("button", {
			className: "hm-icon-btn" + (open ? " on" : ""),
			title: "何马行动板（Esc 收起）",
			onClick: () => setUI({ open: !open }),
		}, h("span", { style: { fontSize: 14 } }, "🐴"), props && props.wide ? h("span", null, "行动板") : null);
	}
	function HeaderButton() { return h(SidebarButton, null) }

	/* 输入框右侧的小马按钮（挂在 conversation.input.right 槽） */
	function HemaInputButton(props) {
		const [open, setOpen] = useState(ui.open);
		useEffect(() => {
			const on = (e) => setOpen(Boolean(e.detail && e.detail.open));
			window.addEventListener("hema-ui", on);
			return () => window.removeEventListener("hema-ui", on);
		}, []);
		return h("button", {
			type: "button",
			title: "何马行动板",
			"aria-label": "何马行动板",
			onClick: () => setUI({ open: !open }),
			style: {
				border: "1px solid " + (open ? "#f59e0b" : "#f59e0b55"),
				background: open ? "#f59e0b22" : "transparent",
				color: open ? "#f59e0b" : "inherit",
				borderRadius: 6, cursor: "pointer", fontSize: 14,
				padding: "2px 8px", lineHeight: 1.4, flex: "none",
			},
		}, "🐴");
	}

	/* ── 插件入口 ── */
	const inject = ["slots"];

	function apply(ctx) {
		try {
			beacon("apply-enter", "slots=" + (ctx && ctx.slots ? "yes" : "NO")
				+ " effect=" + (ctx && typeof ctx.effect === "function" ? "yes" : "NO")
				+ " inject=" + JSON.stringify(inject));
			const styleTag = document.createElement("style");
			styleTag.setAttribute("data-hema-ui", "1");
			styleTag.textContent = CSS;
			document.head.append(styleTag);
			ctx.effect(() => () => { styleTag.remove(); });

			const safeInject = (label, fn) => {
				try { fn(); window.__HEMA_OK__ = (window.__HEMA_OK__ || []).concat(label); beacon("slot-ok:" + label); }
				catch (err) { hemaFail(label, err); }
			};
			safeInject("shell.overlay", () => ctx.slots.inject("shell.overlay", () => {
				beacon("overlay-factory-fired");
				return ctx.slots.register(
					{ name: "shell.overlay", id: "hema-dock", order: 50 },
					HemaSafe,
				);
			}));
			/* 按钮挂在输入框右侧 —— sidebar.footer.action 槽在当前壳子构建里不渲染，
			   实测注入成功却不出按钮，故弃用幽灵槽，改挂 conversation.input.right。 */
			safeInject("conversation.input.right", () => ctx.slots.inject("conversation.input.right", () => ctx.slots.register(
				{ name: "conversation.input.right", id: "hema-toggle", order: 25, inject: (sessionId) => ({ sessionId }) },
				HemaInputButton,
			)));
			if (!window.__HEMA_ERR__) {
				window.__HEMA_LOADED__ = true;
				beacon("applied", (window.__HEMA_OK__ || []).join(","));
				try { console.log("[hema] 行动板已挂载:", (window.__HEMA_OK__ || []).join(", ")) } catch (e2) { /* ignore */ }
			}
		} catch (err) { hemaFail("apply", err); }
	}

	exports.name = name;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}})
