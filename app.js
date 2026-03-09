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
  if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
  }
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

function cleanText(text) {
    if (!text) return text;
    return text.replace(/^[\uFEFF\u200B]+/, '').replace(/[\uFEFF\u200B]/g, '').trim();
}

function resolvePath(basePath, relativePath) {
  if (!relativePath) return '';
  try { relativePath = decodeURIComponent(relativePath); } catch(e) {}

  if (relativePath.startsWith('http') || relativePath.startsWith('data:') || relativePath.startsWith('//')) return relativePath;
  if (relativePath.startsWith('/')) return relativePath.substring(1); 

  const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '';
  const stack = baseDir ? baseDir.split('/') : [];
  const parts = relativePath.split('/');
  
  for (const part of parts) {
    if (part === '.' || part === "") continue; 
    if (part === '..') {
        if (stack.length > 0) stack.pop(); 
    } else {
        stack.push(part);
    }
  }
  return stack.join('/');
}

function getFileFromZip(zip, path) {
    if (!path) return null;

    let cleanPath = path.split('?')[0].split('#')[0].trim();
    cleanPath = cleanPath.replace(/\\/g, '/').replace(/\/\//g, '/');
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

    let decodedPath = cleanPath;
    try { decodedPath = decodeURIComponent(cleanPath); } catch(e) {}

    let encodedPath = cleanPath;
    try { encodedPath = encodeURI(decodedPath); } catch(e) {}

    const pathsToTry = [cleanPath, decodedPath, encodedPath];

    for (let p of pathsToTry) {
        if (zip.file(p)) return zip.file(p);
    }

    const allFiles = Object.keys(zip.files);

    for (let f of allFiles) {
        for (let p of pathsToTry) {
            if (f.endsWith('/' + p)) return zip.file(f);
        }
    }

    let fileNamesToTry = pathsToTry.map(p => p.split('/').pop()).filter(Boolean);

    if (fileNamesToTry.length > 0) {
        for (let f of allFiles) {
            let currentZipFileName = f.split('/').pop();
            let decodedZipName = currentZipFileName;
            try { decodedZipName = decodeURIComponent(currentZipFileName); } catch(e) {}

            for (let name of fileNamesToTry) {
                let decodedName = name;
                try { decodedName = decodeURIComponent(name); } catch(e) {}

                if (currentZipFileName === name || decodedZipName === decodedName) {
                    return zip.file(f);
                }
            }
        }
    }
    return null;
}

async function analyzePages(htmlFiles, zipContents, tbody, zipId) {
  const parser = new DOMParser();
  htmlFiles.sort();

  for (const filePath of htmlFiles) {
    let fileData = await zipContents.file(filePath).async("string");
    fileData = cleanText(fileData); 
    
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

async function replaceCssUrls(cssText, cssPath, zip) {
  const urlRegex = /url\(\s*(['"]?)(?!data:|http:|https:|#)([^'")]+)\1\s*\)/gi;
  const matches = [...cssText.matchAll(urlRegex)];

  for (const match of matches) {
    const originalUrl = match[2];
    const resolvedAssetPath = resolvePath(cssPath, originalUrl);
    
    const fileEntry = getFileFromZip(zip, resolvedAssetPath);

    if (fileEntry) {
      const base64 = await fileEntry.async("base64");
      const cleanPathForExt = resolvedAssetPath.split('?')[0].split('#')[0];
      const ext = cleanPathForExt.split('.').pop().toLowerCase();
      let mime = 'application/octet-stream'; 
      
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) {
          mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      } else if (['woff2', 'woff', 'ttf', 'otf', 'eot'].includes(ext)) {
          mime = `font/${ext}`;
      }

      const dataUrl = `data:${mime};base64,${base64}`;
      cssText = cssText.replace(match[0], `url("${dataUrl}")`);
    } else {
      console.warn(`[CSS Asset] Не найден: ${resolvedAssetPath}`);
    }
  }
  return cssText;
}

window.openProjectPreview = function(zipId, startFilePath = null) {
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
  document.getElementById('widthSlider').value = 2500;
  changeIframeWidth(2500);
  
  loadPreviewPage(zipId, targetPage);
};

window.switchPreviewPage = function(filePath) {
  if (window.currentPreviewZip) {
      loadPreviewPage(window.currentPreviewZip, filePath);
  }
};

async function loadPreviewPage(zipId, filePath) {
  const zip = window.zipStorage[zipId];
  if (!zip) return alert('Архив не найден в памяти.');

  const iframe = document.getElementById('liveIframe');
  iframe.srcdoc = "<html><body style='font-family:sans-serif; text-align:center; padding-top:20%; background:#222; color:#fff;'>Сборка страницы (Стили, Скрипты, Картинки)...</body></html>";

  try {
    let fileData = await zip.file(filePath).async("string");
    fileData = cleanText(fileData); 
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileData, "text/html");

    const metaLinks = doc.querySelectorAll('link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"]');
    metaLinks.forEach(link => link.remove());

    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (let link of links) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('//')) {
        const resolved = resolvePath(filePath, href.split('?')[0]);
        const fileEntry = getFileFromZip(zip, resolved);
        
        if (fileEntry) {
          let cssText = await fileEntry.async("string");
          cssText = cleanText(cssText); 
          cssText = await replaceCssUrls(cssText, resolved, zip);
          const style = doc.createElement('style');
          style.textContent = cssText;
          link.replaceWith(style);
        } else {
          link.remove();
        }
      }
    }

    const inlineStyles = doc.querySelectorAll('style');
    for (let style of inlineStyles) {
      if (style.textContent && style.textContent.includes('url(')) {
        style.textContent = await replaceCssUrls(style.textContent, filePath, zip);
      }
    }

    const styledElements = doc.querySelectorAll('[style*="url("]');
    for (let el of styledElements) {
      let inlineCssText = el.getAttribute('style');
      inlineCssText = await replaceCssUrls(inlineCssText, filePath, zip);
      el.setAttribute('style', inlineCssText);
    }

    const mediaElements = doc.querySelectorAll('img, source');
    for (let el of mediaElements) {
      ['srcset', 'data-srcset', 'sizes'].forEach(attr => el.removeAttribute(attr));

      let url = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src');
      
      if (url && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('//')) {
        const resolved = resolvePath(filePath, url.split('?')[0].trim());
        const fileEntry = getFileFromZip(zip, resolved);
        
        if (fileEntry) {
          const base64 = await fileEntry.async("base64");
          const ext = resolved.split('.').pop().toLowerCase();
          let mime = 'image/jpeg';
          if (ext === 'png') mime = 'image/png';
          else if (ext === 'svg') mime = 'image/svg+xml';
          else if (ext === 'gif') mime = 'image/gif';
          else if (ext === 'webp') mime = 'image/webp';
          else if (ext === 'avif') mime = 'image/avif';

          el.setAttribute('src', `data:${mime};base64,${base64}`);
          
          el.removeAttribute('data-src');
          el.removeAttribute('data-lazy-src');
        } else {
          const svgPlaceholder = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" style="background:%23ffeaea"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12px" fill="%23dc3545">Нет фото</text></svg>`;
          el.setAttribute('src', svgPlaceholder);
          el.style.border = '1px dashed #dc3545';
          console.warn(`[Media] Не найден: ${resolved}`);
        }
      }
    }

    const scripts = Array.from(doc.querySelectorAll('script'));
    for (let script of scripts) {
      const src = script.getAttribute('src');
      
      if (src && !src.startsWith('http') && !src.startsWith('//')) {
        const resolved = resolvePath(filePath, src.split('?')[0]);
        const fileEntry = getFileFromZip(zip, resolved);
        
        if (fileEntry) {
          let jsText = await fileEntry.async("string");
          jsText = cleanText(jsText); 
          const base64Js = btoa(unescape(encodeURIComponent(jsText)));
          script.setAttribute('src', `data:text/javascript;base64,${base64Js}`);
        } else {
          script.removeAttribute('src');
          script.textContent = `console.warn('Скрипт не найден в архиве: ${resolved}');`;
        }
      } else if (!src && script.textContent) {
        script.textContent = cleanText(script.textContent);
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
      document.addEventListener('submit', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
    `;
    
    if (doc.head) doc.head.appendChild(interceptScript);
    else doc.documentElement.appendChild(interceptScript);

    iframe.srcdoc = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

  } catch (e) {
    iframe.srcdoc = `<html><body><h2 style="color:red">Ошибка рендера</h2><p>${e.message}</p></body></html>`;
  }
}

window.handleIframeLinkClick = function(zipId, currentFilePath, href) {
    const pages = window.projectPages[zipId] || [];
    let cleanHref = href.split('?')[0].split('#')[0];

    function openPage(pagePath) {
        if (document.getElementById('pageSelector')) {
            document.getElementById('pageSelector').value = pagePath;
        }
        window.switchPreviewPage(pagePath);
    }

    if (pages.length === 0) {
        alert('Страницы не найдены в архиве.');
        return;
    }

    // 1. Определение контекста локализации (поиск языковой папки)
    let currentLangRoot = '';
    const pathParts = currentFilePath.split('/');
    if (pathParts.length > 1) {
        const topFolder = pathParts[0];
        // Эвристика определения языка: 2-3 символа (en, rus) или наличие дефиса (ru-RU)
        if (topFolder.length <= 3 || topFolder.includes('-') || ['lang', 'i18n'].includes(topFolder)) {
            const possibleLangIndex = topFolder + '/index.html';
            if (pages.includes(possibleLangIndex)) {
                currentLangRoot = topFolder + '/';
            }
        }
    }

    // 2. Обработка клика по логотипу или главной странице (абсолютный корень)
    if (!cleanHref || cleanHref === '/') {
        if (currentLangRoot) return openPage(currentLangRoot + 'index.html');
        const rootIndex = pages.find(p => p.toLowerCase() === 'index.html') || pages[0];
        return openPage(rootIndex);
    }

    // 3. Вычисление точного маршрута
    let resolved = '';
    if (cleanHref.startsWith('/')) {
        // Абсолютный путь от корня архива (без учета локализации)
        resolved = cleanHref.substring(1);
    } else {
        // Относительный путь от текущей директории
        const baseDir = currentFilePath.includes('/') ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';
        const stack = baseDir ? baseDir.split('/') : [];
        for (const part of cleanHref.split('/')) {
            if (part === '.' || part === "") continue;
            if (part === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(part);
            }
        }
        resolved = stack.join('/');
    }

    // 4. Последовательная валидация вариаций пути
    const searchPaths = [
        resolved,
        resolved.endsWith('/') ? resolved + 'index.html' : resolved + '/index.html',
        resolved + '.html',
        resolved === '' ? 'index.html' : ''
    ].filter(Boolean);

    for (let variant of searchPaths) {
        if (pages.includes(variant)) return openPage(variant);
    }

    // 5. Поиск по имени файла (глубокий Fallback)
    const parts = cleanHref.split('/').filter(p => p && p !== '.' && p !== '..');
    let targetName = parts.length > 0 ? parts[parts.length - 1].replace('.html', '') : null;

    if (targetName) {
        const fallback = pages.find(p =>
            p === targetName + '.html' ||
            p === targetName + '/index.html' ||
            p.endsWith('/' + targetName + '.html') ||
            p.endsWith('/' + targetName + '/index.html')
        );
        if (fallback) return openPage(fallback);
    }

    alert('Страница не найдена в архиве: ' + href);
};

window.changeIframeWidth = function(value) {
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

window.toggleFullscreenPreview = function() {
    const previewModal = document.getElementById('previewModal');
    const btn = document.getElementById('fullscreenBtn');
    
    if (!document.fullscreenElement) {
        if (previewModal.requestFullscreen) previewModal.requestFullscreen();
        else if (previewModal.webkitRequestFullscreen) previewModal.webkitRequestFullscreen();
        else if (previewModal.msRequestFullscreen) previewModal.msRequestFullscreen();
        btn.innerHTML = '🗗 Свернуть';
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
        btn.innerHTML = '⛶ На весь экран';
    }
}