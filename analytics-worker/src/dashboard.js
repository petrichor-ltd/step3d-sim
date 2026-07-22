export const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>STEP/3D · 使用統計</title>
  <style>
    :root{color-scheme:dark;--bg:#0b0e13;--panel:#11161e;--surface:#1c2430;--border:#2b3442;--text:#f4f7fb;--muted:#99a6b7;--soft:#6f7b8c;--accent:#f5b657;--green:#58c9ad;--danger:#ff7d8a;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 82% 0,rgba(245,182,87,.08),transparent 30%),var(--bg);color:var(--text)}
    button,input,select{font:inherit}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #86b7ff;outline-offset:2px}
    header{display:flex;align-items:center;justify-content:space-between;min-height:70px;padding:0 clamp(20px,4vw,56px);border-bottom:1px solid var(--border)}
    .brand{display:flex;align-items:center;gap:11px;font-size:13px;font-weight:760;letter-spacing:.1em}.mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid #566273;border-radius:9px;color:var(--accent);background:#151b24;font:750 9px/1 ui-monospace,monospace}
    .privacy{display:flex;align-items:center;gap:7px;color:#a7d7cc;font-size:11px}.privacy i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 11px rgba(88,201,173,.6)}
    main{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:48px 0 70px}.eyebrow{margin:0;color:var(--soft);font-size:10px;font-weight:750;letter-spacing:.15em}.title-row{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}.title-row h1{margin:8px 0 0;font-size:clamp(31px,4vw,52px);letter-spacing:-.04em}.title-row p:last-child{max-width:520px;margin:0;color:var(--muted);font-size:12px;line-height:1.7}
    .login{display:grid;grid-template-columns:minmax(210px,1fr) 130px auto;gap:10px;margin-bottom:22px;padding:14px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
    input,select{min-height:42px;padding:0 12px;color:var(--text);border:1px solid var(--border);border-radius:8px;background:#0d1117}button{min-height:42px;padding:0 17px;color:#10141a;border:1px solid var(--accent);border-radius:8px;background:var(--accent);font-weight:750;cursor:pointer}button:hover{background:#ffcb7c}.error{margin:0 0 18px;padding:10px 12px;color:#ffd1d5;border:1px solid rgba(255,125,138,.35);border-radius:8px;background:rgba(255,125,138,.07);font-size:11px}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card,.panel{border:1px solid var(--border);border-radius:13px;background:var(--panel)}.card{padding:18px}.card span{color:var(--soft);font-size:10px}.card strong{display:block;margin-top:10px;font:700 29px/1 ui-monospace,monospace}.card small{display:block;margin-top:8px;color:var(--muted);font-size:9px}.card.good strong{color:#81dac5}.card.bad strong{color:#ff9ba5}
    .grid{display:grid;grid-template-columns:1fr 1.35fr;gap:14px;margin-top:14px}.panel{padding:20px}.panel h2{margin:5px 0 17px;font-size:16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:10px 7px;border-bottom:1px solid var(--border);text-align:right}th:first-child,td:first-child{text-align:left}th{color:var(--soft);font-size:9px;text-transform:uppercase}.daily{display:grid;gap:9px}.day{display:grid;grid-template-columns:76px minmax(80px,1fr) 46px 46px;gap:9px;align-items:center;color:var(--muted);font:10px/1 ui-monospace,monospace}.bar{height:7px;overflow:hidden;border-radius:99px;background:#202835}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),#ffcf84)}.empty{padding:28px;color:var(--muted);text-align:center;font-size:11px}
    .footnote{margin:18px 3px 0;color:var(--soft);font-size:10px;line-height:1.6}
    [hidden]{display:none!important}@media(max-width:800px){.title-row{display:block}.title-row p:last-child{margin-top:13px}.login{grid-template-columns:1fr}.cards{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}}@media(max-width:480px){header{padding:0 15px}.privacy{display:none}.cards{grid-template-columns:1fr}.day{grid-template-columns:67px minmax(60px,1fr) 38px 38px}}
  </style>
</head>
<body>
  <header><div class="brand"><span class="mark">S3</span><span>STEP/3D</span></div><span class="privacy"><i></i>不儲存模型內容</span></header>
  <main>
    <div class="title-row"><div><p class="eyebrow">PRIVATE USAGE DASHBOARD</p><h1>匿名使用統計</h1></div><p>查看瀏覽、成功開啟模型與 STEP schema 相容性。管理 token 只在單次請求期間存在於分頁記憶體，不會寫入瀏覽器儲存空間。</p></div>
    <form class="login" id="login"><input id="token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="輸入 ADMIN_TOKEN" aria-label="管理 token"><select id="days" aria-label="統計期間"><option value="7">最近 7 天</option><option value="30" selected>最近 30 天</option><option value="90">最近 90 天</option><option value="180">最近 180 天</option></select><button type="submit">載入統計</button></form>
    <p class="error" id="error" hidden></p>
    <section id="results" hidden>
      <div class="cards">
        <article class="card"><span>訪客（日去重）</span><strong id="visitors">0</strong><small>每日以匿名 hash 去重</small></article>
        <article class="card"><span>瀏覽 session</span><strong id="views">0</strong><small>每個分頁 session 計一次</small></article>
        <article class="card good"><span>成功開啟模型</span><strong id="opened">0</strong><small>同 session／schema 去重</small></article>
        <article class="card bad"><span>開啟失敗</span><strong id="failed">0</strong><small>只記錄錯誤分類</small></article>
      </div>
      <div class="grid">
        <article class="panel"><p class="eyebrow">COMPATIBILITY</p><h2>STEP schema</h2><table><thead><tr><th>Schema</th><th>成功</th><th>失敗</th></tr></thead><tbody id="schemas"></tbody></table></article>
        <article class="panel"><p class="eyebrow">DAILY ACTIVITY</p><h2>每日使用</h2><div class="daily" id="daily"></div></article>
      </div>
      <p class="footnote">系統不接收 ZIP、STEP、檔名、零件名稱、幾何尺寸或來源 hash。訪客識別以每日輪替的 salted hash 計算，保留最多 180 天。</p>
    </section>
  </main>
  <script>
    const form=document.getElementById('login'),error=document.getElementById('error'),results=document.getElementById('results');
    const number=new Intl.NumberFormat('zh-Hant');
    form.addEventListener('submit',async(event)=>{event.preventDefault();error.hidden=true;results.hidden=true;const tokenField=document.getElementById('token');const token=tokenField.value;tokenField.value='';const days=document.getElementById('days').value;if(!token)return;try{const response=await fetch('/v1/stats?days='+encodeURIComponent(days),{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error(response.status===401?'管理 token 不正確':'無法載入統計');const data=await response.json();document.getElementById('visitors').textContent=number.format(data.summary.dailyUniqueVisitors||0);document.getElementById('views').textContent=number.format(data.summary.pageViews||0);document.getElementById('opened').textContent=number.format(data.summary.modelOpened||0);document.getElementById('failed').textContent=number.format(data.summary.modelFailed||0);renderSchemas(data.schemas);renderDaily(data.daily);results.hidden=false}catch(reason){error.textContent=reason.message||'無法載入統計';error.hidden=false;}});
    function renderSchemas(rows){const body=document.getElementById('schemas');body.replaceChildren(...rows.map(row=>{const tr=document.createElement('tr');[row.schema,number.format(row.opened||0),number.format(row.failed||0)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td)});return tr}));if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.className='empty';td.textContent='尚無模型資料';tr.append(td);body.append(tr)}}
    function renderDaily(rows){const root=document.getElementById('daily'),max=Math.max(1,...rows.map(row=>row.pageViews||0));root.replaceChildren(...rows.map(row=>{const line=document.createElement('div');line.className='day';const date=document.createElement('span');date.textContent=row.day;const bar=document.createElement('span');bar.className='bar';const fill=document.createElement('i');fill.style.width=Math.max(3,(row.pageViews||0)/max*100)+'%';bar.append(fill);const opened=document.createElement('span');opened.textContent='✓'+(row.modelOpened||0);const failed=document.createElement('span');failed.textContent='×'+(row.modelFailed||0);line.append(date,bar,opened,failed);return line}));if(!rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='尚無每日資料';root.append(empty)}}
  </script>
</body>
</html>`;
