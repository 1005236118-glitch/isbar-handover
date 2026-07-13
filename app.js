/* ==========================================
   智交班 - 核心业务逻辑
   纯前端实现 | ISBAR智能分类 | OCR识别 | 本地存储
   ========================================== */

// ========== 全局状态管理 ==========
const STATE = {
  currentImage: null,        // 当前图片 base64
  originalImage: null,       // 原始图片（调节亮度前）
  ocrText: '',               // OCR识别原始文本
  brightness: 100,           // 亮度值
  currentReport: '',         // 当前生成的交班文稿
  ocrWorker: null,           // Tesseract.js worker实例
  cameraStream: null,        // 摄像头流
  deferredPrompt: null,      // PWA安装事件
};

// ========== 常量配置 ==========
const STORAGE_KEY = 'isbar_history';
const MAX_HISTORY = 10;

// ISBAR 关键词规则库（神经疾病病区专用）
const ISBAR_KEYWORDS = {
  I: {
    strong: ['床号', '姓名', '性别', '年龄', '住院号', '入院诊断', '诊断', '病案号', '病历号'],
    weak: ['科室', '病区', '入院日期', '联系人', '医保'],
  },
  S: {
    strong: ['主诉', '入院时', '入院时间', '病情变化', '手术', '瞳孔', '肌力', '肢体无力',
             '突发', '支架', '取栓', '溶栓', '介入', '术后', '术前', '神经功能', '意识',
             '发病', '症状', '体征', '危重', '抢救'],
    weak: ['好转', '平稳', '恶化', '加重', '缓解', '持续', '发作', '昏迷'],
  },
  B: {
    strong: ['既往史', '过敏史', '用药', 'MRI', 'CT', '留置', '胃管', '尿管', '深静脉',
             '静脉留置', '皮肤', '压红', '病史', '检查结果', '检验', '超声', '心电图',
             '过敏', '口服', '注射', '导管', '引流管'],
    weak: ['高血压', '糖尿病', '心脏病', '冠心病', '房颤', '吸烟', '饮酒', '手术史'],
  },
  A: {
    strong: ['生命体征', '血压', '心率', '血氧', '体温', '出入量', '压疮', '坠床',
             '疼痛评分', '风险评分', '评分', '肌力评估', '神志', '瞳孔', '对光反射',
             'NIHSS', 'GCS', 'mRS'],
    weak: ['饮食', '睡眠', '大小便', '呼吸', '脉搏', '饱和度', '入量', '出量'],
  },
  R: {
    strong: ['护理重点', '监测', '康复', '会诊', '采血', '治疗方案', '指导', '注意事项',
             '心电监护', '复查', '随访', '健康宣教'],
    weak: ['观察', '评估', '计划', '建议', '调整', '继续'],
  },
};

// ========== DOM 元素引用 ==========
const $ = (id) => document.getElementById(id);

const DOM = {
  // 导航栏
  btnInstall: $('btnInstall'),
  btnHistory: $('btnHistory'),
  btnClear: $('btnClear'),

  // 上传区
  btnUpload: $('btnUpload'),
  btnCamera: $('btnCamera'),
  fileInput: $('fileInput'),
  previewArea: $('previewArea'),
  previewPlaceholder: $('previewPlaceholder'),
  imgPreview: $('imgPreview'),
  previewToolbar: $('previewToolbar'),
  brightnessSlider: $('brightnessSlider'),
  brightnessValue: $('brightnessValue'),
  btnRemoveImage: $('btnRemoveImage'),
  btnOCR: $('btnOCR'),
  ocrStatus: $('ocrStatus'),
  ocrText: $('ocrText'),
  btnClassify: $('btnClassify'),

  // ISBAR编辑区
  isbarI: $('isbarI'),
  isbarS: $('isbarS'),
  isbarB: $('isbarB'),
  isbarA: $('isbarA'),
  isbarR: $('isbarR'),
  unclassified: $('unclassified'),

  // 底部操作
  btnGenerate: $('btnGenerate'),
  btnExportTXT: $('btnExportTXT'),
  btnExportDOCX: $('btnExportDOCX'),

  // 弹窗
  modalPreview: $('modalPreview'),
  reportContent: $('reportContent'),
  modalHistory: $('modalHistory'),
  historyList: $('historyList'),
  modalCamera: $('modalCamera'),
  cameraVideo: $('cameraVideo'),
  cameraCanvas: $('cameraCanvas'),
  modalConfirm: $('modalConfirm'),

  // Toast
  toast: $('toast'),
};

