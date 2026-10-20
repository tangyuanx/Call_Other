# Design QA

final result: passed

## Source and evidence

- Approved visual: `evidence/reference-full.png` (1483 × 1061), copied from the selected generated design `exec-92bec5a7-8820-465d-97cf-dbd39d62a58d.png`.
- Relevant extension region: `evidence/reference-panel.png` (1424 × 204), cropped at x=58, y=827. Native VS Code editor chrome is outside the extension-owned surface.
- Implemented webview: `evidence/initial.jpg` (1424 × 204), rendered at CSS viewport 1424 × 204, device scale 1, default one-level callers and callees graph, root selected.
- Combined comparison: `evidence/comparison.png` shows the approved region and implementation together at 1:1, with small source labels outside both regions.
- Expanded state: `evidence/expanded.jpg` (1424 × 320), with both caller and callee branches of dispatch_request open, at 100% graph zoom.
- User-reported former crossing: `evidence/reported-crossing.png`.

The browser verification surface uses the production `media/graph.js`, `layout.js`, `graph.css`, and `src/graph.js`, with a local mock message bridge. It does not represent real language queries or source navigation. Those are checked separately in the real extension host with the official clangd extension and clangd 20.1.8. Native Webview script loading is confirmed by its ready handshake.

## Findings and fixes

- Resolved P1: expanding callers of dispatch_request originally merged an existing handle_request occurrence, producing crossings and coupled branches. The model now creates independent occurrences per branch. Their complete subtrees have separate bounding regions; reverse expansions use a private entrance. A repeated ancestor becomes a separately clickable reference, never a loop edge.
- Resolved P2: opposite 22px button targets overlapped in a 60px node gap. Port centers now sit 18px outside their own nodes, leaving 24px between opposite centers. Node borders remain clear of the targets.
- Resolved P2: guessed controls appeared on empty directions. Only loaded, non-empty directions get a control. Visible-node probing has concurrency four and does not recurse through hidden branches.
- Resolved P2: the initial fit shrank text and function labels were truncated. Compact row spacing and correct text-plus-icon width allocation keep the initial 1424 × 204 view at 100%, with complete 14px function labels.
- Resolved P2: replacing all nodes during background probing could lose click targets and keyboard focus. Nodes and ports are now keyed and reused, and focus is retained through state changes.
- No unresolved P0/P1/P2 findings.

## Fidelity surfaces

- Typography: native VS Code UI font for the toolbar, editor monospace for functions, readable 14px node labels at normal zoom. Complete names fit the default view; long names use tooltips and bounded widths. All app text uses Chinese labels consistent with the brief.
- Spacing/layout: compact bottom-panel surface, 32px nodes, 60px inter-branch gap, 14px visible circular controls with separate 22px click targets. Native VS Code owns overall panel height, maximization and closing. The plugin does not reproduce editor chrome or force a global panel size.
- Colors: VS Code theme variables throughout, restrained gray 1px non-scaling paths, ordinary gray node borders, subtle selected fill. No additional mouse-selected outer frame. Keyboard focus remains visible.
- Assets: supplied VS Code Codicons font and graph icon, with upstream license. SVG paths represent actual relation data rather than image substitutes. No external visual assets are needed.
- Copy/content: real function names and provider details in the extension; mock request-handler functions in browser verification. Latest requested simultaneous directions, branch independence, circle placement and empty-direction behavior supersede the earlier static screenshot where they differ.
- Residual P3: native theme colors and font rendering may vary from generated pixels. Small pan/zoom controls are included for functional graphs; native panel actions stay with VS Code. These are expected platform adaptations.

## Interaction checks

- Initial bidirectional graph: six nodes, no clipped names at normal desktop panel size.
- Click function: selected background changes without an outer mouse focus frame; native host reveals correct source range.
- Expand callers and callees of the same non-root function: ten independent browser occurrences, two distinct handle_request appearances, no merged return line.
- Collapse callers: their private occurrences disappear; outgoing functions remain. Collapse outgoing: private callers remain.
- No outgoing relationship: no outgoing button. A function with callers still has an incoming control, even if it calls nothing itself.
- Keyboard Tab/Enter controls and focus retention, toolbar zoom/fit, and canvas drag/zoom exercised.
- Narrow 360 × 280 panel: toolbar controls remain within the viewport, with no outer horizontal overflow; the graph remains pannable and zoomable.
- No new browser console errors in final reloads. The initial preview wrapper had a duplicate declaration during setup, fixed before final verification; this wrapper is not shipped in the extension.

## Automated and native checks

- 24 Node tests pass, including independent repeated-function expansion states, capped visible-node probes, recursion references, no crossing for the reported reverse-expansion pattern, and 12 deterministic mixed-expansion sequences.
- Native isolated VS Code Insiders host with official clangd extension and clangd 20.1.8: 10 checks pass; see `evidence/host-test-results.json`.
- JavaScript syntax checks pass. VSIX includes local scripts, styles, icon font, licenses and examples; no runtime package installation is required.

## Comparison history

1. Early implementation: small-panel fit shrank type; text padding and row geometry fixed and recaptured.
2. User-reported button overlap and empty controls: port spacing, control discovery and keyed updates fixed, then browser checked.
3. User-provided crossing image: canonical shared-node layout replaced by independent branch occurrences and private routing boxes. Screenshot sequence reproduced, both-direction expansion checked, collapse independence checked, native clangd integration rerun successfully.
4. Final comparison uses `comparison.png` and `expanded.jpg`; no remaining blocking visual differences.

## 0.1.1 update

- Removed the two toolbar direction toggles and the initialDirection setting. Both direct root branches open on show and refresh.
- Recaptured initial and expanded views at the established bottom-panel sizes. All six initial occurrences fit at 100%; the four toolbar buttons are refresh, zoom out, zoom in, and fit.
- Browser check: ten occurrences after expanding both sides of dispatch_request, selected function correctly updated, validate_request has no outgoing control, caller collapse preserves the callee branch.
- Reran all 24 unit checks, syntax checks and all 10 real clangd extension-host checks successfully.

## 0.1.3: duplicate opposite-direction controls

- The reported plus/minus pair belonged to opposite endpoints. Visible-node probing previously counted the already displayed parent edge as another expandable relationship.
- Reverse branch reads now exclude that immediate parent per occurrence after consulting shared raw query data. True mutual calls and self recursion are unaffected. Other reverse relationships still get independent branches; their control explicitly says other callers/callees.
- Browser verification: selected on_readable has no outgoing control; validate_request has no incoming control. dispatch_request keeps its distinct shared_path caller and its two outgoing children. Opening both sides yields nine occurrences, without duplicating handle_request; collapse preserves the opposite side.
- Evidence: controls-0.1.3.jpg, 1424 by 204, normal 100 percent zoom. Existing 0.1.1 screenshots are historical; this update supersedes their reverse-parent reference behavior.
- All 32 unit tests and all 10 native clangd checks pass. No new visual assets or changes to node borders, spacing, line routing, or keyboard focus behavior.
