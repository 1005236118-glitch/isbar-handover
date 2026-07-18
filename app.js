/* ==========================================
   智交班 - 核心业务逻辑
   登录系统 | 用户管理 | 实时语音录入 | 记录管理
   ========================================== */

// ========== 全局状态 ==========
const STATE = {
  currentUser: null,         // 当前登录用户 {id, name, role}
  regInfo: null,             // 登记信息 {ward, nurseName, nurseId}
  currentReport: '',
  deferredPrompt: null,
  currentView: 'editor',     // 'editor' | 'records'
};

// ========== 常量 ==========
const USERS_KEY = 'isbar_users';
const RECORDS_KEY = 'isbar_records';
const MAX_RECORDS = 200;
const ADMIN_SETUP_PASSWORD = 'Tt19930713';

// ========== 用户管理 ==========
function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch { return []; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ========== 记录管理 ==========
function getRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []; }
  catch { return []; }
}
function saveRecords(records) {
  if (records.length > MAX_RECORDS) records = records.slice(0, MAX_RECORDS);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// ========== DOM ==========
const $ = id => document.getElementById(id);

// ========== 登录相关 ==========
function switchLoginTab(idx, btn) {
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginPanel0').classList.toggle('show', idx === 0);
  document.getElementById('loginPanel1').classList.toggle('show', idx === 1);
  hideError('loginError'); hideError('adminLoginError');
}

function showError(id, msg) {
  const el = $(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function hideError(id) {
  const el = $(id);
  if (el) { el.style.display = 'none'; }
}

function showSuccess(id, msg) {
  const el = $(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// 普通用户登录
function doLogin() {
  const id = $('loginId').value.trim();
  const pwd = $('loginPwd').value.trim();
  if (!id || !pwd) { showError('loginError', '请输入工号和密码'); return; }
  const users = getUsers();
  const user = users.find(u => u.id === id && u.role === 'user');
  if (!user || user.password !== pwd) {
    showError('loginError', '工号或密码错误，请重试');
    return;
  }
  loginSuccess(user);
}

// 管理员登录
function doAdminLogin() {
  const id = $('adminId').value.trim();
  const pwd = $('adminPwd').value.trim();
  if (!id || !pwd) { showError('adminLoginError', '请输入账号和密码'); return; }
  const users = getUsers();
  const user = users.find(u => u.id === id && u.role === 'admin');
  if (!user || user.password !== pwd) {
    showError('adminLoginError', '账号或密码错误');
    return;
  }
  loginSuccess(user);
}

// 登录成功
function loginSuccess(user) {
  STATE.currentUser = user;
  $('loginOverlay').classList.add('hide');
  $('appMain').style.display = 'flex';
  $('userInfoDisplay').textContent = user.name + (user.role === 'admin' ? '（管理员）' : '');
  // 弹出登记信息
  showRegisterInfoModal();
  updateUI();
}

// 退出登录
function logout() {
  if (Speech.isRecording) Speech.stop();
  STATE.currentUser = null;
  STATE.regInfo = null;
  STATE.currentReport = '';
  clearEditorForm();
  $('appMain').style.display = 'none';
  $('loginOverlay').classList.remove('hide');
  $('loginId').value = '';
  $('loginPwd').value = '';
  $('adminId').value = '';
  $('adminPwd').value = '';
  hideError('loginError'); hideError('adminLoginError');
  switchLoginTab(0, document.querySelector('.login-tab'));
}

// 显示登记信息弹窗
function showRegisterInfoModal() {
  $('regWard').value = '';
  $('regNurseName').value = STATE.currentUser ? STATE.currentUser.name : '';
  $('regNurseId').value = STATE.currentUser ? STATE.currentUser.id : '';
  hideError('regInfoError');
  $('modalRegisterInfo').style.display = 'flex';
}

// 确认登记信息
function confirmRegisterInfo() {
  const ward = $('regWard').value;
  const nurseName = $('regNurseName').value.trim();
  const nurseId = $('regNurseId').value.trim();

  if (!ward || !nurseName || !nurseId) {
    showError('regInfoError', '请填写完整信息（病区、姓名、工牌号）');
    return;
  }

  STATE.regInfo = { ward, nurseName, nurseId };
  $('modalRegisterInfo').style.display = 'none';
  $('wardBadge').textContent = ward;
  clearEditorForm();
  showEditorView();
  showToast('登记成功，请开始交班录入');
}

// 注册
function showRegisterModal() {
  $('regName').value = '';
  $('regId').value = '';
  $('regPwd').value = '';
  $('regPwd2').value = '';
  hideError('regError');
  hideError('regSuccess');
  $('registerModal').style.display = 'flex';
}
function closeRegisterModal() {
  $('registerModal').style.display = 'none';
}
function doRegister() {
  const name = $('regName').value.trim();
  const id = $('regId').value.trim();
  const pwd = $('regPwd').value;
  const pwd2 = $('regPwd2').value;

  if (!name || !id) { showError('regError', '请输入姓名和工号'); return; }
  if (pwd.length < 4) { showError('regError', '密码至少4位'); return; }
  if (pwd !== pwd2) { showError('regError', '两次密码不一致'); return; }

  const users = getUsers();
  if (users.find(u => u.id === id)) { showError('regError', '该工号已注册'); return; }

  users.push({ id, name, password: pwd, role: 'user' });
  saveUsers(users);
  hideError('regError');
  showSuccess('regSuccess', '注册成功！请返回登录');
  setTimeout(() => closeRegisterModal(), 1500);
}

// 忘记密码
function showForgotPwdModal() {
  $('fpName').value = ''; $('fpId').value = ''; $('fpPwd').value = ''; $('fpPwd2').value = '';
  hideError('fpError'); hideError('fpSuccess');
  $('forgotPwdModal').style.display = 'flex';
}
function closeForgotPwdModal() { $('forgotPwdModal').style.display = 'none'; }
function doForgotPwdReset() {
  const name = $('fpName').value.trim();
  const id = $('fpId').value.trim();
  const pwd = $('fpPwd').value;
  const pwd2 = $('fpPwd2').value;

  if (!name || !id) { showError('fpError', '请输入姓名和工号'); return; }
  if (pwd.length < 4) { showError('fpError', '密码至少4位'); return; }
  if (pwd !== pwd2) { showError('fpError', '两次密码不一致'); return; }

  const users = getUsers();
  const user = users.find(u => u.id === id && u.role === 'user' && u.name === name);
  if (!user) { showError('fpError', '姓名或工号不匹配'); return; }

  user.password = pwd;
  saveUsers(users);
  hideError('fpError');
  showSuccess('fpSuccess', '密码已重置！请返回登录');
}

// 管理员设置
function showAdminSetupModal() {
  const admins = getUsers().filter(u => u.role === 'admin');
  if (admins.length > 0) {
    // 已有管理员，显示密码验证
    $('setupPwdTitle').textContent = '管理员设置验证';
    $('setupPwdInput').value = '';
    hideError('setupPwdError');
    $('setupPwdModal').style.display = 'flex';
    window._setupPwdCallback = 'showAdminSetupOverlay';
  } else {
    // 首次设置
    showAdminSetupOverlay();
  }
}
function closeSetupPwdModal() {
  $('setupPwdModal').style.display = 'none';
  window._setupPwdCallback = null;
}
function verifySetupPwd() {
  const input = $('setupPwdInput').value;
  if (input === ADMIN_SETUP_PASSWORD) {
    closeSetupPwdModal();
    if (window._setupPwdCallback === 'showAdminSetupOverlay') showAdminSetupOverlay();
  } else {
    showError('setupPwdError', '设置密码错误，请重试');
  }
}
function showAdminSetupOverlay() {
  $('setupAdminName').value = ''; $('setupAdminId').value = '';
  $('setupAdminPwd').value = ''; $('setupAdminPwd2').value = '';
  hideError('setupAdminError');
  $('adminSetupOverlay').classList.remove('hide');
}
function doAdminSetup() {
  const name = $('setupAdminName').value.trim();
  const id = $('setupAdminId').value.trim();
  const pwd = $('setupAdminPwd').value;
  const pwd2 = $('setupAdminPwd2').value;

  if (!name || !id) { showError('setupAdminError', '请填写完整信息'); return; }
  if (pwd.length < 4) { showError('setupAdminError', '密码至少4位'); return; }
  if (pwd !== pwd2) { showError('setupAdminError', '两次密码不一致'); return; }

  const users = getUsers();
  const existed = users.find(u => u.id === id && u.role === 'admin');
  if (existed) {
    existed.password = pwd;
    existed.name = name;
  } else {
    users.push({ id, name, password: pwd, role: 'admin' });
  }
  saveUsers(users);
  $('adminSetupOverlay').classList.add('hide');
  showToast('管理员设置成功');
}

// 管理员忘记密码
function showAdminForgotPwd() {
  $('adminResetId').value = ''; $('adminResetPwd').value = ''; $('adminResetPwd2').value = '';
  hideError('adminResetError'); hideError('adminResetSuccess');
  $('adminResetModal').style.display = 'flex';
}
function closeAdminResetModal() { $('adminResetModal').style.display = 'none'; }
function doAdminResetPwd() {
  const id = $('adminResetId').value.trim();
  const pwd = $('adminResetPwd').value;
  const pwd2 = $('adminResetPwd2').value;

  if (!id) { showError('adminResetError', '请输入工号'); return; }
  if (pwd.length < 4) { showError('adminResetError', '密码至少4位'); return; }
  if (pwd !== pwd2) { showError('adminResetError', '两次密码不一致'); return; }

  const users = getUsers();
  const user = users.find(u => u.id === id && u.role === 'admin');
  if (!user) { showError('adminResetError', '工号不存在或非管理员'); return; }

  user.password = pwd;
  saveUsers(users);
  hideError('adminResetError');
  showSuccess('adminResetSuccess', '密码已重置！请返回登录');
}

// ========== 多设备数据同步（账号 + 交班记录） ==========
function showSyncModal() {
  $('syncCodeOutput').value = '';
  $('syncCodeInput').value = '';
  hideError('syncImportError'); hideError('syncImportSuccess');
  hideError('syncGenSuccess');
  $('btnCopySyncCode').style.display = 'none';
  switchSyncTab(0, document.querySelector('.sync-tab'));
  $('syncModal').style.display = 'flex';
}
function closeSyncModal() {
  $('syncModal').style.display = 'none';
}
function switchSyncTab(idx, btn) {
  document.querySelectorAll('.sync-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('syncPanel0').classList.toggle('show', idx === 0);
  document.getElementById('syncPanel1').classList.toggle('show', idx === 1);
}

/** 生成同步码：将用户和交班记录打包压缩为Base64字符串 */
function generateSyncCode() {
  const users = getUsers();
  const records = getRecords();
  if (users.length === 0 && records.length === 0) {
    showToast('当前设备没有可同步的数据');
    return;
  }
  try {
    const data = { users, records };
    const json = JSON.stringify(data);
    const code = btoa(unescape(encodeURIComponent(json)));
    $('syncCodeOutput').value = code;
    $('btnCopySyncCode').style.display = 'block';
    const info = [];
    if (users.length > 0) info.push(`${users.length}个账号`);
    if (records.length > 0) info.push(`${records.length}条记录`);
    showSuccess('syncGenSuccess', `同步码已生成！包含 ${info.join('、')}，请点击下方按钮复制，发送到另一台设备导入`);
  } catch (e) {
    showToast('生成同步码失败：' + e.message);
  }
}

/** 复制同步码到剪贴板 */
function copySyncCode() {
  const code = $('syncCodeOutput').value;
  if (!code) return;
  try {
    navigator.clipboard.writeText(code).then(() => showToast('同步码已复制，请发送到另一台设备'));
  } catch {
    const ta = $('syncCodeOutput');
    ta.select();
    document.execCommand('copy');
    showToast('同步码已复制，请发送到另一台设备');
  }
}

/** 导入同步码：解码并合并用户和记录数据 */
function importSyncCode() {
  const code = $('syncCodeInput').value.trim();
  if (!code) {
    showError('syncImportError', '请粘贴同步码');
    hideError('syncImportSuccess');
    return;
  }
  try {
    const json = decodeURIComponent(escape(atob(code)));
    const data = JSON.parse(json);

    // 兼容旧版同步码（纯用户数组）
    let remoteUsers, remoteRecords;
    if (Array.isArray(data)) {
      remoteUsers = data;
      remoteRecords = [];
    } else {
      remoteUsers = data.users || [];
      remoteRecords = data.records || [];
    }

    if (remoteUsers.length === 0 && remoteRecords.length === 0) {
      throw new Error('数据为空');
    }

    // 合并用户
    const localUsers = getUsers();
    let userAdded = 0, userUpdated = 0;
    remoteUsers.forEach(ru => {
      const existing = localUsers.findIndex(u => u.id === ru.id);
      if (existing >= 0) {
        localUsers[existing] = { ...localUsers[existing], ...ru };
        userUpdated++;
      } else {
        localUsers.push(ru);
        userAdded++;
      }
    });
    saveUsers(localUsers);

    // 合并记录
    const localRecords = getRecords();
    let recAdded = 0, recUpdated = 0;
    remoteRecords.forEach(rr => {
      const existing = localRecords.findIndex(r => r.id === rr.id);
      if (existing >= 0) {
        localRecords[existing] = { ...localRecords[existing], ...rr };
        recUpdated++;
      } else {
        localRecords.push(rr);
        recAdded++;
      }
    });
    saveRecords(localRecords);

    const parts = [];
    if (userAdded > 0 || userUpdated > 0) parts.push(`账号：新增${userAdded}个，更新${userUpdated}个`);
    if (recAdded > 0 || recUpdated > 0) parts.push(`记录：新增${recAdded}条，更新${recUpdated}条`);
    hideError('syncImportError');
    showSuccess('syncImportSuccess', `同步成功！${parts.join('；')}`);
    $('syncCodeInput').value = '';
  } catch (e) {
    showError('syncImportError', '同步码无效，请检查后重试');
    hideError('syncImportSuccess');
  }
}

// ========== 语音识别模块（实时显示在textarea） ==========
const Speech = {
  recognition: null,
  isRecording: false,
  currentTargetId: null,
  currentButton: null,
  currentCard: null,
  baseText: '',       // 录音开始前文本框里已有的内容
  finalTranscript: '',

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    this.recognition = new SR();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) this.finalTranscript += final;

      // 实时更新textarea
      if (this.currentTargetId) {
        const ta = document.getElementById(this.currentTargetId);
        if (ta) {
          const display = this.baseText + (this.baseText ? '；' : '') + this.finalTranscript + interim;
          ta.value = display;
          ta.scrollTop = ta.scrollHeight;
        }
      }
      // 更新顶部条
      const ri = $('recordingInterim');
      if (ri) ri.textContent = this.finalTranscript + interim;
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      showToast('语音识别出错：' + event.error);
      this.stop();
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        try { this.recognition.start(); } catch (e) {}
      }
    };

    return true;
  },

  start(targetId) {
    if (this.isRecording) {
      if (this.currentTargetId === targetId) { this.stop(); return; }
      this.stop();
    }

    const ta = document.getElementById(targetId);
    if (!ta) return;
    this.currentTargetId = targetId;
    this.baseText = ta.value.trim();
    this.finalTranscript = '';
    this.isRecording = true;

    this.currentButton = document.querySelector(`.btn-mic[data-target="${targetId}"]`);
    this.currentCard = this.currentButton ? this.currentButton.closest('.isbar-card') : null;

    if (this.currentButton) this.currentButton.classList.add('recording');
    if (this.currentCard) this.currentCard.classList.add('recording-active');
    $('recordingBar').style.display = 'block';
    $('recordingInterim').textContent = '正在聆听...';

    try { this.recognition.start(); } catch (e) {}
  },

  stop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    try { this.recognition.stop(); } catch (e) {}

    // 确保最终文本写入
    if (this.currentTargetId && this.finalTranscript.trim()) {
      const ta = document.getElementById(this.currentTargetId);
      if (ta) {
        const final = this.baseText + (this.baseText ? '；' : '') + this.finalTranscript.trim();
        ta.value = final;
      }
    }

    if (this.currentButton) this.currentButton.classList.remove('recording');
    if (this.currentCard) this.currentCard.classList.remove('recording-active');
    $('recordingBar').style.display = 'none';
    $('recordingInterim').textContent = '';

    this.currentTargetId = null;
    this.currentButton = null;
    this.currentCard = null;
    this.baseText = '';
    this.finalTranscript = '';
  },

  toggle(targetId) {
    if (this.isRecording && this.currentTargetId === targetId) this.stop();
    else this.start(targetId);
  },
};

// ========== 工具函数 ==========
function showToast(msg, dur = 2000) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.animation = 'none'; t.offsetHeight; t.style.animation = 'toastIn .3s ease';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.style.display = 'none', dur);
}
function openModal(el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal(el) { el.style.display = 'none'; document.body.style.overflow = ''; }
function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function extractPatientInfo() {
  const t = $('isbarI').value || '';
  const b = t.match(/床号[：:]\s*(\S+)/);
  const n = t.match(/姓名[：:]\s*(\S+)/);
  return { bed: b ? b[1] : '未知', name: n ? n[1] : '未知' };
}

// ========== 视图切换 ==========
function showEditorView() {
  STATE.currentView = 'editor';
  $('editorView').style.display = '';
  $('recordsView').style.display = 'none';
  $('actionBar').style.display = '';
}
function showRecordsView() {
  STATE.currentView = 'records';
  $('editorView').style.display = 'none';
  $('recordsView').style.display = '';
  $('actionBar').style.display = 'none';
  renderRecordsList();
}

// ========== 清除表单 ==========
function clearEditorForm() {
  ['isbarI','isbarS','isbarB','isbarA','isbarR','unclassified'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  STATE.currentReport = '';
}

// ========== 交班文稿生成 ==========
function generateReport() {
  const i = $('isbarI').value.trim();
  const s = $('isbarS').value.trim();
  const b = $('isbarB').value.trim();
  const a = $('isbarA').value.trim();
  const r = $('isbarR').value.trim();
  const extra = $('unclassified').value.trim();

  if (!i && !s && !b && !a && !r) { showToast('请至少填写一个ISBAR模块的内容'); return ''; }

  const date = getTodayDate();
  let report = '═══════════════════════════════════════\n';
  report += '       神经科 ISBAR 交班记录\n';
  report += '═══════════════════════════════════════\n\n';
  if (STATE.regInfo) {
    report += `病区：${STATE.regInfo.ward}    护士：${STATE.regInfo.nurseName}    工牌号：${STATE.regInfo.nurseId}\n`;
  }
  report += `交班日期：${date}\n\n`;
  if (i) { report += '【I - 身份确认】\n───────────────\n' + i + '\n\n'; }
  if (s) { report += '【S - 患者情况】\n───────────────\n' + s + '\n\n'; }
  if (b) { report += '【B - 背景信息】\n───────────────\n' + b + '\n\n'; }
  if (a) { report += '【A - 综合评估】\n───────────────\n' + a + '\n\n'; }
  if (r) { report += '【R - 护理建议】\n───────────────\n' + r + '\n\n'; }
  if (extra) { report += '【备注】\n───────────────\n' + extra + '\n\n'; }
  report += '═══════════════════════════════════════\n';
  report += '  交班人：___________  接班人：___________\n';
  report += '═══════════════════════════════════════\n';

  STATE.currentReport = report;
  return report;
}

function previewReport() {
  const report = generateReport();
  if (!report) return;
  const html = report.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/【(.*?)】/g,'<h3>【$1】</h3>').replace(/──+/g,'').replace(/═══+/g,'').replace(/\n/g,'<br>');
  $('reportContent').innerHTML = html;
  openModal($('modalPreview'));
}

// ========== 导出 ==========
function getExportFilename(ext) {
  const { bed, name } = extractPatientInfo();
  return `${bed}_${name}_ISBAR交班记录_${getTodayDate()}.${ext}`;
}
function exportTXT() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;
  downloadFile(report, getExportFilename('txt'), 'text/plain;charset=utf-8');
  showToast('TXT文件已导出');
}
function exportDOCX() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;
  const lines = report.split('\n').map(line => {
    const e = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/ /g,'&nbsp;');
    if (e.startsWith('【') && e.includes('】')) return `<p style="font-weight:bold;font-size:15pt;color:#1a73e8;margin:12pt 0 6pt 0;">${e}</p>`;
    if (e.includes('──') || e.includes('══')) return '<hr style="border:none;border-top:1px solid #ccc;margin:6pt 0;">';
    return `<p style="margin:3pt 0;line-height:1.8;">${e}</p>`;
  }).join('\n');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>@page{size:A4;margin:2cm}body{font-family:'SimSun',serif;font-size:12pt;color:#333}</style></head><body>${lines}</body></html>`;
  downloadFile(html, getExportFilename('doc'), 'application/msword;charset=utf-8');
  showToast('Word文档已导出');
}
function downloadFile(content, filename, mime) {
  const blob = new Blob(['\ufeff' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
async function copyReport() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;
  try { await navigator.clipboard.writeText(report); showToast('已复制到剪贴板'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = report; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('已复制到剪贴板');
  }
}

// ========== 记录保存 ==========
function saveToHistory() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;
  if (!STATE.regInfo) { showToast('请先完成登记信息'); return; }

  const { bed, name } = extractPatientInfo();
  const record = {
    id: Date.now(),
    time: new Date().toLocaleString('zh-CN'),
    ward: STATE.regInfo.ward,
    nurseName: STATE.regInfo.nurseName,
    nurseId: STATE.regInfo.nurseId,
    bed, name,
    report,
    isbarData: {
      I: $('isbarI').value, S: $('isbarS').value, B: $('isbarB').value,
      A: $('isbarA').value, R: $('isbarR').value,
    },
  };

  const records = getRecords();
  records.unshift(record);
  saveRecords(records);
  showToast('已保存到交班记录');
  closeModal($('modalPreview'));
}

/** 暂存（未完成也可保存） */
function draftSave() {
  if (!STATE.regInfo) { showToast('请先完成登记信息'); return; }

  // 检查是否有任何内容
  const hasContent = ['isbarI','isbarS','isbarB','isbarA','isbarR','unclassified'].some(id => {
    const el = $(id); return el && el.value.trim();
  });
  if (!hasContent) { showToast('请至少录入一些内容后再暂存'); return; }

  const { bed, name } = extractPatientInfo();
  const partialReport = generateReport() || '（未完成交班）';

  const record = {
    id: Date.now(),
    time: new Date().toLocaleString('zh-CN'),
    ward: STATE.regInfo.ward,
    nurseName: STATE.regInfo.nurseName,
    nurseId: STATE.regInfo.nurseId,
    bed, name,
    report: partialReport,
    isDraft: true,
    isbarData: {
      I: $('isbarI').value, S: $('isbarS').value, B: $('isbarB').value,
      A: $('isbarA').value, R: $('isbarR').value,
    },
  };

  const records = getRecords();
  records.unshift(record);
  saveRecords(records);
  showToast('内容已暂存，可随时在查找中加载继续编辑');
}

// ========== 记录查询 ==========
function searchRecords() {
  renderRecordsList();
}
function renderRecordsList() {
  let records = getRecords();
  const search = ($('searchInput').value || '').toLowerCase();
  const filterWard = $('filterWard').value;

  if (search) {
    records = records.filter(r =>
      (r.nurseName && r.nurseName.toLowerCase().includes(search)) ||
      (r.nurseId && r.nurseId.toLowerCase().includes(search))
    );
  }
  if (filterWard) {
    records = records.filter(r => r.ward === filterWard);
  }

  const list = $('recordsList');
  if (records.length === 0) {
    list.innerHTML = '<p class="empty-hint">暂无匹配的交班记录</p>';
    return;
  }

  list.innerHTML = records.map(r => {
    const preview = (r.report || '').replace(/\n/g, ' ').substring(0, 60) + '...';
    return `
      <div class="record-item" onclick="viewRecordDetail(${r.id})">
        <div class="record-item-header">
          <span class="record-item-title">${r.bed} ${r.name} ISBAR交班记录</span>
          <span class="record-item-meta">${r.ward} | ${r.nurseName} | ${r.time}</span>
        </div>
        <div class="record-item-preview">${preview}</div>
        <div class="record-item-actions" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-primary" onclick="loadRecordToEditor(${r.id})">加载编辑</button>
          <button class="btn btn-sm btn-outline" onclick="deleteRecordById(${r.id})">删除</button>
        </div>
      </div>`;
  }).join('');
}

function viewRecordDetail(id) {
  const records = getRecords();
  const r = records.find(r => r.id === id);
  if (!r) return;
  STATE.currentReport = r.report;
  const html = r.report.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/【(.*?)】/g,'<h3>【$1】</h3>').replace(/\n/g,'<br>');
  $('reportContent').innerHTML = html;
  $('btnSaveHistory').style.display = 'none';
  openModal($('modalPreview'));
  $('btnSaveHistory').style.display = '';
}

function loadRecordToEditor(id) {
  const records = getRecords();
  const r = records.find(r => r.id === id);
  if (!r) return;
  if (r.isbarData) {
    $('isbarI').value = r.isbarData.I || '';
    $('isbarS').value = r.isbarData.S || '';
    $('isbarB').value = r.isbarData.B || '';
    $('isbarA').value = r.isbarData.A || '';
    $('isbarR').value = r.isbarData.R || '';
  }
  STATE.currentReport = r.report || '';
  showEditorView();
  showToast('已加载记录，可继续编辑');
}
function deleteRecordById(id) {
  if (!confirm('确定删除此记录？')) return;
  let records = getRecords();
  records = records.filter(r => r.id !== id);
  saveRecords(records);
  renderRecordsList();
  showToast('记录已删除');
}

// ========== PWA ==========
function initPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    STATE.deferredPrompt = e;
    $('btnInstall').style.display = 'inline-flex';
  });
  window.addEventListener('appinstalled', () => {
    $('btnInstall').style.display = 'none';
    STATE.deferredPrompt = null;
  });
  if (window.matchMedia('(display-mode: standalone)').matches) {
    $('btnInstall').style.display = 'none';
  }
}
async function installPWA() {
  if (!STATE.deferredPrompt) { showToast('应用已安装或不支持安装'); return; }
  STATE.deferredPrompt.prompt();
  const { outcome } = await STATE.deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    STATE.deferredPrompt = null;
    $('btnInstall').style.display = 'none';
  }
}
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