// ========== 工具函数 ==========

/** 显示Toast提示 */
function showToast(message, duration = 2000) {
  DOM.toast.textContent = message;
  DOM.toast.style.display = 'block';
  // 重置动画
  DOM.toast.style.animation = 'none';
  DOM.toast.offsetHeight; // 触发回流
  DOM.toast.style.animation = 'toastIn 0.3s ease';
  clearTimeout(DOM.toast._timeout);
  DOM.toast._timeout = setTimeout(() => {
    DOM.toast.style.display = 'none';
  }, duration);
}

/** 打开弹窗 */
function openModal(modal) {
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/** 关闭弹窗 */
function closeModal(modal) {
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

/** 从base64图片获取文件名信息 */
function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** 提取床号和姓名（用于文件名） */
function extractPatientInfo() {
  const iText = DOM.isbarI.value || '';
  const bedMatch = iText.match(/床号[：:]\s*(\S+)/);
  const nameMatch = iText.match(/姓名[：:]\s*(\S+)/);
  const bed = bedMatch ? bedMatch[1] : '未知';
  const name = nameMatch ? nameMatch[1] : '未知';
  return { bed, name };
}

// ========== 图片处理 ==========

/** 选择图片文件 */
function handleFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    STATE.originalImage = e.target.result;
    STATE.currentImage = e.target.result;
    STATE.brightness = 100;
    displayImage(STATE.currentImage);
    DOM.brightnessSlider.value = 100;
    DOM.brightnessValue.textContent = '100%';
    DOM.btnOCR.disabled = false;
    DOM.ocrStatus.textContent = '';
  };
  reader.readAsDataURL(file);
}

/** 显示图片预览 */
function displayImage(src) {
  DOM.imgPreview.src = src;
  DOM.imgPreview.style.display = 'block';
  DOM.previewPlaceholder.style.display = 'none';
  DOM.previewToolbar.style.display = 'flex';
  // 应用亮度滤镜
  DOM.imgPreview.style.filter = `brightness(${STATE.brightness}%)`;
}

/** 移除图片 */
function removeImage() {
  STATE.currentImage = null;
  STATE.originalImage = null;
  STATE.brightness = 100;
  DOM.imgPreview.src = '';
  DOM.imgPreview.style.display = 'none';
  DOM.imgPreview.style.filter = '';
  DOM.previewPlaceholder.style.display = 'flex';
  DOM.previewToolbar.style.display = 'none';
  DOM.btnOCR.disabled = true;
  DOM.ocrStatus.textContent = '';
  DOM.brightnessSlider.value = 100;
  DOM.brightnessValue.textContent = '100%';
}

/** 调节亮度 */
function adjustBrightness(value) {
  STATE.brightness = parseInt(value);
  DOM.brightnessValue.textContent = value + '%';
  DOM.imgPreview.style.filter = `brightness(${value}%)`;
}

/** 对图片应用亮度调整，返回调整后的base64 */
function applyBrightnessToImage(src, brightness) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.filter = `brightness(${brightness}%)`;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = src;
  });
}

// ========== 摄像头拍照 ==========

/** 打开摄像头 */
async function openCamera() {
  try {
    DOM.modalCamera.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    STATE.cameraStream = stream;
    DOM.cameraVideo.srcObject = stream;
  } catch (err) {
    closeModal(DOM.modalCamera);
    if (err.name === 'NotAllowedError') {
      showToast('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问');
    } else if (err.name === 'NotFoundError') {
      showToast('未检测到摄像头设备');
    } else {
      showToast('摄像头启动失败：' + err.message);
    }
  }
}

/** 关闭摄像头 */
function closeCamera() {
  if (STATE.cameraStream) {
    STATE.cameraStream.getTracks().forEach((track) => track.stop());
    STATE.cameraStream = null;
  }
  DOM.cameraVideo.srcObject = null;
  closeModal(DOM.modalCamera);
}

