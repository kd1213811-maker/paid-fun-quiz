// 趣味测评框架 · 前端逻辑
// 内容全部来自 content.json；计分规则也在 content.json 里。换主题只换那个文件。
(function () {
  var cfg = window.QUIZ_CONFIG || {};
  var content = null;
  var idx = 0;
  var answers = []; // 每题选中的选项下标，-1 表示未选
  var sessionToken = null;
  var sessionKey = null;
  var demoMode = false;

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['home', 'quiz', 'result'].forEach(function (x) { $(x).classList.toggle('hidden', x !== id); });
  }
  function msg(t) { $('keyMsg').textContent = t || ''; }

  function api(path, body) {
    var base = (cfg.apiBase || '').replace(/\/$/, '');
    if (cfg.backend === 'supabase') {
      // 正式后端：走 Supabase Edge Function validate-key，见 backend/supabase/functions/validate-key/
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
    // local / demo：走本地后端（backend/local-server/server.mjs）
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  function loadContent() {
    return fetch('content.json').then(function (r) { return r.json(); }).then(function (c) {
      content = c;
      document.title = c.meta.title + '（框架示例版）';
      $('pageTitle').textContent = c.meta.title;
      $('pageSub').textContent = c.meta.subtitle;
      $('rDisclaimer').textContent = c.meta.disclaimer || '';
    });
  }

  function startQuiz() {
    idx = 0;
    answers = content.questions.map(function () { return -1; });
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
    // 取最高分；平局时先看优先题指向的结果，再按 results 在 content.json 中的顺序取先
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
    return { winner: winner, scores: scores, dimScores: dimScores };
  }

  function showResult() {
    var res = computeResult();
    var r = content.results.filter(function (x) { return x.id === res.winner; })[0];
    $('rTitle').textContent = r.title;
    $('rBody').textContent = r.body;
    $('rLearn').textContent = r.learn ? '学到的一点：' + r.learn : '';
    $('rTry').textContent = r.try ? '可以试试：' + r.try : '';
    var breakdown = '';
    content.results.forEach(function (x) {
      breakdown += '<div class="bar-row"><span class="label">' + x.id + '</span><div class="bar-track"><div style="width:' + Math.round(res.scores[x.id] / content.questions.length * 100) + '%"></div></div><span>' + res.scores[x.id] + ' 分</span></div>';
    });
    (content.dimensions || []).forEach(function (d) {
      breakdown += '<div class="bar-row"><span class="label">' + d.label + '</span><div class="bar-track"><div style="width:' + Math.round(res.dimScores[d.id] / content.questions.length * 100) + '%"></div></div><span>' + res.dimScores[d.id] + ' 分</span></div>';
    });
    $('rBreakdown').innerHTML = breakdown;
    $('rScore').textContent = '计分明细：' + Object.keys(res.scores).map(function (k) { return k + ' ' + res.scores[k]; }).join(' · ');
    show('result');
    drawShareCard(r);
    // 出结果时上报一次（本地后端记到 data.json，Supabase 记到 quiz_sessions 表；失败不影响看结果）
    if (!demoMode && sessionToken) {
      api('/api/submit-result', { sessionToken: sessionToken, resultId: res.winner, answers: answers, scores: res.scores }).catch(function () {});
    }
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
      if (!cfg.allowDemo) { $('trialBtn').style.display = 'none'; }
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
  $('trialBtn').onclick = function () {
    if (!cfg.allowDemo) { msg('演示入口已关闭，请用密钥进入。'); return; }
    demoMode = true; sessionToken = null; startQuiz();
  };
  $('prevBtn').onclick = function () { if (idx > 0) { idx--; renderQ(); } };
  $('nextBtn').onclick = function () {
    if (answers[idx] < 0) return;
    if (idx < content.questions.length - 1) { idx++; renderQ(); } else { showResult(); }
  };
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
    $('shareMsg').textContent = '分享卡已下载。';
  };
  $('againBtn').onclick = function () {
    demoMode = false; sessionToken = null; sessionKey = null;
    $('keyInput').value = '';
    msg('重新测评需要新的密钥。');
    show('home');
  };

  loadContent().catch(function () { msg('加载 content.json 失败，请确认用本地后端或静态服务器打开，不要直接双击文件。'); });
})();
