// 你的灵魂小店 · 前端逻辑
// 内容全部来自 content.json；计分规则也在 content.json 里（scoring.mode === 'twoStage' 时用两阶段计分）。
(function () {
  var cfg = window.QUIZ_CONFIG || {};
  var content = null;
  var idx = 0;
  var answers = [];
  var sessionToken = null;
  var sessionKey = null;
  var demoMode = false;
  var revealed = false;
  var scratchCtx = null;
  var erasing = false;
  var lastX = 0, lastY = 0, eraseCount = 0;

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['home', 'quiz', 'result'].forEach(function (x) { $(x).classList.toggle('hidden', x !== id); });
  }
  function msg(t) { $('keyMsg').textContent = t || ''; }

  function api(path, body) {
    var base = (cfg.apiBase || '').replace(/\/$/, '');
    if (cfg.backend === 'supabase') {
      var url = (cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/validate-key';
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.supabaseAnonKey || '',
          Authorization: 'Bearer ' + (cfg.supabaseAnonKey || '')
        },
        body: JSON.stringify(body || {})
      }).then(function (r) { return r.json(); });
    }
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  function loadContent() {
    return fetch('content.json').then(function (r) { return r.json(); }).then(function (c) {
      content = c;
      document.title = c.meta.title;
      $('pageTitle').textContent = c.meta.title;
      $('pageSub').textContent = c.meta.subtitle;
      $('rDisclaimer').textContent = c.meta.disclaimer || '';
    });
  }

  function startQuiz() {
    idx = 0;
    answers = content.questions.map(function () { return -1; });
    revealed = false;
    show('quiz');
    renderQ();
  }

  function renderQ() {
    var q = content.questions[idx];
    $('bar').style.width = Math.round(idx / content.questions.length * 100) + '%';
    $('qCount').textContent = '第 ' + (idx + 1) + ' / ' + content.questions.length + ' 题';
    $('qText').textContent = q.text;
    var box = $('opts');
    box.innerHTML = '';
    q.options.forEach(function (o, i) {
      var b = document.createElement('button');
      b.className = 'opt' + (answers[idx] === i ? ' selected' : '');
      b.textContent = o.text;
      b.onclick = function () {
        answers[idx] = i;
        renderQ();
      };
      box.appendChild(b);
    });
    $('prevBtn').disabled = idx === 0;
    $('nextBtn').disabled = answers[idx] < 0;
    $('nextBtn').textContent = idx === content.questions.length - 1 ? '查看结果 →' : '下一题 →';
  }

  function computeResult() {
    var scores = {};
    var dimScores = {};
    content.results.forEach(function (r) { scores[r.id] = 0; });
    (content.dimensions || []).forEach(function (d) { dimScores[d.id] = 0; });
    content.questions.forEach(function (q, qi) {
      var opt = q.options[answers[qi]];
      if (!opt || !opt.scores) return;
      Object.keys(opt.scores).forEach(function (k) {
        if (scores.hasOwnProperty(k)) scores[k] += opt.scores[k];
        if (dimScores.hasOwnProperty(k)) dimScores[k] += opt.scores[k];
      });
    });
    if (content.scoring && content.scoring.mode === 'twoStage') {
      var dims = (content.dimensions || []).map(function (d) { return d.id; });
      var maxD = Math.max.apply(null, dims.map(function (d) { return dimScores[d] || 0; }));
      var tiedD = dims.filter(function (d) { return (dimScores[d] || 0) === maxD; });
      var winDim = tiedD[0];
      if (tiedD.length > 1) {
        var q1opt = content.questions[0] && content.questions[0].options[answers[0]];
        if (q1opt && q1opt.scores) {
          var q1dims = Object.keys(q1opt.scores).filter(function (k) { return tiedD.indexOf(k) >= 0; });
          if (q1dims.length) winDim = q1dims[0];
        }
      }
      var dimShopIds = {};
      content.questions.forEach(function (q) {
        q.options.forEach(function (o) {
          if (!o.scores) return;
          Object.keys(o.scores).forEach(function (k) {
            if (scores.hasOwnProperty(k)) {
              var ds = Object.keys(o.scores).filter(function (x) { return dimScores.hasOwnProperty(x); });
              if (ds.length) dimShopIds[k] = ds[0];
            }
          });
        });
      });
      var cands = content.results.filter(function (r) { return dimShopIds[r.id] === winDim; }).map(function (r) { return r.id; });
      if (!cands.length) cands = content.results.map(function (r) { return r.id; });
      var maxS = Math.max.apply(null, cands.map(function (id) { return scores[id] || 0; }));
      var tiedS = cands.filter(function (id) { return (scores[id] || 0) === maxS; });
      var winner = tiedS[0];
      if (tiedS.length > 1) {
        var bestQ = -1;
        content.questions.forEach(function (q, qi) {
          var opt = q.options[answers[qi]];
          if (!opt || !opt.scores) return;
          Object.keys(opt.scores).forEach(function (k) {
            if (tiedS.indexOf(k) >= 0 && qi > bestQ) { bestQ = qi; winner = k; }
          });
        });
      }
      var whyQ = -1, whyText = '';
      content.questions.forEach(function (q, qi) {
        var opt = q.options[answers[qi]];
        if (opt && opt.scores && opt.scores[winner]) { whyQ = qi; whyText = opt.text; }
      });
      var why = '';
      if (whyQ >= 0) why = '这间店出现，是因为你在第 ' + (whyQ + 1) + ' 题选了「' + whyText + '」。';
      return { winner: winner, scores: scores, dimScores: dimScores, winDim: winDim, why: why };
    }
    var max = Math.max.apply(null, Object.keys(scores).map(function (k) { return scores[k]; }));
    var tied = content.results.filter(function (r) { return scores[r.id] === max; }).map(function (r) { return r.id; });
    var winner = tied[0];
    if (tied.length > 1 && content.scoring && content.scoring.tieBreak === 'priorityQuestion') {
      var pq = content.scoring.priorityQuestionIndex;
      var pOpt = content.questions[pq] && content.questions[pq].options[answers[pq]];
      if (pOpt && pOpt.scores) {
        var pref = Object.keys(pOpt.scores).filter(function (k) { return tied.indexOf(k) >= 0; });
        if (pref.length) winner = pref[0];
      }
    }
    return { winner: winner, scores: scores, dimScores: dimScores, why: '' };
  }

  function saveLastResult(res) {
    try {
      localStorage.setItem('quiz_last_result', JSON.stringify({
        resultId: res.winner, scores: res.scores, dimScores: res.dimScores,
        why: res.why || '', revealed: !!res.revealed,
        savedAt: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function loadLastResult() {
    try {
      var s = localStorage.getItem('quiz_last_result');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function refreshLastBtn() {
    var saved = loadLastResult();
    var ok = false;
    if (saved && content) {
      var r = content.results.filter(function (x) { return x.id === saved.resultId; })[0];
      if (r) {
        ok = true;
        $('lastInfo').textContent = '上次结果：' + r.title + ' · ' + new Date(saved.savedAt).toLocaleString();
      }
    }
    $('lastWrap').classList.toggle('hidden', !ok);
  }

  function showSavedResult() {
    var saved = loadLastResult();
    if (!saved || !content) return;
    var r = content.results.filter(function (x) { return x.id === saved.resultId; })[0];
    if (!r) {
      try { localStorage.removeItem('quiz_last_result'); } catch (e) {}
      refreshLastBtn();
      return;
    }
    demoMode = false;
    sessionToken = null;
    renderResult({ winner: saved.resultId, scores: saved.scores || {}, dimScores: saved.dimScores || {}, why: saved.why || '' }, { revealed: !!saved.revealed });
  }

  function shortTitle(t) { return String(t || '').replace('你的小店 · ', ''); }

  function renderResult(res, opts) {
    opts = opts || {};
    var r = content.results.filter(function (x) { return x.id === res.winner; })[0];
    if (!r) return;
    revealed = !!opts.revealed;
    $('rTitle').textContent = r.title;
    $('rBody').textContent = r.body;
    $('rSign').textContent = r.sign ? '招牌上写着：' + r.sign : '';
    $('rWhy').textContent = res.why || '';
    var breakdown = '';
    content.results.forEach(function (x) {
      var sc = res.scores[x.id] || 0;
      breakdown += '<div class="bar-row"><span class="label">' + shortTitle(x.title) + '</span><div class="bar-track"><div style="width:' + Math.round(sc / content.questions.length * 100) + '%"></div></div><span>' + sc + ' 分</span></div>';
    });
    (content.dimensions || []).forEach(function (d) {
      var ds = res.dimScores[d.id] || 0;
      breakdown += '<div class="bar-row"><span class="label">' + d.label + '</span><div class="bar-track"><div style="width:' + Math.round(ds / content.questions.length * 100) + '%"></div></div><span>' + ds + ' 分</span></div>';
    });
    $('rBreakdown').innerHTML = breakdown;
    $('rScore').textContent = '计分明细：' + Object.keys(res.scores).map(function (k) { return k + ' ' + (res.scores[k] || 0); }).join(' · ');
    show('result');
    drawShareCard(r);
    if (revealed) {
      hideScratch();
      $('rExtra').classList.remove('hidden');
    } else {
      $('rExtra').classList.add('hidden');
      initScratch();
    }
  }

  function showResult() {
    var res = computeResult();
    res.revealed = false;
    saveLastResult(res);
    renderResult(res, { revealed: false });
    if (!demoMode && sessionToken) {
      api('/api/submit-result', { sessionToken: sessionToken, resultId: res.winner, answers: answers, scores: res.scores }).catch(function () {});
    }
  }

  function initScratch() {
    var card = $('shopCard');
    var cv = $('scratchCanvas');
    if (!card || !cv) return;
    var w = card.clientWidth, h = card.clientHeight;
    if (!w || !h) { setTimeout(initScratch, 50); return; }
    cv.width = w; cv.height = h;
    cv.style.display = 'block';
    cv.style.opacity = '1';
    scratchCtx = cv.getContext('2d');
    scratchCtx.globalCompositeOperation = 'source-over';
    scratchCtx.fillStyle = '#c9c9c9';
    scratchCtx.fillRect(0, 0, w, h);
    scratchCtx.fillStyle = '#8a8a8a';
    scratchCtx.font = 'bold 20px sans-serif';
    scratchCtx.textAlign = 'center';
    scratchCtx.fillText('刮一刮，看看你的小店', w / 2, h / 2 - 6);
    scratchCtx.font = '15px sans-serif';
    scratchCtx.fillText('用手指或鼠标擦开涂层', w / 2, h / 2 + 24);
    scratchCtx.textAlign = 'left';
    erasing = false; eraseCount = 0;
    $('revealBtn').classList.remove('hidden');
  }

  function hideScratch() {
    var cv = $('scratchCanvas');
    if (cv) cv.style.display = 'none';
    $('revealBtn').classList.add('hidden');
  }

  function scratchPos(e) {
    var cv = $('scratchCanvas');
    var rect = cv.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (cv.width / rect.width);
    var y = (e.clientY - rect.top) * (cv.height / rect.height);
    return { x: x, y: y };
  }

  function eraseAt(x, y) {
    if (!scratchCtx) return;
    scratchCtx.globalCompositeOperation = 'destination-out';
    scratchCtx.beginPath();
    scratchCtx.arc(x, y, 26, 0, Math.PI * 2);
    scratchCtx.fill();
    var dx = x - lastX, dy = y - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.floor(dist / 12));
    for (var i = 1; i <= steps; i++) {
      scratchCtx.beginPath();
      scratchCtx.arc(lastX + dx * i / steps, lastY + dy * i / steps, 26, 0, Math.PI * 2);
      scratchCtx.fill();
    }
    lastX = x; lastY = y;
    eraseCount++;
    if (eraseCount % 8 === 0) checkReveal();
  }

  function checkReveal() {
    if (revealed || !scratchCtx) return;
    var cv = $('scratchCanvas');
    try {
      var img = scratchCtx.getImageData(0, 0, cv.width, cv.height).data;
      var total = 0, clear = 0;
      for (var y = 0; y < cv.height; y += 16) {
        for (var x = 0; x < cv.width; x += 16) {
          total++;
          if (img[(y * cv.width + x) * 4 + 3] < 128) clear++;
        }
      }
      if (total && clear / total > 0.5) revealNow();
    } catch (e) {}
  }

  function revealNow() {
    if (revealed) return;
    revealed = true;
    var cv = $('scratchCanvas');
    if (cv) {
      cv.style.transition = 'opacity .6s';
      cv.style.opacity = '0';
      setTimeout(function () { cv.style.display = 'none'; }, 650);
    }
    $('revealBtn').classList.add('hidden');
    $('rExtra').classList.remove('hidden');
    try {
      var saved = loadLastResult();
      if (saved) { saved.revealed = true; localStorage.setItem('quiz_last_result', JSON.stringify(saved)); }
    } catch (e) {}
  }

  function drawShareCard(r) {
    var c = $('shareCanvas');
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ff2442'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 32px sans-serif';
    wrapText(ctx, r.title, 40, 90, 560, 40);
    ctx.font = '20px sans-serif';
    wrapText(ctx, (content.meta.sharePrefix || '') + r.shareText, 40, 190, 560, 30);
    ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(content.meta.title + ' · 仅供娱乐', 40, 320);
  }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = String(text || '').split('');
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i];
      if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, y); line = words[i]; y += lineHeight; }
      else line = test;
    }
    ctx.fillText(line, x, y);
  }

  function enterWithKey(code) {
    msg('正在校验密钥…');
    if (cfg.backend === 'demo') { sessionToken = 'demo'; startQuiz(); return; }
    api('/api/keys/validate', { code: code, redeemOnEntry: cfg.redeemOnEntry !== false })
      .then(function (d) {
        if (!d || !d.ok) { msg(d && d.error ? d.error : '密钥校验失败，请重试。'); return; }
        sessionToken = d.sessionToken;
        sessionKey = code;
        msg('');
        startQuiz();
      })
      .catch(function () { msg('连不上后端。请确认本地后端已启动（见框架 README），或检查 Supabase 配置。'); });
  }

  $('enterBtn').onclick = function () {
    var k = $('keyInput').value.trim().toUpperCase();
    if (!k) { msg('请先输入密钥。'); return; }
    enterWithKey(k);
  };
  $('fillBtn').onclick = function () { $('keyInput').value = 'DEMO-2026'; msg('已填入演示密钥（本地后端默认自带这一个）。'); };
  if (!cfg.allowDemo) { $('trialBtn').style.display = 'none'; }
  if (!cfg.allowDemo) { $('fillBtn').style.display = 'none'; }
  $('trialBtn').onclick = function () {
    if (!cfg.allowDemo) { msg('演示入口已关闭，请用密钥进入。'); return; }
    demoMode = true; sessionToken = null; startQuiz();
  };
  $('lastBtn').onclick = function () { showSavedResult(); };
  $('prevBtn').onclick = function () { if (idx > 0) { idx--; renderQ(); } };
  $('nextBtn').onclick = function () {
    if (answers[idx] < 0) return;
    if (idx < content.questions.length - 1) { idx++; renderQ(); } else { showResult(); }
  };
  $('revealBtn').onclick = function () { revealNow(); };
  $('copyBtn').onclick = function () {
    var res = computeResult();
    var r = content.results.filter(function (x) { return x.id === res.winner; })[0];
    var text = (content.meta.sharePrefix || '') + r.shareText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { $('shareMsg').textContent = '已复制分享文案。'; });
    } else { $('shareMsg').textContent = text; }
  };
  $('dlBtn').onclick = function () {
    var a = document.createElement('a');
    a.download = 'share-card.png';
    a.href = $('shareCanvas').toDataURL('image/png');
    a.click();
    $('shareMsg').textContent = '分享卡已下载。手机上如果没有自动保存到相册，可以点“在新窗口打开图片”，长按图片保存。';
  };
  $('openBtn').onclick = function () {
    var w = window.open($('shareCanvas').toDataURL('image/png'), '_blank');
    if (!w) { $('shareMsg').textContent = '浏览器拦截了新窗口，请点“下载分享卡图片”。'; }
  };
  $('againBtn').onclick = function () {
    demoMode = false; sessionToken = null; sessionKey = null;
    revealed = false;
    $('keyInput').value = '';
    msg('重新测评需要新的密钥。');
    show('home');
    refreshLastBtn();
  };

  document.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.id === 'scratchCanvas' && !revealed) {
      erasing = true;
      var p = scratchPos(e);
      lastX = p.x; lastY = p.y;
      eraseAt(p.x, p.y);
      e.preventDefault();
    }
  });
  document.addEventListener('pointermove', function (e) {
    if (erasing && !revealed) {
      var p = scratchPos(e);
      eraseAt(p.x, p.y);
      e.preventDefault();
    }
  });
  document.addEventListener('pointerup', function () { erasing = false; });
  document.addEventListener('pointercancel', function () { erasing = false; });

  loadContent().then(function () { refreshLastBtn(); }).catch(function () { msg('加载 content.json 失败，请确认用本地后端或静态服务器打开，不要直接双击文件。'); });
})();