/** 拍照 */
function capturePhoto() {
  const video = DOM.cameraVideo;
  const canvas = DOM.cameraCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  STATE.originalImage = dataUrl;
  STATE.currentImage = dataUrl;
  STATE.brightness = 100;
  displayImage(STATE.currentImage);
  DOM.brightnessSlider.value = 100;
  DOM.brightnessValue.textContent = '100%';
  DOM.btnOCR.disabled = false;
  DOM.ocrStatus.textContent = '';
  closeCamera();
  showToast('拍照成功');
}

// ========== OCR 识别 ==========

/** 执行OCR识别 */
async function runOCR() {
  if (!STATE.currentImage) {
    showToast('请先上传图片');
    return;
  }

  DOM.btnOCR.disabled = true;
  DOM.ocrStatus.innerHTML = '<div class="ocr-progress-bar"><div class="fill"></div></div> 正在加载OCR引擎...';
  DOM.ocrStatus.className = 'ocr-status progress';

  try {
    // 应用亮度调整到图片
    const processedImage = await applyBrightnessToImage(STATE.currentImage, STATE.brightness);

    // 初始化 Tesseract Worker（简体中文）
    if (STATE.ocrWorker) {
      await STATE.ocrWorker.terminate();
    }
    STATE.ocrWorker = await Tesseract.createWorker('chi_sim', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          DOM.ocrStatus.innerHTML = `<div class="ocr-progress-bar"><div class="fill" style="width:${pct}%"></div></div> 正在识别文字... ${pct}%`;
        }
      },
    });

    // 执行识别
    DOM.ocrStatus.innerHTML = '<div class="ocr-progress-bar"><div class="fill" style="width:90%"></div></div> 正在识别文字...';
    const { data: { text } } = await STATE.ocrWorker.recognize(processedImage);

    STATE.ocrText = text.trim();
    DOM.ocrText.value = STATE.ocrText;
    DOM.btnClassify.disabled = !STATE.ocrText;

    DOM.ocrStatus.innerHTML = '识别完成';
    DOM.ocrStatus.className = 'ocr-status';
    showToast('OCR识别完成');

    if (!STATE.ocrText) {
      DOM.ocrStatus.innerHTML = '未识别到文字，请检查图片清晰度后重试';
      DOM.ocrStatus.className = 'ocr-status error';
    }
  } catch (err) {
    console.error('OCR识别失败:', err);
    DOM.ocrStatus.innerHTML = '识别失败：' + (err.message || '未知错误');
    DOM.ocrStatus.className = 'ocr-status error';
  } finally {
    DOM.btnOCR.disabled = false;
  }
}

// ========== ISBAR 智能分类 ==========

/** 对单行文本进行ISBAR分类打分 */
function scoreLine(line, keywords) {
  let score = 0;
  for (const kw of keywords.strong) {
    if (line.includes(kw)) score += 3;
  }
  for (const kw of keywords.weak) {
    if (line.includes(kw)) score += 1;
  }
  return score;
}

/** 自动分类到ISBAR */
function classifyISBAR() {
  const text = DOM.ocrText.value.trim();
  if (!text) {
    showToast('请先执行OCR识别或手动输入文本');
    return;
  }

  // 按句号、换行、分号分割文本
  const lines = text.split(/[。\n；;]+/).map(s => s.trim()).filter(s => s.length > 3);

  const classified = { I: [], S: [], B: [], A: [], R: [], unclassified: [] };

  for (const line of lines) {
    const scores = {
      I: scoreLine(line, ISBAR_KEYWORDS.I),
      S: scoreLine(line, ISBAR_KEYWORDS.S),
      B: scoreLine(line, ISBAR_KEYWORDS.B),
      A: scoreLine(line, ISBAR_KEYWORDS.A),
      R: scoreLine(line, ISBAR_KEYWORDS.R),
    };

    // 找到最高分
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) {
      classified.unclassified.push(line);
    } else {
      // 找到得分最高的类别（如有并列取第一个）
      const bestCategory = Object.keys(scores).find(k => scores[k] === maxScore);
      classified[bestCategory].push(line);
    }
  }

  // 填入对应输入框
  DOM.isbarI.value = classified.I.join('；') + (classified.I.length ? '。' : '');
  DOM.isbarS.value = classified.S.join('；') + (classified.S.length ? '。' : '');
  DOM.isbarB.value = classified.B.join('；') + (classified.B.length ? '。' : '');
  DOM.isbarA.value = classified.A.join('；') + (classified.A.length ? '。' : '');
  DOM.isbarR.value = classified.R.join('；') + (classified.R.length ? '。' : '');
  DOM.unclassified.value = classified.unclassified.join('\n');

  const totalClassified = classified.I.length + classified.S.length + classified.B.length +
                          classified.A.length + classified.R.length;
  showToast(`已自动分类 ${totalClassified} 条内容，${classified.unclassified.length} 条待手动归类`);
}