// ========== 事件绑定 ==========
function bindEvents() {
  // 麦克风
  document.querySelectorAll('.btn-mic').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.target;
      if (tid) Speech.toggle(tid);
    });
  });
  $('btnStopRecording').addEventListener('click', () => Speech.stop());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && Speech.isRecording) { e.preventDefault(); Speech.stop(); }
  });

  // 查询输入框回车搜索
  $('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchRecords();
  });

  // 视图切换
  $('btnSearch').addEventListener('click', showRecordsView);
  $('btnNewRecord').addEventListener('click', () => {
    if (!STATE.regInfo) { showRegisterInfoModal(); return; }
    clearEditorForm();
    showEditorView();
  });

  // 生成/导出
  $('btnGenerate').addEventListener('click', previewReport);
  $('btnExportTXT').addEventListener('click', exportTXT);
  $('btnExportDOCX').addEventListener('click', exportDOCX);
  // 暂存
  $('btnDraftSave').addEventListener('click', draftSave);

  // 预览弹窗
  $('btnClosePreview').addEventListener('click', () => closeModal($('modalPreview')));
  $('btnClosePreview2').addEventListener('click', () => closeModal($('modalPreview')));
  $('modalPreview').addEventListener('click', e => { if (e.target === $('modalPreview')) closeModal($('modalPreview')); });
  $('btnCopyReport').addEventListener('click', copyReport);
  $('btnSaveHistory').addEventListener('click', saveToHistory);

  // 退出
  $('btnLogout').addEventListener('click', logout);

  // PWA
  $('btnInstall').addEventListener('click', installPWA);

  // 快捷键
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      previewReport();
    }
  });
}

