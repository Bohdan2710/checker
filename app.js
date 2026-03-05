window.codeStorage = {};
window.zipStorage = {};
window.projectPages = {};
window.currentPreviewZip = null;

const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const reportsContainer = document.getElementById('reportsContainer');

const codeModal = document.getElementById('codeModal');
const previewModal = document.getElementById('previewModal');

window.onclick = function (event) {
  if (event.target == codeModal) closeCodeModal();
  if (event.target == previewModal) closePreviewModal();
}
document.addEventListener('keydown', function (event) {
  if (event.key === "Escape") { closeCodeModal(); closePreviewModal(); }
});

function closeCodeModal() { codeModal.style.display = "none"; }
function closePreviewModal() {
  previewModal.style.display = "none";
  document.getElementById('liveIframe').srcdoc = "";
  window.currentPreviewZip = null;
}

window.openModal = function (id, title) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalCode').textContent = window.codeStorage[id] || "Код не найден.";
  codeModal.style.display = "block";
}

fileInput.addEventListener('change', handleFiles);

async function handleFiles(event) {
  const files = event.target.files;
  if (!files.length) return;

  reportsContainer.innerHTML = '';
  window.codeStorage = {};
  window.zipStorage = {};
  window.projectPages = {};
  loading.style.display = 'block';

  try {
    for (const file of files) {
      await processZipFile(file);
    }
  } catch (e) {
    alert('Ошибка: ' + e.message);
  } finally {
    loading.style.display = 'none';
    fileInput.value = '';
  }
}

async function processZipFile(file) {
  const zipId = 'zip_' + Math.random().toString(36).substr(2, 9);
  const section = createArchiveSection(file.name, zipId);
  reportsContainer.appendChild(section);

  const rootPanel = section.querySelector('.status-panel');
  const tableBody = section.querySelector('tbody');

  try {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    window.zipStorage[zipId] = contents;

    const allFilePaths = Object.keys(contents.files);
    const htmlFiles = allFilePaths.filter(path => path.endsWith('.html') && !path.startsWith('__MACOSX'));

    window.projectPages[zipId] = htmlFiles;

    await checkRootFiles(contents, allFilePaths, rootPanel);
    await analyzePages(htmlFiles, contents, tableBody, zipId);

  } catch (e) {
    section.querySelector('.archive-content').innerHTML += `<p style="color:red">Ошибка: ${e.message}</p>`;
  }
}

function createArchiveSection(fileName, zipId) {
  const div = document.createElement('div');
  div.className = 'archive-container';
  div.innerHTML = `
        <div class="archive-header" onclick="toggleAccordion(this)">
            <span class="archive-title">📂 ${fileName}</span>
            <div class="header-actions">
                <button class="view-code-btn live-preview-btn" style="margin: 0;" onclick="event.stopPropagation(); openProjectPreview('${zipId}')">🌐 Preview Проекта</button>
                <span class="toggle-icon">▼</span>
            </div>
        </div>
        <div class="archive-content">
            <h3>1. Корневые файлы (Robots / Sitemap / LLMs)</h3>
            <div class="status-panel"></div>
            <h3>2. Анализ страниц</h3>
            <div style="overflow-x:auto;">
                <table class="report-table">
                <thead>
                    <tr>
                    <th class="col-file">Файл</th>
                    <th class="col-meta">Meta (Title/Desc)</th>
                    <th class="col-canon">Canonical URL</th>
                    <th class="col-href">Hreflangs (Domains)</th>
                    <th class="col-schema">Микроразметка</th>
                    </tr>
                </thead>
                <tbody></tbody>
                </table>
            </div>
        </div>
      `;
  return div;
}

function toggleAccordion(header) {
  header.classList.toggle('active');
  const content = header.nextElementSibling;
  content.classList.toggle('show');
}