// ========== 交班文稿生成 ==========

/** 生成完整交班文稿 */
function generateReport() {
  const i = DOM.isbarI.value.trim();
  const s = DOM.isbarS.value.trim();
  const b = DOM.isbarB.value.trim();
  const a = DOM.isbarA.value.trim();
  const r = DOM.isbarR.value.trim();

  // 检查是否至少有一个模块有内容
  if (!i && !s && !b && !a && !r) {
    showToast('请至少填写一个ISBAR模块的内容');
    return '';
  }

  const date = getTodayDate();
  let report = '═══════════════════════════════════════\n';
  report += '       神经科 ISBAR 交班记录\n';
  report += '═══════════════════════════════════════\n\n';
  report += `交班日期：${date}\n\n`;

  if (i) {
    report += '【I - 身份确认 Identification】\n';
    report += '─────────────────────────────────\n';
    report += i + '\n\n';
  }

  if (s) {
    report += '【S - 患者情况 Situation】\n';
    report += '─────────────────────────────────\n';
    report += s + '\n\n';
  }

  if (b) {
    report += '【B - 背景信息 Background】\n';
    report += '─────────────────────────────────\n';
    report += b + '\n\n';
  }

  if (a) {
    report += '【A - 综合评估 Assessment】\n';
    report += '─────────────────────────────────\n';
    report += a + '\n\n';
  }

  if (r) {
    report += '【R - 护理建议 Recommendation】\n';
    report += '─────────────────────────────────\n';
    report += r + '\n\n';
  }

  report += '═══════════════════════════════════════\n';
  report += '  交班人：___________  接班人：___________\n';
  report += '═══════════════════════════════════════\n';

  STATE.currentReport = report;
  return report;
}

/** 预览交班文稿 */
function previewReport() {
  const report = generateReport();
  if (!report) return;

  // 渲染为HTML格式的预览
  const htmlReport = report
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/【(.*?)】/g, '<h3>【$1】</h3>')
    .replace(/──+/g, '')
    .replace(/═══+/g, '')
    .replace(/\n/g, '<br>');

  DOM.reportContent.innerHTML = htmlReport;
  openModal(DOM.modalPreview);
}

// ========== 导出功能 ==========

/** 生成导出文件名 */
function getExportFilename(ext) {
  const { bed, name } = extractPatientInfo();
  const date = getTodayDate();
  return `${bed}_${name}_ISBAR交班记录_${date}.${ext}`;
}

