// 趣味测评框架 · 前端逻辑
// 内容全部来自 content.json；计分规则也在 content.json 里。

(function() {
  var cfg = window.QUIZ_CONFIG || {};
  var content = null;
  var idx = 0;
  var answers = [];
  var sessionToken = null;
  var sessionKey = null;
  var demoMode = false;

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['home', 'quiz', 'result'].forEach(function(x) { $(x).classList.toggle('hidden', x !== id); });
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
      }).then(function(r) { return r.json(); });
    }
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function(r) { return r.json(); });
  }
  function loadContent() {
    return fetch('content.json').then(function(r) { return r.json(); }).then(function(c) {
      content = c;
      document.title = c.meta.title;
      $('pageTitle').textContent = c.meta.title;
      $('pageSub').textContent = c.meta.subtitle;
      $('rDisclaimer').textContent = c.meta.disclaimer || '';
    });
  }
  function startQuiz() {
    idx = 0;
    answers = content.questions.map(function() { return -1; });
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
    q.options.forEach(function(o, i) {
      var b = document.createElement('button');
      b.className = 'opt' + (answers[idx] === i ? ' sel' : '');
      b.textContent = o.text;
      b.onclick = function() { answers[idx] = i; renderQ(); };
      box.appendChild(b);
    });
    $('prevBtn').disabled = idx === 0;
    $('nextBtn').textContent = idx === content.questions.length - 1 ? '查看结果' : '下一题';
  }
  function prevQ() { if (idx > 0) { idx--; renderQ(); } }
  function nextQ() {
    if (answers[idx] < 0) { alert('请先选择一个选项'); return; }
    if (idx < content.questions.length - 1) { idx++; renderQ(); }
    else { finish(); }
  }
  function computeResult() {
    var mode = (content.scoring && content.scoring.mode) || 'count';
    var scores = {};
    content.results.forEach(function(r) { scores[r.id] = 0; });
    var dims = {};
    (content.dimensions || []).forEach(function(d) { dims[d.id] = 0; });
    answers.forEach(function(choice, qi) {
      var opt = content.questions[qi].options[choice];
      var sc = opt.scores || {};
      Object.keys(sc).forEach(function(k) {
        if (scores.hasOwnProperty(k)) scores[k] += sc[k];
        else if (dims.hasOwnProperty(k)) dims[k] += sc[k];
      });
    });
    var winner = null, best = -Infinity;
    content.results.forEach(function(r) {
      if (scores[r.id] > best) { best = scores[r.id]; winner = r; }
    });
    return { winner: winner, scores: scores, dims: dims };
  }
  function finish() {
    if (demoMode) { showResult(computeResult()); return; }
    api('/api/finish', { key: sessionKey, token: sessionToken, answers: answers }).then(function(res) {
      if (res && res.ok) { showResult(computeResult()); }
      else { msg((res && res.error) || '提交失败，请重试'); }
    }).catch(function() { msg('网络错误，请重试'); });
  }
  function showSavedResult() {
    loadContent().then(function() {
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem('quizResult') || 'null'); } catch (e) {}
      if (saved && saved.resultId) {
        var r = content.results.filter(function(x) { return x.id === saved.resultId; })[0];
        renderResult({
          winner: r,
          scores: saved.scores || {},
          dims: saved.dims || {},
          saved: true
        });
      } else {
        show('home');
      }
    });
  }
  function renderResult(res) {
    var r = res.winner;
    var breakdown = '';
    if (r && res.scores) {
      var max = 0;
      Object.keys(res.scores).forEach(function(k) { if (res.scores[k] > max) max = res.scores[k]; });
      if (max > 0) {
        breakdown += '<div class="bars">';
        content.results.forEach(function(x) {
          var v = res.scores[x.id] || 0;
          var pct = Math.round(v / max * 100);
          breakdown += '<div class="bar-row"><span>' + x.id + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><span>' + v + '</span></div>';
        });
        breakdown += '</div>';
      }
    }
    $('rTitle').textContent = r ? r.title : '未找到结果';
    $('rBody').textContent = r ? r.body : '';
    $('rLearn').textContent = r ? (r.learn || '') : '';
    $('rTry').textContent = r ? (r.try || '') : '';
    $('rBreakdown').innerHTML = breakdown;
    $('shareBtn').onclick = function() {
      var text = (content.meta.sharePrefix || '') + (r ? r.shareText : '');
      if (navigator.share) {
        navigator.share({ title: content.meta.title, text: text, url: location.href }).catch(function() {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text + ' ' + location.href).then(function() { alert('已复制分享文案'); });
      } else {
        prompt('复制分享文案', text + ' ' + location.href);
      }
    };
    $('dlBtn').onclick = function() {
      drawShareCard(r);
      var a = document.createElement('a');
      a.download = 'quiz-result.png';
      a.href = $('shareCanvas').toDataURL('image/png');
      a.click();
    };
    show('result');
    if (!res.saved) {
      try {
        localStorage.setItem('quizResult', JSON.stringify({
          resultId: r ? r.id : null,
          scores: res.scores || {},
          dims: res.dims || {},
          at: Date.now()
        }));
      } catch (e) {}
    }
  }
  function showResult(res) { renderResult(res); }
  function drawShareCard(r) {
    var c = $('shareCanvas');
    if (!c) return;
    var x = c.getContext('2d');
    x.fillStyle = '#fff8ec';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#2d1a0e';
    x.font = 'bold 34px system-ui, sans-serif';
    x.fillText(content.meta.title, 32, 64);
    x.font = 'bold 28px system-ui, sans-serif';
    x.fillText(r ? r.title : '', 32, 112);
    x.font = '20px system-ui, sans-serif';
    var lines = wrapText(x, r ? r.body : '', 560);
    lines.forEach(function(ln, i) { x.fillText(ln, 32, 152 + i * 30); });
    x.font = '18px system-ui, sans-serif';
    x.fillText((content.meta.sharePrefix || '') + (r ? r.shareText : ''), 32, c.height - 32);
  }
  function wrapText(ctx, text, maxW) {
    var chars = (text || '').split('');
    var lines = [], line = '';
    chars.forEach(function(ch) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  $('startBtn').onclick = function() {
    var key = ($('keyInput').value || '').trim();
    if (!key) { msg('请输入兑换码'); return; }
    if (key === 'DEMO') {
      demoMode = true;
      msg('');
      loadContent().then(function() { startQuiz(); });
      return;
    }
    demoMode = false;
    api('/api/validate', { key: key }).then(function(res) {
      if (res && res.ok) {
        sessionToken = res.token;
        sessionKey = key;
        msg('');
        loadContent().then(function() { startQuiz(); });
      } else {
        msg((res && res.error) || '兑换码无效');
      }
    }).catch(function() { msg('网络错误，请重试'); });
  };
  $('prevBtn').onclick = prevQ;
  $('nextBtn').onclick = nextQ;

  loadContent().then(function() {
    if (location.hash === '#result') showSavedResult();
  });
})();