async function checkRootFiles(zip, paths, container) {
  const checks = [
    { name: 'robots.txt', pattern: /robots\.txt$/i },
    { name: 'Sitemap.xml', pattern: /sitemap\.xml$/i },
    { name: 'LLMS File', pattern: /llms.*\.txt$/i },
    { name: 'Manifest', pattern: /manifest(\.json|\.webmanifest)$/i },
    { name: 'Google Verif.', pattern: /google[a-z0-9]+\.html$/i }
  ];

  for (const check of checks) {
    const foundPath = paths.find(path => check.pattern.test(path));
    const div = document.createElement('div');

    let contentHtml = '';
    let statusClass = 'missing';

    if (foundPath) {
      statusClass = 'found';
      contentHtml = `✅ Найден: <br><small class="url-text" style="color:#28a745">${foundPath}</small>`;
      try {
        const fileContent = await zip.file(foundPath).async("string");
        const id = 'root_' + Math.random().toString(36).substr(2, 9);
        window.codeStorage[id] = fileContent;
        contentHtml += `<button class="view-code-btn" onclick="openModal('${id}', '${check.name} - ${foundPath}')">👁 Код</button>`;
      } catch (err) {
        contentHtml += `<br><small style="color:red">Ошибка чтения</small>`;
      }
    } else {
      contentHtml = `❌ Нет`;
    }

    div.className = `status-card ${statusClass}`;
    div.innerHTML = `<strong>${check.name}</strong><div>${contentHtml}</div>`;
    container.appendChild(div);
  }
}

function createModalButton(statusHtml, codeString, modalTitle) {
  if (!codeString || codeString.trim() === "") return `<div>${statusHtml}</div>`;
  const id = 'snip_' + Math.random().toString(36).substr(2, 9);
  window.codeStorage[id] = codeString;
  return `
            <div>
                ${statusHtml}
                <button class="view-code-btn" onclick="openModal('${id}', '${modalTitle}')">👁 Код</button>
            </div>
        `;
}

async function analyzePages(htmlFiles, zipContents, tbody, zipId) {
  const parser = new DOMParser();
  htmlFiles.sort();

  for (const filePath of htmlFiles) {
    const fileData = await zipContents.file(filePath).async("string");
    const doc = parser.parseFromString(fileData, "text/html");
    const tr = document.createElement('tr');

    const title = doc.querySelector('title') ? doc.querySelector('title').innerText : '';
    const descTag = doc.querySelector('meta[name="description"]');
    const desc = descTag ? descTag.getAttribute('content') : '';

    let metaHtml = '';
    if (title) metaHtml += `<div class="meta-tag-info"><span class="meta-label">T:</span> ${title.substring(0, 50)}${title.length > 50 ? '...' : ''} (${title.length})</div>`;
    else metaHtml += `<div class="meta-tag-info" style="color:red">Нет Title</div>`;

    if (desc) metaHtml += `<div class="meta-tag-info"><span class="meta-label">D:</span> ${desc.substring(0, 60)}${desc.length > 60 ? '...' : ''} (${desc.length})</div>`;
    else metaHtml += `<div class="meta-tag-info" style="color:orange">Нет Description</div>`;

    const canonicalTag = doc.querySelector('link[rel="canonical"]');
    let canDisplay = '<span class="badge bg-error">Нет</span>';
    let canCode = '';
    if (canonicalTag) {
      canCode = canonicalTag.outerHTML;
      const href = canonicalTag.getAttribute('href');
      canDisplay = href ? `<span class="url-text">${href}</span>` : `<span class="badge bg-warning">href пуст</span>`;
    }
    const canonicalCell = createModalButton(canDisplay, canCode, `Canonical: ${filePath}`);

    const hreflangs = Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]'));
    let hrefDisplay = '<span class="badge bg-gray">Нет</span>';
    let hrefCode = '';
    if (hreflangs.length > 0) {
      hrefCode = hreflangs.map(el => el.outerHTML).join('\n');
      const linksHtml = hreflangs.map(el => {
        const lang = el.getAttribute('hreflang') || "no-lang";
        const url = el.getAttribute('href') || "no-url";
        return `<div class="lang-row"><div><span class="lang-code">${lang}</span></div><span class="url-text">${url}</span></div>`;
      }).join('');
      hrefDisplay = `<div style="max-height:150px; overflow-y:auto;">${linksHtml}</div>`;
    }
    const hreflangCell = createModalButton(hrefDisplay, hrefCode, `Hreflangs: ${filePath}`);

    const jsonLd = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    const microdata = Array.from(doc.querySelectorAll('[itemscope]'));
    let schemaParts = [], schemaCodeBlocks = [];

    if (jsonLd.length > 0) {
      schemaParts.push(`<span class="badge bg-success">JSON-LD: ${jsonLd.length}</span>`);
      schemaCodeBlocks.push("/* JSON-LD Scripts */", ...jsonLd.map(el => el.outerHTML));
    }
    if (microdata.length > 0) {
      schemaParts.push(`<span class="badge bg-info">Micro: ${microdata.length}</span>`);
      schemaCodeBlocks.push("\n/* Microdata Elements */", ...microdata.map(el => el.outerHTML));
    }

    let schemaStatus = schemaParts.length > 0 ? schemaParts.join(' ') : '<span class="badge bg-gray">-</span>';
    const schemaCell = createModalButton(schemaStatus, schemaCodeBlocks.join('\n'), `Schema: ${filePath}`);

    tr.innerHTML = `
            <td>
                <strong>${filePath}</strong><br>
                <button class="view-code-btn live-preview-btn" onclick="openProjectPreview('${zipId}', '${filePath}')">🌐 Live Preview</button>
            </td>
            <td>${metaHtml}</td>
            <td>${canonicalCell}</td>
            <td>${hreflangCell}</td>
            <td>${schemaCell}</td>
        `;
    tbody.appendChild(tr);
  }
}