/** 导出TXT */
function exportTXT() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;

  const blob = new Blob(['\ufeff' + report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getExportFilename('txt');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('TXT文件已导出');
}

/** 导出Word（.doc格式，Word可直接打开） */
function exportDOCX() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;

  // 将纯文本报告转换为HTML格式，Word可识别
  const htmlLines = report.split('\n').map(line => {
    const escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/ /g, '&nbsp;');
    if (escaped.startsWith('【') && escaped.includes('】')) {
      return `<p style="font-weight:bold;font-size:15pt;color:#1a73e8;margin:12pt 0 6pt 0;">${escaped}</p>`;
    }
    if (escaped.includes('──') || escaped.includes('══')) {
      return '<hr style="border:none;border-top:1px solid #ccc;margin:6pt 0;">';
    }
    return `<p style="margin:3pt 0;line-height:1.8;">${escaped}</p>`;
  }).join('\n');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if gte mso 9]><xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml><![endif]-->
      <style>
        @page { size: A4; margin: 2cm; }
        body { font-family: 'SimSun', '宋体', serif; font-size: 12pt; color: #333; }
      </style>
    </head>
    <body>${htmlLines}</body>
    </html>`;

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getExportFilename('doc');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Word文档已导出');
}

/** 复制到剪贴板 */
async function copyReport() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;

  try {
    await navigator.clipboard.writeText(report);
    showToast('已复制到剪贴板');
  } catch (err) {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = report;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制到剪贴板');
  }
}

// ========== 本地存储管理 ==========

/** 保存当前交班记录到历史 */
function saveToHistory() {
  const report = STATE.currentReport || generateReport();
  if (!report) return;

  const { bed, name } = extractPatientInfo();
  const record = {
    id: Date.now(),
    time: new Date().toLocaleString('zh-CN'),
    bed,
    name,
    report,
    isbarData: {
      I: DOM.isbarI.value,
      S: DOM.isbarS.value,
      B: DOM.isbarB.value,
      A: DOM.isbarA.value,
      R: DOM.isbarR.value,
    },
  };

  let history = getHistory();
  history.unshift(record);
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  showToast('已保存到历史记录');
  closeModal(DOM.modalPreview);
}

/** 获取历史记录 */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** 加载历史记录到表单 */
function loadRecordToForm(record) {
  if (record.isbarData) {
    DOM.isbarI.value = record.isbarData.I || '';
    DOM.isbarS.value = record.isbarData.S || '';
    DOM.isbarB.value = record.isbarData.B || '';
    DOM.isbarA.value = record.isbarData.A || '';
    DOM.isbarR.value = record.isbarData.R || '';
  }
  STATE.currentReport = record.report || '';
  closeModal(DOM.modalHistory);
  showToast('已加载历史记录');
  // 滚动到ISBAR编辑区
  DOM.isbarI.scrollIntoView({ behavior: 'smooth', block: 'start' });
  DOM.isbarI.focus();
}

/** 删除单条历史记录 */
function deleteHistoryRecord(id) {
  let history = getHistory();
  history = history.filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistoryList();
  showToast('记录已删除');
}

/** 清空所有数据 */
function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  // 同时清空当前表单
  DOM.isbarI.value = '';
  DOM.isbarS.value = '';
  DOM.isbarB.value = '';
  DOM.isbarA.value = '';
  DOM.isbarR.value = '';
  DOM.unclassified.value = '';
  DOM.ocrText.value = '';
  STATE.ocrText = '';
  STATE.currentReport = '';
  STATE.currentImage = null;
  STATE.originalImage = null;
  removeImage();
  DOM.btnClassify.disabled = true;
  closeModal(DOM.modalConfirm);
  renderHistoryList();
  showToast('所有数据已清空');
}

/** 渲染历史记录列表 */
function renderHistoryList() {
  const history = getHistory();
  if (history.length === 0) {
    DOM.historyList.innerHTML = '<p class="empty-hint">暂无历史记录</p>';
    return;
  }

  DOM.historyList.innerHTML = history.map((record) => {
    const preview = record.report.replace(/\n/g, ' ').substring(0, 80) + '...';
    return `
      <div class="history-item">
        <div class="history-item-header">
          <span class="history-item-title">${record.bed} ${record.name} ISBAR交班记录</span>
          <span class="history-item-time">${record.time}</span>
        </div>
        <div class="history-item-preview">${preview}</div>
        <div class="history-item-actions">
          <button class="btn btn-sm btn-primary" onclick="loadRecordToFormById(${record.id})">加载使用</button>
          <button class="btn btn-sm btn-outline" onclick="deleteHistoryRecordById(${record.id})">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

// 历史记录列表需要全局函数（因为使用onclick）
function loadRecordToFormById(id) {
  const history = getHistory();
  const record = history.find(r => r.id === id);
  if (record) loadRecordToForm(record);
}
function deleteHistoryRecordById(id) {
  if (confirm('确定删除此记录？')) deleteHistoryRecord(id);
}
// 挂载到全局
window.loadRecordToFormById = loadRecordToFormById;
window.deleteHistoryRecordById = deleteHistoryRecordById;

// ========== PWA 安装 ==========

/** 监听PWA安装事件 */
function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    STATE.deferredPrompt = e;
    DOM.btnInstall.style.display = 'inline-flex';
  });

  // 已安装后隐藏按钮
  window.addEventListener('appinstalled', () => {
    DOM.btnInstall.style.display = 'none';
    STATE.deferredPrompt = null;
    showToast('应用已安装到桌面');
  });

  // 检测是否已以PWA模式运行
  if (window.matchMedia('(display-mode: standalone)').matches) {
    DOM.btnInstall.style.display = 'none';
  }
}

