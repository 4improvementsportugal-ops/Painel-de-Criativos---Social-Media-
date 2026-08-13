const STATUS_CYCLE = ["A produzir","Produzido","Agendado","Publicado"];
const STAGE_VAR = {"A produzir":"--stage-1","Produzido":"--stage-2","Agendado":"--stage-3","Publicado":"--stage-4"};
const CLIENT_COLOR_VARS = ["--c-blue","--c-orange","--c-aqua","--c-yellow","--c-magenta","--c-green","--c-red"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function parseDate(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function daysBetween(a,b){ return Math.round((a-b)/(1000*60*60*24)); }
function fmtShort(s){ const d=parseDate(s); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`; }
function toISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function cssEscape(s){ return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }

// "hoje" real, calculado no navegador de quem estiver vendo o painel
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const todayStr = toISO(today);

// ---- estado (populado a partir do Supabase em loadData()) ----
let state = [];           // linhas de criativos: {id, cliente, cliente_id, data, status}
let clientesInfo = [];    // {id, nome, cota}
let clientNames = [];
const clientColor = {};
let activeFilter = new Set();
const clientItemFilter = {}; // por cliente: "Todos" | "A produzir" | "Produzido" | "Agendado" | "Publicado"

const rootEl = document.querySelector(".viz-root");

function showStatus(msg, isError){
  let bar = document.getElementById("loadStatus");
  if(!bar){
    bar = document.createElement("div");
    bar.id = "loadStatus";
    bar.style.cssText = "padding:10px 16px;border-radius:10px;margin-bottom:14px;font-size:13px;";
    rootEl.insertBefore(bar, rootEl.firstChild);
  }
  bar.textContent = msg;
  bar.style.background = isError ? "#fde3e3" : "#eef0ff";
  bar.style.color = isError ? "#a02323" : "#3a3a6a";
  bar.style.display = msg ? "block" : "none";
}

async function loadData(){
  showStatus("Carregando dados...", false);
  const [{ data: clientesRows, error: e1 }, { data: criativosRows, error: e2 }] = await Promise.all([
    supabaseClient.from("dashboard_clientes").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("dashboard_criativos").select("*"),
  ]);
  if(e1 || e2){
    console.error(e1, e2);
    showStatus("Não foi possível carregar os dados do Supabase. Verifique sua conexão e recarregue a página.", true);
    return false;
  }
  const idToName = {};
  clientesRows.forEach(c=> idToName[c.id] = c.nome);
  clientesInfo = clientesRows.map(c=> ({ id: c.id, nome: c.nome, cota: c.cota }));
  clientNames = clientesInfo.map(c=> c.nome);
  clientNames.forEach((n,i)=> clientColor[n] = CLIENT_COLOR_VARS[i % CLIENT_COLOR_VARS.length]);
  clientNames.forEach(n=>{ if(!(n in clientItemFilter)) clientItemFilter[n] = "Todos"; });
  if(activeFilter.size === 0) activeFilter = new Set(clientNames);

  state = criativosRows
    .map(r=> ({ id: r.id, cliente: idToName[r.cliente_id], cliente_id: r.cliente_id, data: r.data, status: r.status }))
    .filter(r=> r.cliente); // ignora linhas orfas, se houver

  showStatus("", false);
  return true;
}

function byClientMap(){
  const map = {};
  clientNames.forEach(n=>{
    const info = clientesInfo.find(c=>c.nome===n);
    map[n] = { nome:n, id: info.id, cota: info.cota, rows: [] };
  });
  state.forEach(r=> { if(map[r.cliente]) map[r.cliente].rows.push(r); });
  Object.values(map).forEach(c=> c.rows.sort((a,b)=> a.data.localeCompare(b.data)));
  return map;
}

function analyze(client){
  const rows = client.rows;
  const overdue = rows.filter(r => parseDate(r.data) < today && r.status === "A produzir");
  const upcoming = rows.filter(r => parseDate(r.data) >= today);
  let gapIdx = upcoming.findIndex(r => r.status === "A produzir");
  const buffer = gapIdx === -1 ? upcoming.length : gapIdx;
  const gapRow = gapIdx === -1 ? null : upcoming[gapIdx];
  const daysUntilGap = gapRow ? daysBetween(parseDate(gapRow.data), today) : null;
  let level, msg;
  if(overdue.length > 0){
    level = "atrasado";
    msg = `${overdue.length} data${overdue.length>1?"s":""} vencida${overdue.length>1?"s":""} sem produção (${fmtShort(overdue[0].data)}). Prioridade máxima.`;
  } else if(daysUntilGap !== null && daysUntilGap <= 1){
    level = "critico";
    msg = daysUntilGap === 0 ? `Publica hoje e o criativo não está pronto.` : `Falta ${daysUntilGap} dia para publicar (${fmtShort(gapRow.data)}) — produzir hoje.`;
  } else if(daysUntilGap !== null && daysUntilGap <= 3){
    level = "atencao";
    msg = `Faltam ${daysUntilGap} dias até a próxima publicação sem conteúdo pronto (${fmtShort(gapRow.data)}).`;
  } else if(daysUntilGap === null){
    level = "em_dia";
    msg = `Cota do ciclo inteira coberta.`;
  } else {
    level = "em_dia";
    msg = `${buffer} pronto${buffer>1?"s":""} à frente — folga de ${daysUntilGap} dias.`;
  }
  return { ...client, overdue, buffer, daysUntilGap, level, msg };
}

const LEVEL_RANK = { atrasado:0, critico:1, atencao:2, em_dia:3 };
const LEVEL_LABEL = { atrasado:"Atrasado", critico:"Crítico", atencao:"Atenção", em_dia:"Em dia" };
const LEVEL_VAR = { atrasado:"--critical", critico:"--serious", atencao:"--warning", em_dia:"--good" };

function render(){
  const byClient = byClientMap();
  const analyzed = clientNames.map(n=> analyze(byClient[n])).sort((a,b)=>{
    const r = LEVEL_RANK[a.level]-LEVEL_RANK[b.level];
    if(r!==0) return r;
    const da=a.daysUntilGap===null?999:a.daysUntilGap, db=b.daysUntilGap===null?999:b.daysUntilGap;
    return da-db;
  });

  // ---- filters ----
  const filters = document.getElementById("filters");
  filters.innerHTML = "";
  const allChip = document.createElement("div");
  allChip.className = "chip all" + (activeFilter.size===clientNames.length ? " active" : "");
  allChip.textContent = "Todos";
  allChip.onclick = ()=>{ activeFilter = new Set(clientNames); render(); };
  filters.appendChild(allChip);
  clientNames.forEach(n=>{
    const c = document.createElement("div");
    c.className = "chip" + (activeFilter.has(n) ? " active" : "");
    c.innerHTML = `<span class="dot" style="background:var(${clientColor[n]})"></span>${n}`;
    c.onclick = ()=>{
      // selecao unica: clicar num cliente isola ele; clicar de novo no unico ativo volta para "Todos"
      if(activeFilter.size===1 && activeFilter.has(n)){ activeFilter = new Set(clientNames); }
      else { activeFilter = new Set([n]); }
      render();
    };
    filters.appendChild(c);
  });

  const visibleRows = state.filter(r=> activeFilter.has(r.cliente));
  const visibleClients = analyzed.filter(c=> activeFilter.has(c.nome));

  // ---- stats ----
  const totals = { "Publicado":0, "Agendado":0, "Produzido":0, "A produzir":0 };
  visibleRows.forEach(r=> totals[r.status]++);
  const totalCota = visibleClients.reduce((s,c)=>s+c.cota,0);
  const prontos = totals["Produzido"]+totals["Agendado"]+totals["Publicado"];
  const statRow = document.getElementById("statRow");
  statRow.innerHTML = "";
  [
    {label:"Cota do ciclo", value: totalCota},
    {label:"Prontos (produzido/agend./public.)", value: prontos},
    {label:"A produzir", value: totals["A produzir"]},
    {label:"Clientes em alerta", value: visibleClients.filter(c=>c.level==="atrasado"||c.level==="critico").length},
  ].forEach(t=>{
    const div = document.createElement("div");
    div.className = "stat-tile";
    div.innerHTML = `<div class="label">${t.label}</div><div class="value">${t.value}</div>`;
    statRow.appendChild(div);
  });

  document.getElementById("subtitle").textContent = `Hoje: ${fmtShort(todayStr)}/${today.getFullYear()}`;

  // ---- resumo hoje / semana ----
  const urgentClients = visibleClients.filter(c=> c.level==="atrasado" || c.level==="critico");
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate()+6);
  const weekPending = visibleRows.filter(r=>{
    const d = parseDate(r.data);
    return r.status==="A produzir" && d>=today && d<=weekEnd;
  });
  const weekClientCount = new Set(weekPending.map(r=>r.cliente)).size;
  const todayBanner = document.getElementById("todayBanner");
  const hojeHtml = urgentClients.length
    ? `<span class="flag critical"></span>Produzir hoje: <b>${urgentClients.map(c=>c.nome).join(", ")}</b>`
    : `<span class="flag good"></span><b>Nenhum cliente urgente</b> hoje`;
  const semanaHtml = weekPending.length
    ? `Essa semana: <b>${weekPending.length} conteúdo${weekPending.length>1?"s":""}</b> sem produção, em <b>${weekClientCount} cliente${weekClientCount>1?"s":""}</b>`
    : `Essa semana: tudo pronto`;
  todayBanner.innerHTML = `${hojeHtml}<span class="sep">·</span>${semanaHtml}`;

  // ---- fila de prioridade de producao ----
  // considera apenas itens "A produzir"; Produzido/Agendado/Publicado contam como prontos.
  // reaproveita a mesma ordem de urgencia de `visibleClients` (atrasado > critico > atencao > em_dia,
  // com desempate pela proxima data pendente), filtrando so quem ainda tem pendencia.
  const queueClients = visibleClients
    .map(c=>{
      const pending = c.rows.filter(r=> r.status === "A produzir").sort((a,b)=> a.data.localeCompare(b.data));
      return { nome: c.nome, pending };
    })
    .filter(c=> c.pending.length > 0);

  const queueSummary = document.getElementById("queueSummary");
  const totalPendingCount = queueClients.reduce((s,c)=> s + c.pending.length, 0);
  queueSummary.innerHTML = queueClients.length
    ? `<b>${totalPendingCount}</b> criativo${totalPendingCount>1?"s":""} pendente${totalPendingCount>1?"s":""} em <b>${queueClients.length}</b> cliente${queueClients.length>1?"s":""}`
    : `Tudo em dia`;

  const queueGrid = document.getElementById("queueGrid");
  queueGrid.innerHTML = "";
  if(queueClients.length === 0){
    queueGrid.innerHTML = `<div class="queue-empty">Não há criativos pendentes para este ciclo.</div>`;
  } else {
    queueClients.forEach((c, idx)=>{
      const next = c.pending[0];
      const diff = daysBetween(parseDate(next.data), today);
      let statusLabel, statusCls;
      if(diff < 0){ statusLabel = "Data vencida"; statusCls = "critical"; }
      else if(diff === 0){ statusLabel = "Publica hoje"; statusCls = "critical"; }
      else if(diff <= 3){ statusLabel = `Faltam ${diff} dia${diff>1?"s":""}`; statusCls = "warning"; }
      else { statusLabel = `Faltam ${diff} dia${diff>1?"s":""}`; statusCls = "neutral"; }
      const card = document.createElement("div");
      card.className = "queue-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.innerHTML = `
        <div class="queue-rank">${idx+1}</div>
        <div class="queue-body">
          <div class="queue-top">
            <span class="dot" style="background:var(${clientColor[c.nome]})"></span>
            <span class="queue-name">${c.nome}</span>
          </div>
          <div class="queue-meta">
            <span>Próxima pendência: ${fmtShort(next.data)}</span>
            <span class="queue-status ${statusCls}">${statusLabel}</span>
          </div>
          <div class="queue-count">${c.pending.length} item${c.pending.length>1?"s":""} a produzir</div>
        </div>
        <div class="queue-arrow">→</div>
      `;
      const goToClient = ()=>{
        activeFilter = new Set([c.nome]);
        render();
        requestAnimationFrame(()=>{
          const target = document.querySelector(`.client-card[data-client-name="${cssEscape(c.nome)}"]`);
          if(target) target.scrollIntoView({ behavior:"smooth", block:"start" });
        });
      };
      card.addEventListener("click", goToClient);
      card.addEventListener("keydown", (e)=>{ if(e.key==="Enter" || e.key===" "){ e.preventDefault(); goToClient(); } });
      queueGrid.appendChild(card);
    });
  }

  // ---- calendario (mes atual, calculado a partir de "hoje") ----
  const calGrid = document.getElementById("calGrid");
  const year = today.getFullYear(), month = today.getMonth();
  document.getElementById("calTitle").textContent = `${MONTH_NAMES[month]} ${year}`;
  calGrid.innerHTML = "";
  ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].forEach(d=>{
    const h = document.createElement("div"); h.className="cal-dow"; h.textContent=d; calGrid.appendChild(h);
  });
  const firstOfMonth = new Date(year, month, 1);
  let startOffset = firstOfMonth.getDay() - 1; // Mon=0
  if(startOffset < 0) startOffset = 6;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthPrefix = `${year}-${String(month+1).padStart(2,"0")}`;
  for(let i=0;i<startOffset;i++){ const e=document.createElement("div"); e.className="cal-cell empty"; calGrid.appendChild(e); }
  for(let day=1; day<=daysInMonth; day++){
    const iso = `${monthPrefix}-${String(day).padStart(2,"0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-cell" + (iso===todayStr ? " today" : "");
    const posts = visibleRows.filter(r=> r.data===iso);
    let postsHtml = "";
    posts.slice(0,3).forEach(p=>{
      postsHtml += `<div class="cal-post" title="${p.cliente} — ${p.status}"><span class="dot" style="background:var(${clientColor[p.cliente]})"></span><span class="name">${p.cliente}</span></div>`;
    });
    if(posts.length>3) postsHtml += `<div class="cal-more">+${posts.length-3}</div>`;
    // marca o dia se tiver conteudo pendente vencido ou perto da data (<=3 dias)
    const pendingHere = posts.filter(p=> p.status==="A produzir");
    let flag = "";
    if(pendingHere.length){
      const diff = daysBetween(parseDate(iso), today);
      if(diff <= 0) flag = `<span class="cal-flag critical" title="Conteúdo pendente vencido ou é hoje"></span>`;
      else if(diff <= 3) flag = `<span class="cal-flag warning" title="Conteúdo pendente perto da data"></span>`;
    }
    cell.innerHTML = `<div class="cal-daynum">${day}${flag}</div><div class="cal-posts">${postsHtml}</div>`;
    calGrid.appendChild(cell);
  }

  // faixa de overflow: conteudos depois do mes atual
  const monthEndIso = `${monthPrefix}-${String(daysInMonth).padStart(2,"0")}`;
  const overflowRows = visibleRows.filter(r=> r.data > monthEndIso).sort((a,b)=>a.data.localeCompare(b.data));
  const septStrip = document.getElementById("septStrip");
  if(overflowRows.length){
    const nextMonthName = MONTH_NAMES[(month+1)%12];
    septStrip.innerHTML = `<div class="lbl">Início de ${nextMonthName}</div><div class="sept-row">${overflowRows.map(r=>
      `<div class="sept-item"><span class="dot" style="background:var(${clientColor[r.cliente]})"></span>${fmtShort(r.data)} · ${r.cliente}</div>`
    ).join("")}</div>`;
  } else { septStrip.innerHTML = ""; }

  // calendar legend = client colors
  const calLegend = document.getElementById("calLegend");
  calLegend.innerHTML = clientNames.map(n=>
    `<div class="item"><span class="sw" style="background:var(${clientColor[n]});border-radius:50%;width:9px;height:9px;"></span>${n}</div>`
  ).join("");

  // ---- client cards ----
  const clientGrid = document.getElementById("clientGrid");
  clientGrid.innerHTML = "";
  analyzed.forEach(c=>{
    const dim = !activeFilter.has(c.nome);
    const card = document.createElement("div");
    card.className = "client-card" + (dim ? " dim" : "");
    card.setAttribute("data-client-name", c.nome);
    const stageCounts = {"A produzir":0,"Produzido":0,"Agendado":0,"Publicado":0};
    c.rows.forEach(r=> stageCounts[r.status]++);
    const bar = STATUS_CYCLE.map(s=>{
      const pct = (stageCounts[s]/c.cota*100).toFixed(2);
      return `<span style="width:${pct}%;background:var(${STAGE_VAR[s]})"></span>`;
    }).join("");
    const curFilter = clientItemFilter[c.nome] || "Todos";
    const filterChips = ["Todos", ...STATUS_CYCLE].map(s=>{
      const count = s==="Todos" ? c.cota : stageCounts[s];
      const isActive = curFilter===s;
      return `<div class="mini-chip ${isActive?'active':''}" data-cliente="${c.nome}" data-filter="${s}">${s} <span class="n">${count}</span></div>`;
    }).join("");
    const shownRows = curFilter==="Todos" ? c.rows : c.rows.filter(r=> r.status===curFilter);
    const items = shownRows.map(r=>{
      const isToday = r.data === todayStr;
      const isPending = r.status === "A produzir";
      const cls = isPending ? "pending" : "done";
      const style = isPending
        ? (isToday ? 'border-color:var(--accent);color:var(--accent);' : '')
        : `background:var(${STAGE_VAR[r.status]});${isToday?'box-shadow:0 0 0 2px var(--accent);':''}`;
      const dot = isPending ? `<span class="sw" style="background:var(--text-muted)"></span>` : "";
      return `<div class="item-chip ${cls}" data-id="${r.id}" title="Clique para avançar o status" style="${style}">
        ${dot}${fmtShort(r.data)} · ${r.status}
      </div>`;
    }).join("");
    card.innerHTML = `
      <div class="client-head">
        <div>
          <div class="client-name"><span class="dot" style="background:var(${clientColor[c.nome]})"></span>${c.nome}</div>
          <div class="client-sub">
            <span class="cota-label">${c.cota} conteúdos no ciclo</span>
            <button class="cota-edit-btn" data-cliente-id="${c.id}" data-cliente="${c.nome}" type="button">editar cota</button>
          </div>
        </div>
        <div class="badge ${c.level}"><span class="dot" style="background:var(${LEVEL_VAR[c.level]})"></span>${LEVEL_LABEL[c.level]}</div>
      </div>
      <div class="stage-bar">${bar}</div>
      <div class="client-msg">${c.msg}</div>
      <div class="mini-filters">${filterChips}</div>
      <div class="item-list">${items || '<div class="empty-note">Nenhum conteúdo neste status ainda.</div>'}</div>
      <div class="item-hint">Clique num item para avançar o status (a produzir → produzido → agendado → publicado)</div>
      <div class="add-date-row">
        <input type="date" class="add-date-input" data-cliente-id="${c.id}">
        <button class="btn add-date-btn" data-cliente-id="${c.id}" data-cliente="${c.nome}" type="button">+ Adicionar data</button>
      </div>
      <div class="add-date-msg" data-cliente-id="${c.id}"></div>
    `;
    clientGrid.appendChild(card);
  });

  clientGrid.querySelectorAll(".mini-chip").forEach(el=>{
    el.addEventListener("click", ()=>{
      const cliente = el.getAttribute("data-cliente");
      clientItemFilter[cliente] = el.getAttribute("data-filter");
      render();
    });
  });

  // wire up click-to-cycle (grava no Supabase, com atualizacao otimista)
  clientGrid.querySelectorAll(".item-chip").forEach(el=>{
    el.addEventListener("click", ()=> onItemClick(el.getAttribute("data-id")));
  });

  // editar cota do cliente
  clientGrid.querySelectorAll(".cota-edit-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> startCotaEdit(btn));
  });

  // adicionar nova data de publicação a um cliente existente
  clientGrid.querySelectorAll(".add-date-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> onAddDate(btn.getAttribute("data-cliente-id")));
  });

  document.getElementById("footerNote").innerHTML =
    `Regra de antecedência: um criativo entra em alerta quando faltam 3 dias ou menos até a publicação e ainda não está pronto; com 1 dia ou menos, ou data vencida, o cliente vai para o topo da prioridade.<br>
     Edição: clique nos itens de cada cliente para atualizar o status. As alterações são salvas automaticamente e ficam visíveis para todos que abrirem o painel.`;
}

async function onItemClick(id){
  const row = state.find(r=> r.id === id);
  if(!row) return;
  const previousStatus = row.status;
  const idx = STATUS_CYCLE.indexOf(row.status);
  const nextStatus = STATUS_CYCLE[(idx+1) % STATUS_CYCLE.length];

  // atualizacao otimista: atualiza a tela na hora
  row.status = nextStatus;
  render();

  const { error } = await supabaseClient
    .from("dashboard_criativos")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if(error){
    console.error(error);
    // rollback se a gravacao falhar
    row.status = previousStatus;
    render();
    showStatus("Não foi possível salvar essa alteração. Verifique sua conexão e tente novamente.", true);
    setTimeout(()=> showStatus("", false), 4000);
  }
}

function startCotaEdit(btn){
  const clienteId = btn.getAttribute("data-cliente-id");
  const sub = btn.closest(".client-sub");
  const info = clientesInfo.find(c=> c.id === clienteId);
  if(!info) return;
  sub.innerHTML = `<input type="number" min="0" class="cota-input" value="${info.cota}"> <button class="cota-edit-btn" type="button">salvar</button>`;
  const input = sub.querySelector(".cota-input");
  const saveBtn = sub.querySelector(".cota-edit-btn");
  input.focus(); input.select();
  const commit = ()=> saveCota(clienteId, input.value);
  saveBtn.addEventListener("click", commit);
  input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") render(); });
}

async function saveCota(clienteId, rawValue){
  const value = parseInt(rawValue, 10);
  if(!Number.isFinite(value) || value < 0){ render(); return; }
  const info = clientesInfo.find(c=> c.id === clienteId);
  if(info) info.cota = value; // atualizacao otimista
  render();
  const { error } = await supabaseClient.from("dashboard_clientes").update({ cota: value }).eq("id", clienteId);
  if(error){
    console.error(error);
    showStatus("Não foi possível salvar a cota. Tente novamente.", true);
    setTimeout(()=> showStatus("", false), 4000);
    await loadData(); render();
  }
}

async function onAddDate(clienteId){
  const input = document.querySelector(`.add-date-input[data-cliente-id="${clienteId}"]`);
  const msgEl = document.querySelector(`.add-date-msg[data-cliente-id="${clienteId}"]`);
  const dateVal = input ? input.value : "";
  if(msgEl) msgEl.textContent = "";
  if(!dateVal){
    if(msgEl) msgEl.textContent = "Escolha uma data primeiro.";
    return;
  }
  const info = clientesInfo.find(c=> c.id === clienteId);
  const dupe = state.some(r=> r.cliente_id === clienteId && r.data === dateVal);
  if(dupe){
    if(msgEl) msgEl.textContent = "Esse cliente já tem uma data igual a essa.";
    return;
  }
  const { data: inserted, error } = await supabaseClient
    .from("dashboard_criativos")
    .insert({ cliente_id: clienteId, data: dateVal, status: "A produzir" })
    .select();
  if(error){
    console.error(error);
    if(msgEl) msgEl.textContent = "Não foi possível salvar essa data. Tente novamente.";
    return;
  }
  // mantem a cota consistente com o total de datas cadastradas
  if(info){
    const newCota = info.cota + 1;
    info.cota = newCota;
    await supabaseClient.from("dashboard_clientes").update({ cota: newCota }).eq("id", clienteId);
  }
  await loadData();
  render();
}

document.getElementById("exportBtn").addEventListener("click", ()=>{
  const payload = {
    today: todayStr,
    clientes: clientesInfo.map(c=> ({ nome: c.nome, cota: c.cota })),
    criativos: state.map(r=> ({ cliente: r.cliente, data: r.data, status: r.status })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "criativos_atualizado.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

const root = document.documentElement;
const themeBtn = document.getElementById("themeToggle");
function applyTheme(t){ root.setAttribute("data-theme", t); themeBtn.textContent = t==="dark" ? "Modo claro" : "Modo escuro"; }
applyTheme("light");
themeBtn.addEventListener("click", ()=>{
  applyTheme(root.getAttribute("data-theme")==="dark" ? "light" : "dark");
});

// ---- modal: novo cliente ----
let ncDates = [];

function renderNcDatesList(){
  const list = document.getElementById("ncDatesList");
  list.innerHTML = ncDates.map(d=>
    `<div class="new-date-chip">${fmtShort(d)}<button type="button" data-date="${d}">×</button></div>`
  ).join("");
  list.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click", ()=>{
      ncDates = ncDates.filter(x=> x !== b.getAttribute("data-date"));
      renderNcDatesList();
    });
  });
  document.getElementById("ncCotaDisplay").textContent =
    `${ncDates.length} conteúdo${ncDates.length!==1?"s":""} (baseado nas datas acima)`;
}

function openNewClientModal(){
  ncDates = [];
  document.getElementById("ncNome").value = "";
  document.getElementById("ncDateInput").value = "";
  document.getElementById("ncMsg").textContent = "";
  renderNcDatesList();
  document.getElementById("newClientModal").classList.remove("hidden");
}

function closeNewClientModal(){
  document.getElementById("newClientModal").classList.add("hidden");
}

document.getElementById("newClientBtn").addEventListener("click", openNewClientModal);
document.getElementById("ncCancelBtn").addEventListener("click", closeNewClientModal);
document.getElementById("newClientModal").addEventListener("click", (e)=>{
  if(e.target.id === "newClientModal") closeNewClientModal();
});

document.getElementById("ncAddDateBtn").addEventListener("click", ()=>{
  const inp = document.getElementById("ncDateInput");
  if(!inp.value) return;
  if(!ncDates.includes(inp.value)){ ncDates.push(inp.value); ncDates.sort(); }
  inp.value = "";
  renderNcDatesList();
});

document.getElementById("ncSaveBtn").addEventListener("click", async ()=>{
  const nome = document.getElementById("ncNome").value.trim();
  const msg = document.getElementById("ncMsg");
  msg.textContent = "";
  if(!nome){ msg.textContent = "Informe o nome do cliente."; return; }
  if(clientNames.includes(nome)){ msg.textContent = "Já existe um cliente com esse nome."; return; }
  if(ncDates.length === 0){ msg.textContent = "Adicione pelo menos uma data de publicação."; return; }

  const saveBtn = document.getElementById("ncSaveBtn");
  saveBtn.disabled = true; saveBtn.textContent = "Salvando...";

  const { data: newClient, error: e1 } = await supabaseClient
    .from("dashboard_clientes")
    .insert({ nome, cota: ncDates.length })
    .select()
    .single();

  if(e1){
    console.error(e1);
    msg.textContent = "Não foi possível criar o cliente. Tente novamente.";
    saveBtn.disabled = false; saveBtn.textContent = "Salvar cliente";
    return;
  }

  const rows = ncDates.map(d=> ({ cliente_id: newClient.id, data: d, status: "A produzir" }));
  const { error: e2 } = await supabaseClient.from("dashboard_criativos").insert(rows);

  if(e2){
    console.error(e2);
    msg.textContent = "Cliente criado, mas houve um erro ao salvar as datas. Avise para corrigirmos.";
    saveBtn.disabled = false; saveBtn.textContent = "Salvar cliente";
    return;
  }

  saveBtn.disabled = false; saveBtn.textContent = "Salvar cliente";
  closeNewClientModal();
  await loadData();
  render();
});

// ---- carregamento inicial + sincronizacao ao vivo ----
(async function init(){
  const ok = await loadData();
  if(ok) render();

  // qualquer alteracao feita por outra pessoa (em outro computador/aba) chega aqui em tempo real
  supabaseClient
    .channel("dashboard-criativos-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "dashboard_criativos" }, async ()=>{
      const stillOk = await loadData();
      if(stillOk) render();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "dashboard_clientes" }, async ()=>{
      const stillOk = await loadData();
      if(stillOk) render();
    })
    .subscribe();
})();