function resolvePath(basePath, relativePath) {
  if (!relativePath) return '';
  if (relativePath.startsWith('http') || relativePath.startsWith('data:') || relativePath.startsWith('//')) return relativePath;

  if (relativePath.startsWith('/')) {
    return relativePath.substring(1);
  }

  const stack = basePath.split('/').slice(0, -1);
  const parts = relativePath.split('/');
  for (const part of parts) {
    if (part === '.' || part === "") continue; // Игнорируем пустые части и текущую директорию
    if (part === '..') {
      if (stack.length > 0) stack.pop(); // Защита от выхода за пределы корня
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

async function replaceCssUrls(cssText, cssPath, zip) {
  const urlRegex = /url\(\s*(['"]?)(?!data:|http:|https:|#)([^'")]+)\1\s*\)/gi;
  const matches = [...cssText.matchAll(urlRegex)];

  for (const match of matches) {
    const originalUrl = match[2];
    const cleanUrl = originalUrl.split('?')[0].split('#')[0];
    const resolvedAssetPath = resolvePath(cssPath, cleanUrl);

    if (zip.file(resolvedAssetPath)) {
      const base64 = await zip.file(resolvedAssetPath).async("base64");
      const ext = resolvedAssetPath.split('.').pop().toLowerCase();
      let mime = 'image/jpeg';
      if (ext === 'png') mime = 'image/png';
      else if (ext === 'svg') mime = 'image/svg+xml';
      else if (ext === 'gif') mime = 'image/gif';
      else if (ext === 'webp') mime = 'image/webp';
      else if (ext === 'avif') mime = 'image/avif';
      else if (ext === 'woff2') mime = 'font/woff2';
      else if (ext === 'woff') mime = 'font/woff';
      else if (ext === 'ttf') mime = 'font/ttf';

      const dataUrl = `data:${mime};base64,${base64}`;
      cssText = cssText.replace(match[0], `url("${dataUrl}")`);
    } else {
      console.warn('CSS Asset not found in ZIP:', resolvedAssetPath);
    }
  }
  return cssText;
}

window.openProjectPreview = function (zipId, startFilePath = null) {
  window.currentPreviewZip = zipId;
  const pages = window.projectPages[zipId] || [];

  if (pages.length === 0) return alert('HTML файлы не найдены в архиве.');

  const selector = document.getElementById('pageSelector');
  selector.innerHTML = '';
  pages.forEach(page => {
    const opt = document.createElement('option');
    opt.value = page;
    opt.textContent = page;
    selector.appendChild(opt);
  });

  let targetPage = startFilePath;
  if (!targetPage || !pages.includes(targetPage)) {
    targetPage = pages.find(p => p.toLowerCase().endsWith('index.html')) || pages[0];
  }

  selector.value = targetPage;

  document.getElementById('previewModal').style.display = 'block';

  // Сброс ширины на 100% при открытии нового проекта
  document.getElementById('widthSlider').value = 2500;
  changeIframeWidth(2500);

  loadPreviewPage(zipId, targetPage);
};

window.switchPreviewPage = function (filePath) {
  if (window.currentPreviewZip) {
    loadPreviewPage(window.currentPreviewZip, filePath);
  }
};

async function loadPreviewPage(zipId, filePath) {
  const zip = window.zipStorage[zipId];
  if (!zip) return alert('Архив не найден в памяти.');

  const iframe = document.getElementById('liveIframe');

  iframe.srcdoc = "<html><body style='font-family:sans-serif; text-align:center; padding-top:20%;'>Собираем страницу (встраиваем стили и картинки)...</body></html>";

  try {
    const fileData = await zip.file(filePath).async("string");
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileData, "text/html");

    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (let link of links) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('//')) {
        const resolved = resolvePath(filePath, href.split('?')[0]);
        if (zip.file(resolved)) {
          let cssText = await zip.file(resolved).async("string");
          cssText = await replaceCssUrls(cssText, resolved, zip);
          const style = doc.createElement('style');
          style.textContent = cssText;
          link.replaceWith(style);
        } else {
          console.warn('CSS not found in ZIP:', resolved);
        }
      }
    }

    const imgs = doc.querySelectorAll('img');
    for (let img of imgs) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
        const resolved = resolvePath(filePath, src.split('?')[0]);
        if (zip.file(resolved)) {
          const base64 = await zip.file(resolved).async("base64");
          const ext = resolved.split('.').pop().toLowerCase();
          let mime = 'image/jpeg';
          if (ext === 'png') mime = 'image/png';
          else if (ext === 'svg') mime = 'image/svg+xml';
          else if (ext === 'gif') mime = 'image/gif';
          else if (ext === 'webp') mime = 'image/webp';
          else if (ext === 'avif') mime = 'image/avif';

          img.setAttribute('src', `data:${mime};base64,${base64}`);
        } else {
          console.warn('Image not found in ZIP:', resolved);
        }
      }
    }

    const sources = doc.querySelectorAll('source');
    for (let source of sources) {
      const srcset = source.getAttribute('srcset');
      if (srcset && !srcset.startsWith('http') && !srcset.startsWith('data:') && !srcset.startsWith('//')) {
        const resolved = resolvePath(filePath, srcset.split('?')[0]);
        if (zip.file(resolved)) {
          const base64 = await zip.file(resolved).async("base64");
          const ext = resolved.split('.').pop().toLowerCase();
          let mime = 'image/jpeg';
          if (ext === 'png') mime = 'image/png';
          else if (ext === 'svg') mime = 'image/svg+xml';
          else if (ext === 'gif') mime = 'image/gif';
          else if (ext === 'webp') mime = 'image/webp';
          else if (ext === 'avif') mime = 'image/avif';

          source.setAttribute('srcset', `data:${mime};base64,${base64}`);
        }
      }
    }

    const scripts = doc.querySelectorAll('script[src]');
    for (let script of scripts) {
      const src = script.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('//')) {
        const resolved = resolvePath(filePath, src.split('?')[0]);
        if (zip.file(resolved)) {
          const jsText = await zip.file(resolved).async("string");
          const newScript = doc.createElement('script');
          newScript.textContent = jsText;
          script.replaceWith(newScript);
        }
      }
    }

    const interceptScript = doc.createElement('script');
    interceptScript.textContent = `
      document.addEventListener('click', function(e) {
          const a = e.target.closest('a');
          if (a) {
              const href = a.getAttribute('href');
              if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
              
              if (href.startsWith('#')) return; 
              
              e.preventDefault();
              e.stopPropagation(); 
              window.parent.handleIframeLinkClick('${zipId}', '${filePath}', href);
          }
      }, true);

      document.addEventListener('submit', function(e) {
          e.preventDefault();
          e.stopPropagation();
      }, true);
    `;

    if (doc.head) doc.head.appendChild(interceptScript);
    else doc.documentElement.appendChild(interceptScript);

    iframe.srcdoc = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

  } catch (e) {
    iframe.srcdoc = `<html><body><h2 style="color:red">Ошибка рендера</h2><p>${e.message}</p></body></html>`;
  }
}