/** 触发PWA安装 */
async function installPWA() {
  if (!STATE.deferredPrompt) {
    showToast('应用已安装或当前浏览器不支持PWA安装');
    return;
  }
  STATE.deferredPrompt.prompt();
  const { outcome } = await STATE.deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    STATE.deferredPrompt = null;
    DOM.btnInstall.style.display = 'none';
  }
}

/** 注册Service Worker */
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker 注册成功:', reg.scope);
        })
        .catch((err) => {
          console.warn('Service Worker 注册失败:', err);
        });
    });
  }
}

// ========== 事件绑定 ==========

function bindEvents() {
  // 上传图片
  DOM.btnUpload.addEventListener('click', () => DOM.fileInput.click());
  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
    e.target.value = ''; // 允许重复选择同一文件
  });

  // 拖拽上传
  DOM.previewArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.previewArea.style.borderColor = 'var(--primary)';
  });
  DOM.previewArea.addEventListener('dragleave', () => {
    DOM.previewArea.style.borderColor = 'var(--border)';
  });
  DOM.previewArea.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.previewArea.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });

  // 摄像头
  DOM.btnCamera.addEventListener('click', openCamera);
  $('btnCloseCamera').addEventListener('click', closeCamera);
  $('btnCloseCamera2').addEventListener('click', closeCamera);
  $('btnCapture').addEventListener('click', capturePhoto);
  // 关闭摄像头弹窗时停止流
  DOM.modalCamera.addEventListener('click', (e) => {
    if (e.target === DOM.modalCamera) closeCamera();
  });

  // 图片操作
  DOM.brightnessSlider.addEventListener('input', (e) => adjustBrightness(e.target.value));
  DOM.btnRemoveImage.addEventListener('click', removeImage);

  // OCR
  DOM.btnOCR.addEventListener('click', runOCR);

  // 分类
  DOM.btnClassify.addEventListener('click', classifyISBAR);

  // 生成和导出
  DOM.btnGenerate.addEventListener('click', previewReport);
  DOM.btnExportTXT.addEventListener('click', exportTXT);
  DOM.btnExportDOCX.addEventListener('click', exportDOCX);

  // 预览弹窗
  $('btnClosePreview').addEventListener('click', () => closeModal(DOM.modalPreview));
  $('btnClosePreview2').addEventListener('click', () => closeModal(DOM.modalPreview));
  DOM.modalPreview.addEventListener('click', (e) => {
    if (e.target === DOM.modalPreview) closeModal(DOM.modalPreview);
  });
  $('btnCopyReport').addEventListener('click', copyReport);
  $('btnSaveHistory').addEventListener('click', saveToHistory);

  // 历史记录
  DOM.btnHistory.addEventListener('click', () => {
    renderHistoryList();
    openModal(DOM.modalHistory);
  });
  $('btnCloseHistory').addEventListener('click', () => closeModal(DOM.modalHistory));
  $('btnCloseHistory2').addEventListener('click', () => closeModal(DOM.modalHistory));
  DOM.modalHistory.addEventListener('click', (e) => {
    if (e.target === DOM.modalHistory) closeModal(DOM.modalHistory);
  });

  // 清空确认
  DOM.btnClear.addEventListener('click', () => openModal(DOM.modalConfirm));
  $('btnConfirmClear').addEventListener('click', clearAllData);
  $('btnCloseConfirm').addEventListener('click', () => closeModal(DOM.modalConfirm));
  $('btnCloseConfirm2').addEventListener('click', () => closeModal(DOM.modalConfirm));
  DOM.modalConfirm.addEventListener('click', (e) => {
    if (e.target === DOM.modalConfirm) closeModal(DOM.modalConfirm);
  });

  // PWA安装
  DOM.btnInstall.addEventListener('click', installPWA);

  // 键盘快捷键 Ctrl+Enter 生成交班文稿
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      previewReport();
    }
  });

  // 窗口关闭前清理OCR Worker
  window.addEventListener('beforeunload', () => {
    if (STATE.ocrWorker) {
      STATE.ocrWorker.terminate();
    }
    if (STATE.cameraStream) {
      STATE.cameraStream.getTracks().forEach(t => t.stop());
    }
  });
}

// ========== 初始化 ==========
function init() {
  bindEvents();
  registerSW();
  initPWA();
  renderHistoryList();
  console.log('智交班 - 神经科ISBAR交班助手 已就绪');
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);