// ========== 更新UI ==========
function updateUI() {
  // 管理员可以看到所有功能
  if (STATE.currentUser && STATE.currentUser.role === 'admin') {
    // 管理员也可以访问所有记录
  }
}

// ========== 初始化 ==========
function init() {
  Speech.init();
  registerSW();
  initPWA();

  // 初始化默认账号（每个设备首次打开时自动创建，确保所有设备使用同一套账号）
  initDefaultUsers();

  // 确保登录遮罩在最前面
  $('loginOverlay').classList.remove('hide');
  $('appMain').style.display = 'none';

  bindEvents();
  switchLoginTab(0, document.querySelector('.login-tab'));
  console.log('智交班 v3 - 登录系统 + 实时语音录入 + 记录管理 已就绪');
}

/** 初始化默认账号：每个设备首次打开时自动创建，保证电脑和手机用同一套账号登录 */
function initDefaultUsers() {
  const users = getUsers();
  if (users.length > 0) return; // 已有账号，不重复创建

  const defaultUsers = [
    { id: 'admin',    name: '管理员', password: 'admin123', role: 'admin' },
    { id: '1001',     name: '护士A',  password: '123456',   role: 'user' },
    { id: '1002',     name: '护士B',  password: '123456',   role: 'user' },
    { id: '1003',     name: '护士C',  password: '123456',   role: 'user' },
  ];
  saveUsers(defaultUsers);
  console.log('默认账号已初始化：admin、1001、1002、1003');
}

document.addEventListener('DOMContentLoaded', init);