// Обработка кликов по ссылкам ВНУТРИ iframe
window.handleIframeLinkClick = function (zipId, currentFilePath, href) {
  let cleanHref = href.split('?')[0].split('#')[0];

  if (!cleanHref || cleanHref === '/' || cleanHref === './') cleanHref = 'index.html';

  let resolved = resolvePath(currentFilePath, cleanHref);

  // ИСПРАВЛЕНИЕ: Если путь разрешился в корень (пустая строка), направляем на главную
  if (resolved === '') {
    resolved = 'index.html';
  }

  if (resolved.startsWith('/')) resolved = resolved.substring(1);

  const pages = window.projectPages[zipId] || [];

  function openPage(pagePath) {
    document.getElementById('pageSelector').value = pagePath;
    window.switchPreviewPage(pagePath);
  }

  // 1. Точное совпадение
  if (pages.includes(resolved)) return openPage(resolved);

  // 2. Ссылка на папку
  let withIndex = resolved.endsWith('/') ? resolved + 'index.html' : resolved + '/index.html';
  if (pages.includes(withIndex)) return openPage(withIndex);

  // 3. Без расширения .html
  let withHtml = resolved.endsWith('.html') ? resolved : resolved + '.html';
  if (pages.includes(withHtml)) return openPage(withHtml);

  // 4. Умный поиск (обход проблем с корневыми папками архива)
  let strippedHref = cleanHref.replace(/^\/+/, '');
  let fallback = pages.find(p =>
    p === strippedHref ||
    p.endsWith('/' + strippedHref) ||
    p === strippedHref + '/index.html' ||
    p.endsWith('/' + strippedHref + '/index.html') ||
    p === strippedHref + '.html' ||
    p.endsWith('/' + strippedHref + '.html')
  );

  if (fallback) return openPage(fallback);

  alert('Страница не найдена в архиве: ' + href);
};

