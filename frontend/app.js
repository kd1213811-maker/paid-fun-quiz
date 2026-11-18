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
    // 正式后端走 Supabase Edge Function validate-key；key 校验与 finish 都走它。
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
      b.onclick = function () { answers[idx] = i; renderQ(); };
      box.appendChild(b);
    });
    $('prevBtn').disabled = idx === 0;
    $('nextBtn').disabled = answers[idx] < 0;
    $('nextBtn').textContent = idx === content.questions.length - 1 ? '查看结果 →' : '下一题 →';
  }
  function computeResult() {
    var scores = {};
    content.results.forEach(function (r) { scores[r.id] = 0; });
    var dimScores = {};
    (content.dimensions || []).forEach(function (d) { dimScores[d.id] = 0; });
    answers.forEach(function (choice, qi) {
      var opt = content.questions[qi].options[choice];
      var sc = opt.scores || {};
      Object.keys(sc).forEach(function (k) {
        if (scores.hasOwnProperty(k)) scores[k] += sc[k];
        else if (dimScores.hasOwnProperty(k)) dimScores[k] += sc[k];
      });
    });
    var order = content.results.map(function (r) { return r.id; });
    var winner = order[0];
    var best = -Infinity;
    order.forEach(function (id) {
      if (scores[id] > best) { best = scores[id]; winner = id; }
    });
    // 平局：优先题指向的结果优先；再按 results 顺序。
    var sc = content.scoring || {};
    var pIdx = typeof sc.priorityQuestionIndex === 'number' ? sc.priorityQuestionIndex : content.questions.length - 1;
    var top = order.filter(function (id) { return scores[id] === best; });
    if (top.length > 1 && answers[pIdx] >= 0) {
      var po = content.questions[pIdx].options[answers[pIdx]];
      var pk = Object.keys(po.scores || {});
      for (var i = 0; i < pk.length; i++) {
        if (top.indexOf(pk[i]) >= 0) { winner = pk[i]; break; }
      }
    }
    var result = content.results.filter(function (r) { return r.id === winner; })[0];
    return { winner: winner, result: result, scores: scores, dimScores: dimScores };
  }
  function saveLastResult(res) {
    try {
      localStorage.setItem('quizResult', JSON.stringify({
        resultId: res.winner,
        scores: res.scores,
        dimScores: res.dimScores,
        at: Date.now()
      }));
    } catch (e) {}
  }
  function loadLastResult() {
    try { return JSON.parse(localStorage.getItem('quizResult') || 'null'); } catch (e) { return null; }
  }
  function refreshLastBtn() {
    var b = $('lastBtn');
    if (!b) return;
    var last = loadLastResult();
    b.classList.toggle('hidden', !last);
    if (last) {
      var r = content.results.filter(function (x) { return x.id === last.resultId; })[0];
      b.textContent = '查看上次结果：' + (r ? r.title : last.resultId);
    }
  }
  function enterWithKey(code) {
    var key = (code || '').trim();
    if (!key) { msg('请输入兑换码'); return; }
    if (key === 'DEMO') {
      demoMode = true;
      msg('');
      loadContent().then(function () { startQuiz(); });
      return;
    }
    demoMode = false;
    api('/api/validate', { key: key }).then(function (res) {
      if (res && res.ok) {
        sessionToken = res.token;
        sessionKey = key;
        msg('');
        loadContent().then(function () { startQuiz(); });
      } else {
        msg((res && res.error) || '兑换码无效');
      }
    }).catch(function () { msg('网络错误，请重试'); });
  }
  function renderResult(res) {
    var r = res.result;
    var scoreText = content.results.map(function (x) { return x.id + '：' + (res.scores[x.id] || 0); }).join('　');
    $('rTitle').textContent = r ? r.title : '未找到结果';
    $('rBody').textContent = r ? r.body : '';
    $('rLearn').textContent = r ? (r.learn || '') : '';
    $('rTry').textContent = r ? (r.try || '') : '';
    $('rScore').textContent = scoreText;
    var bars = '';
    var max = 0;
    Object.keys(res.scores).forEach(function (k) { if (res.scores[k] > max) max = res.scores[k]; });
    if (max > 0) {
      bars = '<div class="bars">';
      content.results.forEach(function (x) {
        var v = res.scores[x.id] || 0;
        var pct = Math.round(v / max * 100);
        bars += '<div class="bar-row"><span>' + x.id + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><span>' + v + '</span></div>';
      });
      bars += '</div>';
    }
    $('rBars').innerHTML = bars;
    $('shareBtn').onclick = function () {
      var text = (content.meta.sharePrefix || '') + (r ? r.shareText : '');
      if (navigator.share) {
        navigator.share({ title: content.meta.title, text: text, url: location.href }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text + ' ' + location.href).then(function () { alert('已复制分享文案'); });
      } else {
        prompt('复制分享文案', text + ' ' + location.href);
      }
    };
    $('dlBtn').onclick = function () {
      drawShareCard(r);
      var a = document.createElement('a');
      a.download = 'quiz-result.png';
      a.href = $('shareCanvas').toDataURL('image/png');
      a.click();
    };
    show('result');
    refreshLastBtn();
  }
  function showResult() {
    var res = computeResult();
    saveLastResult(res);
    renderResult(res);
    if (!demoMode) {
      api('/api/finish', { key: sessionKey, token: sessionToken, answers: answers }).then(function (r) {
        if (!(r && r.ok)) { msg((r && r.error) || '提交失败，请重试'); }
      }).catch(function () { msg('网络错误，请重试'); });
    }
  }
  function drawShareCard(r) {
    var c = $('shareCanvas');
    if (!c) return;
    var x = c.getContext('2d');
    x.fillStyle = '#fff8ec';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#ff2442';
    x.fillRect(0, 0, c.width, 8);
    x.fillStyle = '#2d1a0e';
    x.font = 'bold 36px system-ui, sans-serif';
    x.fillText(content.meta.title, 40, 72);
    x.font = 'bold 30px system-ui, sans-serif';
    x.fillText(r ? r.title : '', 40, 122);
    x.font = '20px system-ui, sans-serif';
    wrapText(x, r ? r.body : '', 40, 162, 560, 28);
    x.font = '18px system-ui, sans-serif';
    x.fillText(content.meta.title + ' · 仅供娱乐', 40, 320);
  }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var chars = (text || '').split('');
    var line = '', yy = y;
    chars.forEach(function (ch) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = ch;
        yy += lineHeight;
      } else {
        line += ch;
      }
    });
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  $('enterBtn').onclick = function () { enterWithKey($('keyInput').value); };
  $('fillBtn').onclick = function () { $('keyInput').value = 'DEMO'; };
  $('trialBtn').onclick = function () { demoMode = true; loadContent().then(function () { startQuiz(); }); };
  $('lastBtn').onclick = function () {
    var last = loadLastResult();
    if (last) {
      var r = content.results.filter(function (x) { return x.id === last.resultId; })[0];
      renderResult({ winner: last.resultId, result: r, scores: last.scores || {}, dimScores: last.dimScores || {} });
    }
  };
  $('copyBtn').onclick = function () {
    if (navigator.clipboard) { navigator.clipboard.writeText(location.href).then(function () { alert('链接已复制'); }); }
  };
  $('openBtn').onclick = function () { if (content) location.hash = '#result'; };
  $('againBtn').onclick = function () { show('home'); };
  $('prevBtn').onclick = function () { if (idx > 0) { idx--; renderQ(); } };
  $('nextBtn').onclick = function () {
    if (answers[idx] < 0) { alert('请先选择一个选项'); return; }
    if (idx < content.questions.length - 1) { idx++; renderQ(); }
    else { showResult(); }
  };

  loadContent().then(function () {
    refreshLastBtn();
  });
})();
