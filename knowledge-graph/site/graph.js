/**
 * Gemischtes Hack — 2-Level Knowledge Graph
 *
 * Level 1: Super-topic clusters connected by similarity
 * Level 2: Click a cluster → drill into sub-topics + episodes
 */

(function () {
    "use strict";

    // ── State ──
    let graphData = null;
    let simulation = null;
    let selectedNode = null;
    let hoveredNode = null;

    // View state: "clusters" (L1) or "detail" (L2 — inside a cluster)
    let viewMode = "clusters";
    let activeCluster = null; // the cluster node we drilled into

    // D3 selections
    let svg, g, linkGroup, nodeGroup, labelGroup;
    let zoom;

    // DOM refs
    const tooltip = document.getElementById("tooltip");
    const panel = document.getElementById("panel");
    const panelContent = document.getElementById("panel-content");
    const searchInput = document.getElementById("search");
    const searchResults = document.getElementById("search-results");
    const statsEl = document.getElementById("stats");
    const btnReset = document.getElementById("btn-reset");
    const panelClose = document.getElementById("panel-close");
    const breadcrumb = document.getElementById("breadcrumb");
    const statClusters = document.getElementById("stat-clusters");
    const statEpisodes = document.getElementById("stat-episodes");
    const metaEpisodes = document.getElementById("meta-episodes");
    const metaTopics = document.getElementById("meta-topics");

    // ── Load data ──
    fetch("graph.json")
        .then((r) => {
            if (!r.ok) throw new Error("graph.json not found — run build_graph.py --export-site first");
            return r.json();
        })
        .then((data) => {
            graphData = data;

            // Build lookup
            graphData._nodeMap = new Map();
            graphData.nodes.forEach((n) => graphData._nodeMap.set(n.id, n));

            // Populate meta pills
            const m = data.meta;
            if (metaEpisodes) metaEpisodes.innerHTML = `<strong>${m.total_episodes}</strong> Episoden`;
            if (metaTopics) metaTopics.innerHTML = `<strong>${m.total_clusters}</strong> Themen`;

            initSVG();
            renderClusters();
        })
        .catch((err) => {
            document.getElementById("graph-container").innerHTML =
                `<div style="padding:40px;color:#f7768e;text-align:center;">
                    <h2>Keine Daten gefunden</h2>
                    <p style="margin-top:12px;color:#565f89;">${err.message}</p>
                    <pre style="margin-top:8px;color:#7aa2f7;font-size:13px;">python extract_topics.py\npython build_graph.py --export-site</pre>
                </div>`;
        });

    // ── SVG setup (once) ──
    function initSVG() {
        const container = document.getElementById("graph-container");
        const width = container.clientWidth;
        const height = container.clientHeight;

        svg = d3.select("#graph").attr("width", width).attr("height", height);

        zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on("zoom", (event) => g.attr("transform", event.transform));
        svg.call(zoom);
        svg.on("click", onBackgroundClick);

        g = svg.append("g");
        linkGroup = g.append("g").attr("class", "links");
        nodeGroup = g.append("g").attr("class", "nodes");
        labelGroup = g.append("g").attr("class", "labels");

        // Controls
        btnReset.addEventListener("click", onReset);
        panelClose.addEventListener("click", closePanel);
        searchInput.addEventListener("input", onSearch);
        searchInput.addEventListener("focus", onSearch);
        document.addEventListener("click", (e) => {
            if (!e.target.closest("#search-container")) hideSearchResults();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                closePanel();
                hideSearchResults();
                clearHighlight();
                searchInput.value = "";
            }
        });

        // Zoom controls
        const zoomIn = document.getElementById("zoom-in");
        const zoomOut = document.getElementById("zoom-out");
        const zoomResetBtn = document.getElementById("zoom-reset");
        if (zoomIn) zoomIn.addEventListener("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1.3));
        if (zoomOut) zoomOut.addEventListener("click", () => svg.transition().duration(300).call(zoom.scaleBy, 0.77));
        if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

        // Breadcrumb back
        if (breadcrumb) {
            breadcrumb.addEventListener("click", (e) => {
                const target = e.target.closest("[data-action]");
                if (target && target.dataset.action === "back") {
                    backToClusters();
                }
            });
        }

        window.addEventListener("resize", () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            svg.attr("width", w).attr("height", h);
            if (simulation) {
                simulation.force("center", d3.forceCenter(w / 2, h / 2).strength(0.05));
                simulation.alpha(0.1).restart();
            }
        });
    }

    // ═══════════════════════════════════════════
    // Level 1: Cluster overview
    // ═══════════════════════════════════════════

    function renderClusters() {
        viewMode = "clusters";
        activeCluster = null;
        selectedNode = null;
        closePanel();
        setBreadcrumb(null);

        const container = document.getElementById("graph-container");
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Reset zoom
        svg.call(zoom.transform, d3.zoomIdentity);

        // Clear
        linkGroup.selectAll("*").remove();
        nodeGroup.selectAll("*").remove();
        labelGroup.selectAll("*").remove();
        if (simulation) simulation.stop();

        const nodes = graphData.nodes; // cluster nodes
        const edges = graphData.edges
            .map((e) => ({
                ...e,
                source: graphData._nodeMap.get(e.source) || e.source,
                target: graphData._nodeMap.get(e.target) || e.target,
            }))
            .filter((e) => typeof e.source === "object" && typeof e.target === "object");

        graphData._activeEdges = edges;

        // Reset positions for fresh layout
        nodes.forEach((n) => { delete n.x; delete n.y; delete n.fx; delete n.fy; });

        // Links
        const links = linkGroup
            .selectAll("line")
            .data(edges)
            .join("line")
            .attr("stroke", "rgba(193, 53, 132, 0.1)")
            .attr("stroke-width", (d) => Math.max(0.5, (d.weight || 0.5) * 3))
            .attr("class", "link link-similarity");

        // Nodes — gradient-inspired fill using hue based on index
        const nodeEls = nodeGroup
            .selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("r", clusterRadius)
            .attr("fill", (d, i) => clusterColor(i, nodes.length))
            .attr("fill-opacity", 0.18)
            .attr("stroke", (d, i) => clusterColor(i, nodes.length))
            .attr("stroke-width", 1.8)
            .attr("stroke-opacity", 0.6)
            .attr("cursor", "pointer")
            .attr("class", "node node-cluster")
            .on("mouseenter", onNodeHover)
            .on("mouseleave", onNodeLeave)
            .on("click", onClusterClick);

        // Labels
        const labelEls = labelGroup
            .selectAll("text")
            .data(nodes)
            .join("text")
            .text((d) => d.label)
            .attr("font-size", (d) => Math.max(9, Math.min(13, 8 + Math.sqrt(d.episode_count || 1) * 0.5)))
            .attr("font-family", "'Lora', Georgia, serif")
            .attr("font-weight", 600)
            .attr("fill", "var(--text-mid)")
            .attr("text-anchor", "middle")
            .attr("dy", (d) => -clusterRadius(d) - 6)
            .attr("pointer-events", "none")
            .attr("class", "node-label");

        // Simulation
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(edges).id((d) => d.id).distance((d) => 100 + (1 - (d.weight || 0.5)) * 150).strength((d) => (d.weight || 0.5) * 0.2))
            .force("charge", d3.forceManyBody().strength((d) => -80 - (d.episode_count || 1) * 3).distanceMax(600))
            .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
            .force("collision", d3.forceCollide().radius((d) => clusterRadius(d) + 6))
            .force("x", d3.forceX(width / 2).strength(0.015))
            .force("y", d3.forceY(height / 2).strength(0.015))
            .alphaDecay(0.025)
            .on("tick", () => {
                links.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
                     .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
                nodeEls.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
                labelEls.attr("x", (d) => d.x).attr("y", (d) => d.y - clusterRadius(d) - 5);
            });

        nodeEls.call(makeDrag(simulation));

        // Stats
        const m = graphData.meta;
        statsEl.textContent = `${m.total_clusters} Themen · ${m.total_sub_topics} Sub-Themen · ${m.total_episodes} Episoden`;
        if (statClusters) statClusters.textContent = m.total_clusters;
        if (statEpisodes) statEpisodes.textContent = m.total_episodes;
    }

    function clusterRadius(d) {
        return Math.max(8, Math.min(30, 5 + Math.sqrt(d.episode_count || 1) * 2.5));
    }

    // Gradient-inspired color palette for clusters
    const CLUSTER_COLORS = ["#833ab4", "#c13584", "#f77737", "#fcaf45", "#e1306c", "#fd1d1d", "#285AEB", "#405de6"];
    function clusterColor(i, total) {
        return CLUSTER_COLORS[i % CLUSTER_COLORS.length];
    }

    function onClusterClick(event, d) {
        event.stopPropagation();
        drillInto(d);
    }

    // ═══════════════════════════════════════════
    // Level 2: Drill into a cluster — episodes-first
    // ═══════════════════════════════════════════

    function drillInto(clusterNode) {
        viewMode = "detail";
        activeCluster = clusterNode;
        selectedNode = null;
        closePanel();
        setBreadcrumb(clusterNode.label);

        const container = document.getElementById("graph-container");
        const width = container.clientWidth;
        const height = container.clientHeight;

        svg.call(zoom.transform, d3.zoomIdentity);

        linkGroup.selectAll("*").remove();
        nodeGroup.selectAll("*").remove();
        labelGroup.selectAll("*").remove();
        if (simulation) simulation.stop();

        // Collect sub-topic info for this cluster (used for similarity + panel)
        const subTopics = clusterNode.sub_topics || [];
        // Map: glt_id → set of sub-topic labels in this cluster
        const epToSubTopics = new Map();
        subTopics.forEach((st) => {
            (st.episodes || []).forEach((gltId) => {
                if (!epToSubTopics.has(gltId)) epToSubTopics.set(gltId, new Set());
                epToSubTopics.get(gltId).add(st.label);
            });
        });

        // Build episode nodes
        const epSet = new Set();
        const epNodes = [];
        const epLookup = graphData.episodes || {};
        clusterNode.episodes.forEach((ep) => {
            const gltId = ep.glt_id;
            if (epSet.has(gltId)) return;
            epSet.add(gltId);
            const full = epLookup[gltId] || {};
            epNodes.push({
                id: `ep:${gltId}`,
                type: "episode",
                label: `#${ep.episode_number || "?"} ${ep.title || gltId}`,
                title: ep.title || gltId,
                episode_number: ep.episode_number,
                pub_date: ep.pub_date || "",
                summary: full.summary || "",
                topics: full.topics || [],
                glt_id: gltId,
                _clusterSubTopics: Array.from(epToSubTopics.get(gltId) || []),
            });
        });

        // The center label node
        const centerNode = {
            id: clusterNode.id,
            type: "cluster_center",
            label: clusterNode.label,
            episode_count: clusterNode.episode_count,
            fx: width / 2,
            fy: height / 2,
        };

        const allNodes = [centerNode, ...epNodes];
        const nodeMap = new Map();
        allNodes.forEach((n) => nodeMap.set(n.id, n));

        // Edges: episode ↔ episode based on shared sub-topics in this cluster
        const edges = [];
        // Also link each episode to the center
        epNodes.forEach((ep) => {
            edges.push({ source: centerNode.id, target: ep.id, type: "contains" });
        });

        // Episode↔Episode: shared sub-topics
        for (let i = 0; i < epNodes.length; i++) {
            const aTopics = epToSubTopics.get(epNodes[i].glt_id) || new Set();
            for (let j = i + 1; j < epNodes.length; j++) {
                const bTopics = epToSubTopics.get(epNodes[j].glt_id) || new Set();
                let shared = 0;
                aTopics.forEach((t) => { if (bTopics.has(t)) shared++; });
                if (shared > 0) {
                    edges.push({
                        source: epNodes[i].id,
                        target: epNodes[j].id,
                        type: "similarity",
                        weight: shared,
                        _sharedTopics: shared,
                    });
                }
            }
        }

        // Keep only the strongest episode edges to avoid hairball
        const simEdges = edges.filter((e) => e.type === "similarity");
        simEdges.sort((a, b) => b.weight - a.weight);
        const maxSimEdges = Math.min(simEdges.length, epNodes.length * 2);
        const keptSim = new Set(simEdges.slice(0, maxSimEdges));
        const finalEdges = edges.filter((e) => e.type === "contains" || keptSim.has(e));

        // Resolve references
        const resolvedEdges = finalEdges
            .map((e) => ({ ...e, source: nodeMap.get(e.source), target: nodeMap.get(e.target) }))
            .filter((e) => e.source && e.target);

        graphData._activeEdges = resolvedEdges;

        // Update nodeMap with L2 episode nodes
        allNodes.forEach((n) => graphData._nodeMap.set(n.id, n));

        // Links
        const links = linkGroup
            .selectAll("line")
            .data(resolvedEdges)
            .join("line")
            .attr("stroke", (d) => d.type === "contains" ? "rgba(131, 58, 180, 0.06)" : "rgba(193, 53, 132, 0.2)")
            .attr("stroke-width", (d) => d.type === "contains" ? 0.5 : Math.min(3, 0.5 + (d._sharedTopics || 0) * 0.8))
            .attr("class", (d) => `link link-${d.type}`);

        // Nodes
        const nodeEls = nodeGroup
            .selectAll("circle")
            .data(allNodes)
            .join("circle")
            .attr("r", detailRadius)
            .attr("fill", (d) => d.type === "cluster_center" ? "var(--topic-color)" : "var(--episode-color)")
            .attr("fill-opacity", (d) => d.type === "cluster_center" ? 0.12 : 0.15)
            .attr("stroke", (d) => d.type === "cluster_center" ? "var(--topic-color)" : "var(--episode-color)")
            .attr("stroke-width", (d) => d.type === "cluster_center" ? 2 : 1.5)
            .attr("stroke-opacity", (d) => d.type === "cluster_center" ? 0.5 : 0.6)
            .attr("cursor", (d) => d.type === "cluster_center" ? "default" : "pointer")
            .attr("class", (d) => `node node-${d.type}`)
            .on("mouseenter", onNodeHover)
            .on("mouseleave", onNodeLeave)
            .on("click", onDetailNodeClick);

        // Small center dot for episodes
        const epDots = nodeGroup.selectAll(".ep-dot")
            .data(allNodes.filter((n) => n.type === "episode"))
            .join("circle")
            .attr("class", "ep-dot")
            .attr("r", 2.5)
            .attr("fill", "var(--episode-color)")
            .attr("fill-opacity", 0.9)
            .attr("pointer-events", "none");

        // Labels: center + episode numbers
        const labelEls = labelGroup
            .selectAll("text")
            .data(allNodes)
            .join("text")
            .text((d) => d.type === "cluster_center" ? d.label : `EP ${d.episode_number || "?"}`)
            .attr("font-size", (d) => d.type === "cluster_center" ? 14 : 9)
            .attr("font-family", (d) => d.type === "cluster_center" ? "'Lora', Georgia, serif" : "'Nunito', sans-serif")
            .attr("fill", (d) => d.type === "cluster_center" ? "var(--text-dark)" : "var(--text-soft)")
            .attr("font-weight", (d) => d.type === "cluster_center" ? 600 : 700)
            .attr("text-anchor", "middle")
            .attr("dy", (d) => -detailRadius(d) - 5)
            .attr("pointer-events", "none")
            .attr("class", "node-label");

        // Simulation
        simulation = d3.forceSimulation(allNodes)
            .force("link", d3.forceLink(resolvedEdges).id((d) => d.id)
                .distance((d) => d.type === "contains" ? 120 : Math.max(30, 80 - (d._sharedTopics || 0) * 15))
                .strength((d) => d.type === "contains" ? 0.02 : Math.min(0.5, 0.05 + (d._sharedTopics || 0) * 0.1)))
            .force("charge", d3.forceManyBody().strength((d) => {
                if (d.type === "cluster_center") return -200;
                return -40;
            }).distanceMax(350))
            .force("center", d3.forceCenter(width / 2, height / 2).strength(0.04))
            .force("collision", d3.forceCollide().radius((d) => detailRadius(d) + 4))
            .alphaDecay(0.025)
            .on("tick", () => {
                links.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
                     .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
                nodeEls.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
                labelEls.attr("x", (d) => d.x).attr("y", (d) => d.y - detailRadius(d) - 5);
                epDots.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
            });

        nodeEls.call(makeDrag(simulation));

        const simCount = resolvedEdges.filter((e) => e.type === "similarity").length;
        statsEl.textContent = `${clusterNode.label}: ${epNodes.length} Episoden · ${simCount} Verbindungen`;
        if (statClusters) statClusters.textContent = clusterNode.label;
        if (statEpisodes) statEpisodes.textContent = epNodes.length;
    }

    function detailRadius(d) {
        if (d.type === "cluster_center") return 20;
        return 8 + (d._clusterSubTopics || []).length * 1.5;
    }

    function onDetailNodeClick(event, d) {
        event.stopPropagation();
        if (d.type === "cluster_center") return;
        selectedNode = d;
        highlightNode(d);
        showPanel(d);
    }

    // ── Back to clusters ──
    function backToClusters() {
        if (viewMode === "clusters") return;
        renderClusters();
    }

    // ── Breadcrumb ──
    function setBreadcrumb(clusterLabel) {
        if (!breadcrumb) return;
        if (!clusterLabel) {
            breadcrumb.classList.add("hidden");
            return;
        }
        breadcrumb.innerHTML = `<span data-action="back" class="bc-link">Alle Themen</span><span class="bc-sep">›</span><span class="bc-current">${escapeHtml(clusterLabel)}</span>`;
        breadcrumb.classList.remove("hidden");
    }

    // ═══════════════════════════════════════════
    // Shared interactions
    // ═══════════════════════════════════════════

    function onNodeHover(event, d) {
        hoveredNode = d;

        const connected = getConnectedIds(d.id);
        connected.add(d.id);

        nodeGroup.selectAll("circle")
            .attr("opacity", (n) => connected.has(n.id) ? 1 : 0.15);
        linkGroup.selectAll("line")
            .attr("opacity", (l) => (l.source.id === d.id || l.target.id === d.id) ? 0.8 : 0.05)
            .attr("stroke", (l) => (l.source.id === d.id || l.target.id === d.id) ? "var(--edge-highlight)" : null);
        labelGroup.selectAll("text")
            .attr("opacity", (n) => connected.has(n.id) ? 1 : 0.1);

        let html = "";
        if (d.type === "cluster") {
            html += `<div class="tt-badge">Themen-Cluster</div>`;
            html += `<div class="tt-title">${escapeHtml(d.label)}</div>`;
            html += `<div class="tt-meta">${d.episode_count} Episoden · ${d.sub_topic_count} Sub-Themen</div>`;
            const top3 = (d.sub_topics || []).slice(0, 3).map((st) => st.label);
            if (top3.length) html += `<div class="tt-tags">${top3.map((t) => `<span class="tt-tag">${escapeHtml(t)}</span>`).join("")}</div>`;
        } else if (d.type === "episode") {
            html += `<div class="tt-badge">Episode ${d.episode_number || "?"}</div>`;
            html += `<div class="tt-title">${escapeHtml(d.title || d.label)}</div>`;
            html += `<div class="tt-meta">${d.pub_date ? formatDate(d.pub_date) : ""}</div>`;
            const subs = (d._clusterSubTopics || []).slice(0, 4);
            if (subs.length) html += `<div class="tt-tags">${subs.map((t) => `<span class="tt-tag">${escapeHtml(t)}</span>`).join("")}</div>`;
        } else {
            html += `<div class="tt-title">${escapeHtml(d.label)}</div>`;
        }

        tooltip.innerHTML = html;
        tooltip.classList.add("visible");
        positionTooltip(event);
    }

    function onNodeLeave() {
        hoveredNode = null;
        if (!selectedNode) clearHighlight();
        tooltip.classList.remove("visible");
    }

    function positionTooltip(event) {
        const rect = document.getElementById("graph-container").getBoundingClientRect();
        let x = event.clientX - rect.left + 16;
        let y = event.clientY - rect.top - 10;
        if (x + 280 > rect.width) x = event.clientX - rect.left - 290;
        if (y + 100 > rect.height) y = rect.height - 110;
        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
    }

    function onBackgroundClick(event) {
        if (event.target === svg.node()) {
            selectedNode = null;
            clearHighlight();
            closePanel();
        }
    }

    // ── Panel ──
    function showPanel(d) {
        let html = "";

        if (d.type === "cluster") {
            // Hero header
            html += `<div class="panel-hero">`;
            html += `<span class="d-badge">Themen-Cluster · ${d.episode_count} Episoden</span>`;
            html += `<h2>${escapeHtml(d.label)}</h2>`;
            html += `</div>`;
            html += `<div class="panel-body">`;

            html += `<button class="btn-drill" data-cluster-id="${escapeAttr(d.id)}">Episoden erkunden →</button>`;

            // Related clusters
            const related = getRelatedClusters(d.id);
            if (related.length > 0) {
                html += `<div class="section-title">Verwandte Themen</div>`;
                html += `<div class="tag-list">`;
                related.forEach((rt) => {
                    html += `<span class="tag topic-tag" data-id="${escapeAttr(rt.id)}">${escapeHtml(rt.label)}</span>`;
                });
                html += `</div>`;
            }

            // Sub-topics as tags (secondary)
            if (d.sub_topics && d.sub_topics.length > 0) {
                html += `<div class="section-title">Sub-Themen</div>`;
                html += `<div class="tag-list">`;
                (d.sub_topics || []).slice(0, 20).forEach((st) => {
                    html += `<span class="tag sub-topic-tag">${escapeHtml(st.label)} <span class="count">(${st.episode_count})</span></span>`;
                });
                if (d.sub_topics.length > 20) {
                    html += `<span class="tag more-tag">+${d.sub_topics.length - 20} weitere</span>`;
                }
                html += `</div>`;
            }

            // Episodes preview
            if (d.episodes && d.episodes.length > 0) {
                html += `<div class="section-title">Episoden (${d.episodes.length})</div>`;
                html += `<ul class="episode-list">`;
                d.episodes.slice(0, 15).forEach((ep) => {
                    html += `<li><span class="ep-number">EP ${String(ep.episode_number || 0).padStart(3, "0")}</span> ${escapeHtml(ep.title)}</li>`;
                });
                if (d.episodes.length > 15) html += `<li class="more">+${d.episodes.length - 15} weitere</li>`;
                html += `</ul>`;
            }
            html += `</div>`;

        } else if (d.type === "episode") {
            // Hero header
            html += `<div class="panel-hero">`;
            html += `<span class="d-badge">Episode ${d.episode_number || "?"} · ${d.pub_date ? formatDate(d.pub_date) : ""}</span>`;
            html += `<h2>${escapeHtml(d.title || d.label)}</h2>`;
            html += `</div>`;
            html += `<div class="panel-body">`;

            if (d.summary) {
                html += `<div class="summary">${escapeHtml(d.summary)}</div>`;
            }

            // Sub-topics in this cluster (if in drill-down view)
            const clusterSubs = d._clusterSubTopics || [];
            if (clusterSubs.length > 0) {
                html += `<div class="section-title">Themen in „${escapeHtml(activeCluster ? activeCluster.label : "")}"</div>`;
                html += `<div class="tag-list">`;
                clusterSubs.forEach((t) => {
                    html += `<span class="tag sub-topic-tag">${escapeHtml(t)}</span>`;
                });
                html += `</div>`;
            }

            // All topics
            if (d.topics && d.topics.length > 0) {
                html += `<div class="section-title">Alle Themen</div>`;
                html += `<div class="tag-list">`;
                d.topics.forEach((t) => {
                    html += `<span class="tag sub-topic-tag">${escapeHtml(t)}</span>`;
                });
                html += `</div>`;
            }

            // Similar episodes (share sub-topics in this cluster)
            if (viewMode === "detail" && activeCluster) {
                const similar = getSimilarEpisodes(d);
                if (similar.length > 0) {
                    html += `<div class="section-title">Ähnliche Episoden</div>`;
                    html += `<ul class="episode-list">`;
                    similar.slice(0, 15).forEach((s) => {
                        const shared = s.sharedTopics.slice(0, 3).join(", ");
                        html += `<li data-id="${escapeAttr(s.node.id)}"><span class="ep-number">EP ${String(s.node.episode_number || 0).padStart(3, "0")}</span> ${escapeHtml(s.node.title || s.node.label)} <span class="count">(${s.count} gemeinsame${shared ? ": " + shared : ""})</span></li>`;
                    });
                    html += `</ul>`;
                }
            }
            html += `</div>`;
        }

        panelContent.innerHTML = html;
        panel.classList.remove("hidden");

        // Wire drill button
        const drillBtn = panelContent.querySelector(".btn-drill");
        if (drillBtn) {
            drillBtn.addEventListener("click", () => {
                const node = graphData._nodeMap.get(drillBtn.dataset.clusterId);
                if (node) drillInto(node);
            });
        }

        // Wire related cluster clicks
        panelContent.querySelectorAll("[data-id]").forEach((el) => {
            el.addEventListener("click", () => {
                const targetNode = graphData._nodeMap.get(el.dataset.id);
                if (targetNode) {
                    selectedNode = targetNode;
                    highlightNode(targetNode);
                    showPanel(targetNode);
                    zoomToNode(targetNode);
                }
            });
        });
    }

    function closePanel() {
        panel.classList.add("hidden");
    }

    // ── Search ──
    function onSearch() {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 2) {
            hideSearchResults();
            if (viewMode === "clusters") clearHighlight();
            return;
        }

        const matches = graphData.search_index.filter((item) => {
            const haystack = (item.label + " " + (item.summary || "") + " " + (item.parent_label || "") + " " + ((item.sub_topics || []).join(" "))).toLowerCase();
            return haystack.includes(query);
        });

        // Sort: clusters first, then sub_topics, then episodes
        const typeOrder = { cluster: 0, sub_topic: 1, episode: 2 };
        matches.sort((a, b) => {
            const ta = typeOrder[a.type] ?? 3;
            const tb = typeOrder[b.type] ?? 3;
            if (ta !== tb) return ta - tb;
            const aStart = a.label.toLowerCase().startsWith(query) ? 0 : 1;
            const bStart = b.label.toLowerCase().startsWith(query) ? 0 : 1;
            return aStart - bStart;
        });

        if (matches.length === 0) {
            searchResults.innerHTML = `<div class="search-item"><span class="label" style="color:var(--text-dim)">Keine Ergebnisse</span></div>`;
            searchResults.classList.add("visible");
            return;
        }

        searchResults.innerHTML = matches
            .slice(0, 25)
            .map((m) => {
                let badge, extra = "";
                if (m.type === "cluster") {
                    badge = `<span class="badge topic">Thema</span>`;
                    extra = `<span class="count">${m.episode_count} Ep.</span>`;
                } else if (m.type === "sub_topic") {
                    badge = `<span class="badge sub-topic">Sub</span>`;
                    extra = `<span class="count">${m.parent_label}</span>`;
                } else {
                    badge = `<span class="badge episode">Ep</span>`;
                }
                return `<div class="search-item" data-id="${escapeAttr(m.id)}">${badge}<span class="label">${escapeHtml(m.label)}</span>${extra}</div>`;
            })
            .join("");

        searchResults.classList.add("visible");

        // Wire click
        searchResults.querySelectorAll(".search-item[data-id]").forEach((el) => {
            el.addEventListener("click", () => {
                const id = el.dataset.id;

                // If it's a cluster, navigate to it in L1 view
                const node = graphData._nodeMap.get(id);
                if (node && viewMode === "clusters") {
                    selectedNode = node;
                    highlightNode(node);
                    showPanel(node);
                    zoomToNode(node);
                } else if (node && viewMode === "detail") {
                    // Switch back to clusters then highlight
                    renderClusters();
                    // Need to wait for positions after simulation
                    setTimeout(() => {
                        selectedNode = node;
                        highlightNode(node);
                        showPanel(node);
                        zoomToNode(node);
                    }, 500);
                }

                hideSearchResults();
                searchInput.value = "";
            });
        });

        // Highlight matching cluster nodes in L1 view
        if (viewMode === "clusters") {
            const matchIds = new Set(matches.map((m) => m.id));
            nodeGroup.selectAll("circle")
                .attr("opacity", (n) => matchIds.has(n.id) ? 1 : 0.1);
            labelGroup.selectAll("text")
                .attr("opacity", (n) => matchIds.has(n.id) ? 1 : 0.05);
        }
    }

    function hideSearchResults() {
        searchResults.classList.remove("visible");
    }

    // ── Reset ──
    function onReset() {
        selectedNode = null;
        clearHighlight();
        closePanel();
        searchInput.value = "";
        hideSearchResults();

        if (viewMode === "detail") {
            renderClusters();
        } else {
            const container = document.getElementById("graph-container");
            svg.transition().duration(500)
                .call(zoom.transform, d3.zoomIdentity);
        }
    }

    // ── Helpers ──
    function getConnectedIds(nodeId) {
        const ids = new Set();
        (graphData._activeEdges || []).forEach((e) => {
            if (e.source.id === nodeId) ids.add(e.target.id);
            if (e.target.id === nodeId) ids.add(e.source.id);
        });
        return ids;
    }

    function getRelatedClusters(clusterId) {
        const related = [];
        (graphData._activeEdges || []).forEach((e) => {
            if (e.type !== "similarity") return;
            if (e.source.id === clusterId) {
                related.push({ id: e.target.id, label: e.target.label, weight: e.weight || 0 });
            } else if (e.target.id === clusterId) {
                related.push({ id: e.source.id, label: e.source.label, weight: e.weight || 0 });
            }
        });
        related.sort((a, b) => b.weight - a.weight);
        return related.slice(0, 12);
    }

    function getSimilarEpisodes(epNode) {
        const similar = [];
        const myTopics = new Set(epNode._clusterSubTopics || []);
        (graphData._activeEdges || []).forEach((e) => {
            if (e.type !== "similarity") return;
            let other = null;
            if (e.source.id === epNode.id) other = e.target;
            else if (e.target.id === epNode.id) other = e.source;
            if (!other || other.type !== "episode") return;
            const otherTopics = other._clusterSubTopics || [];
            const shared = otherTopics.filter((t) => myTopics.has(t));
            similar.push({ node: other, count: shared.length, sharedTopics: shared });
        });
        similar.sort((a, b) => b.count - a.count);
        return similar;
    }

    function highlightNode(d) {
        const connected = getConnectedIds(d.id);
        connected.add(d.id);

        nodeGroup.selectAll("circle")
            .attr("opacity", (n) => connected.has(n.id) ? 1 : 0.12)
            .attr("stroke-opacity", (n) => n.id === d.id ? 1 : (connected.has(n.id) ? 0.6 : 0.1));
        linkGroup.selectAll("line")
            .attr("opacity", (l) => (l.source.id === d.id || l.target.id === d.id) ? 0.8 : 0.03);
        labelGroup.selectAll("text")
            .attr("opacity", (n) => connected.has(n.id) ? 1 : 0.08);
    }

    function clearHighlight() {
        nodeGroup.selectAll("circle")
            .attr("opacity", 1)
            .attr("stroke-opacity", null);
        linkGroup.selectAll("line")
            .attr("opacity", 0.5);
        labelGroup.selectAll("text")
            .attr("opacity", 1);
    }

    function zoomToNode(d) {
        const container = document.getElementById("graph-container");
        const w = container.clientWidth;
        const h = container.clientHeight;
        svg.transition().duration(500)
            .call(zoom.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(1.8).translate(-d.x, -d.y));
    }

    function makeDrag(sim) {
        return d3.drag()
            .on("start", (event, d) => {
                if (!event.active) sim.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on("end", (event, d) => {
                if (!event.active) sim.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
        } catch {
            return dateStr;
        }
    }

    function truncate(str, max) {
        return str.length > max ? str.slice(0, max) + "…" : str;
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
})();