// Изменение ширины
window.changeIframeWidth = function (value) {
  const iframe = document.getElementById('liveIframe');
  const valDisplay = document.getElementById('widthValue');

  if (value >= 2500) {
    iframe.style.width = '100%';
    valDisplay.textContent = '100%';
  } else {
    iframe.style.width = value + 'px';
    valDisplay.textContent = value + 'px';
  }
}

// Настоящий полноэкранный режим (на уровне браузера)
window.toggleFullscreenPreview = function () {
  const previewModal = document.getElementById('previewModal');
  const btn = document.getElementById('fullscreenBtn');

  // Проверяем, находимся ли мы уже в полноэкранном режиме
  if (!document.fullscreenElement) {
    // Запрашиваем полноэкранный режим для модального окна
    if (previewModal.requestFullscreen) {
      previewModal.requestFullscreen();
    } else if (previewModal.webkitRequestFullscreen) { /* Safari */
      previewModal.webkitRequestFullscreen();
    } else if (previewModal.msRequestFullscreen) { /* IE11 */
      previewModal.msRequestFullscreen();
    }
    btn.innerHTML = '🗗 Свернуть';
  } else {
    // Выходим из полноэкранного режима
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
      document.msExitFullscreen();
    }
    btn.innerHTML = '⛶ На весь экран';
  }
}