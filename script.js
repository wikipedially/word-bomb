let dictionaryData = {};
let chunkCountData = {};
let posIndex = {};
let definedWordsCache = [];
let currentMatchedWords = [];
let currentSnPrompts = [];
let displayedCount = 0;
const BATCH_SIZE = 200;

let sortType = 'alpha';
let sortDirection = 'asc';
let activePosToken = null;
let activeSnToken = null;
let searchDebounceTimer = null;

const ENGLISH_POS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'article'];

// dom elements
const searchInput = document.getElementById('search-input');
const searchTokensContainer = document.getElementById('search-tokens-container');
const resultsContainer = document.getElementById('results-container');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');
const sortTypeBtn = document.getElementById('sort-type-btn');
const sortTypeIcon = document.getElementById('sort-type-icon');
const sortDirBtn = document.getElementById('sort-dir-btn');
const sortDirIcon = document.getElementById('sort-dir-icon');

// load dictionary data from JSON file
async function loadData() {
  try {
    const dictResponse = await fetch('dict.json');
    dictionaryData = await dictResponse.json();
    buildIndexes();
    evaluateSearch();
  } catch (error) {
    console.error('Failed to load dictionary:', error);
    resultsContainer.innerHTML = `<p class="placeholder-text" style="color: #ff6b6b;">Error loading dict.json.</p>`;
  }

  try {
    const chunkResponse = await fetch('chunkCountList.json');
    chunkCountData = await chunkResponse.json();
  } catch (error) {
    console.warn('Failed to load chunkCountList.json:', error);
  }
}

function buildIndexes() {
  definedWordsCache = [];
  posIndex = {};

  for (const word in dictionaryData) {
    const entries = dictionaryData[word];
    if (!entries || !Array.isArray(entries)) continue;

    let hasDef = false;
    let posSeen = new Set();

    entries.forEach((entry) => {
      if (entry.def) {
        if (Array.isArray(entry.def) && entry.def.length > 0) hasDef = true;
        if (typeof entry.def === 'string' && entry.def.trim() !== '') hasDef = true;
      }

      if (entry.pos) {
        const posLower = entry.pos.toLowerCase().trim();
        if (!posSeen.has(posLower)) {
          posSeen.add(posLower);
          if (!posIndex[posLower]) posIndex[posLower] = [];
          posIndex[posLower].push(word);
        }
      }
    });

    if (hasDef) definedWordsCache.push(word);
  }
}

loadData();
renderPlaceholder();

// event listeners
searchInput.addEventListener('input', (e) => {
  const query = e.target.value;
  const queryLower = query.toLowerCase();

  if (queryLower.startsWith('@def:') && !activePosToken) {
    const subQuery = query.slice(5).trim().toLowerCase();
    const exactMatch = ENGLISH_POS.find((pos) => pos === subQuery);
    if (exactMatch) {
      setDefToken(exactMatch);
      return;
    }
  }

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(evaluateSearch, 300);
});

searchInput.addEventListener('keydown', (e) => {
  const query = searchInput.value.trim().toLowerCase();

  if (e.key === ' ') {
    if (query === '@def' && !activePosToken) {
      e.preventDefault();
      setDefToken(true);
      return;
    }
    if (query === '@sn' && !activeSnToken) {
      e.preventDefault();
      setSnToken(true);
      return;
    }
    if (query.startsWith('@def:') && !activePosToken) {
      const typedPos = query.slice(5).trim().toLowerCase();
      const match = ENGLISH_POS.find((pos) => pos.startsWith(typedPos));
      if (match) {
        e.preventDefault();
        setDefToken();
        return;
      }
    } else if (query.startsWith('@sn:') && !activeSnToken) {
      const typedNum = query.slice(4).trim();
      if (typedNum !== '') {
        e.preventDefault();
        setSnToken(typedNum);
        return;
      }
    }
  }

  if (e.key === 'Enter') {
    if (query.startsWith('@def:') && !activePosToken) {
      const typedPos = query.slice(5).trim().toLowerCase();
      const match = ENGLISH_POS.find((pos) => pos.startsWith(typedPos));
      if (match) {
        e.preventDefault();
        setDefToken(match);
        return;
      }
    } else if (query.startsWith('@sn:') && !activeSnToken) {
      const typedNum = query.slice(4).trim();
      if (typedNum !== '') {
        e.preventDefault();
        setSnToken(typedNum);
        return;
      }
    }
  }

  if (e.key === 'Backspace' && searchInput.value === '') {
    e.preventDefault();
    if (activePosToken && activeSnToken) removePosToken();
    else removeTokens();
  }
});

sortTypeBtn.addEventListener('click', () => {
  sortType = sortType === 'alpha' ? 'length' : 'alpha';
  sortTypeIcon.className = sortType === 'alpha' ? 'fa-solid fa-arrow-down-a-z' : 'fa-solid fa-arrow-down-1-9';
  sortTypeBtn.title = sortType;
  if (currentMatchedWords.length > 0) applySortingAndRender();
});

sortDirBtn.addEventListener('click', () => {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  sortDirIcon.className = sortDirection === 'asc' ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down';
  sortDirBtn.title = sortDirection;
  if (currentMatchedWords.length > 0) applySortingAndRender();
});

const helpBtn = document.getElementById('help-btn');
if (helpBtn) {
  helpBtn.addEventListener('click', openRegexHelpModal);
}

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});

// token stuff
function setDefToken(pos = true) {
  activePosToken = pos;
  searchInput.value = '';
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function setSnToken(num = true) {
  activeSnToken = num;
  searchInput.value = '';
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removePosToken() {
  activePosToken = null;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removeSnToken() {
  activeSnToken = null;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removeTokens() {
  activePosToken = null;
  activeSnToken = null;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function renderTokensUI() {
  let html = '';

  if (activeSnToken) {
    const snLabel = activeSnToken === true ? '@sn' : `@sn:${activeSnToken}`;
    html += `<div class="search-token-pill"><span>${snLabel}</span><button class="search-token-remove" id="remove-sn-btn">&times;</button></div>`;
  }

  if (activePosToken) {
    const defLabel = activePosToken === true ? '@def' : `@def:${activePosToken}`;
    html += `<div class="search-token-pill"><span>${defLabel}</span><button class="search-token-remove" id="remove-def-btn">&times;</button></div>`;
  }

  searchTokensContainer.innerHTML = html;

  const removeSnBtn = document.getElementById('remove-sn-btn');
  if (removeSnBtn) removeSnBtn.addEventListener('click', removeSnToken);

  const removeDefBtn = document.getElementById('remove-def-btn');
  if (removeDefBtn) removeDefBtn.addEventListener('click', removePosToken);

  searchInput.placeholder = (activePosToken || activeSnToken) ? '' : 'Type prompt...';
}

// search function
function evaluateSearch() {
  searchWords(searchInput.value.trim());
}

function searchWords(query) {
  let snPool = null;
  let defPool = null;
  const queryLower = query.toLowerCase();
  currentSnPrompts = [];

  let explicitSn = null;
  if (queryLower.startsWith('@sn:')) {
    const spaceIdx = query.indexOf(' ');
    explicitSn = spaceIdx !== -1 ? query.slice(4, spaceIdx).trim() : query.slice(4).trim();
  }

  // resolve @sn pool
  if (activeSnToken || explicitSn) {
    if (!chunkCountData.counts) {
      resultsContainer.innerHTML = `<p class="placeholder-text" style="color: #ff6b6b;">chunkCountList.json not loaded yet.</p>`;
      return;
    }

    let countKeys = [];
    if (explicitSn && /^\d+$/.test(explicitSn)) countKeys = [parseInt(explicitSn, 10)];
    else if (activeSnToken && activeSnToken !== true) countKeys = [parseInt(activeSnToken, 10)];
    else countKeys = [1, 2];

    const storageKey = 'sn_cache_' + countKeys.sort().join('_');
    let matchedSnWords = [];
    let validPrompts = [];

    countKeys.forEach(k => {
      if (chunkCountData.counts[k]) {
        validPrompts.push(...chunkCountData.counts[k].filter(p => !p.includes("'") && !p.includes("-")));
      }
    });

    currentSnPrompts = validPrompts;

    if (localStorage.getItem(storageKey)) {
      matchedSnWords = JSON.parse(localStorage.getItem(storageKey));
    } else {
      let collectedWords = new Set();
      const allDictionaryWords = Object.keys(dictionaryData);

      validPrompts.forEach(prompt => {
        const upperPrompt = prompt.toUpperCase();
        try {
          const regex = new RegExp(upperPrompt, 'i');
          allDictionaryWords.forEach(word => { if (regex.test(word)) collectedWords.add(word); });
        } catch (err) {
          allDictionaryWords.forEach(word => { if (word.toUpperCase().includes(upperPrompt)) collectedWords.add(word); });
        }
      });
      matchedSnWords = Array.from(collectedWords);
      try { localStorage.setItem(storageKey, JSON.stringify(matchedSnWords)); } catch (e) { }
    }
    snPool = new Set(matchedSnWords);
  }

  // resolve @def pool
  let explicitDefPos = null;
  if (queryLower.startsWith('@def:')) {
    const spaceIdx = query.indexOf(' ');
    explicitDefPos = spaceIdx !== -1 ? query.slice(5, spaceIdx).trim().toLowerCase() : query.slice(5).trim().toLowerCase();
  }

  if (activePosToken || explicitDefPos || queryLower.startsWith('@def')) {
    let posQuery = '';
    if (explicitDefPos) posQuery = explicitDefPos;
    else if (activePosToken && activePosToken !== true) posQuery = activePosToken;

    let basePool = [];
    if (posQuery !== '') {
      for (const posKey in posIndex) {
        if (posKey.startsWith(posQuery)) basePool.push(...posIndex[posKey]);
      }
      basePool = [...new Set(basePool)];
    } else {
      basePool = definedWordsCache;
    }
    defPool = new Set(basePool);
  }

  // combine pools
  let baseWords = [];
  if (snPool !== null && defPool !== null) baseWords = [...snPool].filter(word => defPool.has(word));
  else if (snPool !== null) baseWords = [...snPool];
  else if (defPool !== null) baseWords = [...defPool];
  else baseWords = Object.keys(dictionaryData);

  // get active query
  let activeTextQuery = query;
  if (explicitSn) {
    const spaceIdx = query.indexOf(' ');
    activeTextQuery = spaceIdx !== -1 ? query.slice(spaceIdx + 1).trim() : '';
  }
  if (explicitDefPos || queryLower.startsWith('@def')) {
    const spaceIdx = activeTextQuery.indexOf(' ');
    if (spaceIdx !== -1 && (activeTextQuery.startsWith('@def') || activeTextQuery.startsWith('@def:'))) {
      activeTextQuery = activeTextQuery.slice(spaceIdx + 1).trim();
    } else if (activeTextQuery.startsWith('@def')) {
      activeTextQuery = '';
    }
  }

  let matchedWords = [];
  if (activeTextQuery !== '') {
    try {
      const regex = new RegExp(activeTextQuery, 'i');
      matchedWords = baseWords.filter(word => regex.test(word));
    } catch (err) {
      matchedWords = baseWords.filter(word => word.toLowerCase().includes(activeTextQuery.toLowerCase()));
    }
  } else {
    matchedWords = baseWords;
  }

  // randomize search if completely empty + no tokens
  if (query.trim() === '' && !activePosToken && !activeSnToken) {
    for (let i = matchedWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [matchedWords[i], matchedWords[j]] = [matchedWords[j], matchedWords[i]];
    }
    currentMatchedWords = matchedWords;
    displayedCount = 0;
    renderResults();
  } else {
    currentMatchedWords = matchedWords;
    applySortingAndRender();
  }
}

// rendering
function applySortingAndRender() {
  currentMatchedWords.sort((a, b) => {
    let comparison = 0;
    if (sortType === 'alpha') {
      comparison = a.localeCompare(b);
    } else {
      comparison = a.length - b.length;
      if (comparison === 0) comparison = a.localeCompare(b);
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  displayedCount = 0
  renderResults();
}

function renderResults() {
  if (currentMatchedWords.length === 0) {
    resultsContainer.innerHTML = `<p class="placeholder-text">No matching words found.</p>`;
    return;
  }

  if (displayedCount === 0) {
    let html = `<p style="font-size: 0.85rem; color: var(--text-subtle); margin-bottom: 0.5rem;">Found ${currentMatchedWords.length} matches:</p>`;
    html += `<div class="word-grid" id="word-grid-container"></div>`;
    resultsContainer.innerHTML = html;

    const gridContainer = document.getElementById('word-grid-container');
    if (gridContainer) gridContainer.addEventListener('scroll', handleGridScroll);
  }

  const gridContainer = document.getElementById('word-grid-container');
  if (!gridContainer) return;

  const nextBatchEnd = Math.min(displayedCount + BATCH_SIZE, currentMatchedWords.length);
  const batchToRender = currentMatchedWords.slice(displayedCount, nextBatchEnd);

  let batchHtml = '';
  batchToRender.forEach((word) => {
    const hasDefinition = wordHasRealDefinition(word);
    const cssClass = hasDefinition ? 'word-pill has-definition' : 'word-pill no-definition';
    const displayText = currentSnPrompts.length > 0 ? highlightSnMatch(word, currentSnPrompts) : word;

    batchHtml += `<button class="${cssClass}" data-word="${word}">${displayText}</button>`;
  });

  gridContainer.insertAdjacentHTML('beforeend', batchHtml);
  displayedCount = nextBatchEnd;

  gridContainer.querySelectorAll('.word-pill').forEach((btn) => {
    if (!btn.dataset.bound) {
      btn.dataset.bound = 'true';
      const word = btn.getAttribute('data-word');
      if (wordHasRealDefinition(word)) {
        btn.addEventListener('click', () => openModal(word));
      } else {
        btn.style.cursor = 'default';
      }
    }
  });
}

function handleGridScroll(e) {
  const target = e.target;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 30) {
    if (displayedCount < currentMatchedWords.length) renderResults();
  }
}

function renderPlaceholder () {
  resultsContainer.innerHTML = `
    <div class="placeholder-wrapper">
      <p class="placeholder-text">Enter a search query for results.</p>
      <p class="placeholder-hint">allows <span id="regex-help-link" class="interactive-link">RegEx</span> queries.</p>
    </div>
  `;

  const regexHelpLink = document.getElementById('regex-help-link');
  if (regexHelpLink) regexHelpLink.addEventListener('click', openRegexHelpModal);
}

function openRegexHelpModal() {
  let content = `<h2>RegEx Search Guide</h2>`;
  content += `<p><b>reg</b>ular <b>ex</b>pression can be used for advanced pattern matching. examples:</p>`;
  content += `<ul class="def-list" style="margin-left: 1rem;">`;
  content += `<li><strong>^a</strong> - starts with "a"</li>`;
  content += `<li><strong>a$</strong> - ends with "a"</li>`;
  content += `<li><strong>a.a</strong> - wildcard matching [<b>.</b>]</li>`;
  content += `<li><strong>[aeiou]{3}</strong> - 3 vowels in a row</li>`;
  content += `</ul>`;
  content += `<p style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-subtle);">Tip: Use <strong>@def</strong> for definitions, of <strong>@sn:[number]</strong> to search via number of solutions for letter chunk. (Make sure to press SPACE after using an @ command.)</p>`;

  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}

function openModal(word) {
  const entries = dictionaryData[word];
  let content = `<h2>${word}</h2>`;

  entries.forEach((entry, index) => {
    content += `<div class="definition-entry">`;
    content += `<span class="pos-tag">${entry.pos}</span>`;
    if (entry.pron) content += `<span class="ipa-tag">${entry.pron}</span>`;

    if (Array.isArray(entry.def)) {
      content += `<ul class="def-list">`;
      entry.def.forEach(d => { content += `<li>${d}</li>`; });
      content += `</ul>`;
    } else {
      content += `<p>${entry.def}</p>`;
    }
    content += `</div>`;

    if (index < entries.length - 1) {
      content += `<hr style="border: 1px dotted #333; margin: 1rem 0;">`;
    }
  });

  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}

function wordHasRealDefinition(word) {
  const entries = dictionaryData[word];
  if (!entries || !Array.isArray(entries)) return false;

  return entries.some((entry) => {
    if (!entry.def) return false;
    if (Array.isArray(entry.def)) return entry.def.length > 0;
    return typeof entry.def === 'string' && entry.def.trim() !== '';
  });
}

function highlightSnMatch(word, prompts) {
  if (!prompts || prompts.length === 0) return word;

  const upperWord = word.toUpperCase();
  for (const prompt of prompts) {
    const upperPrompt = prompt.toUpperCase();
    const index = upperWord.indexOf(upperPrompt);
    if (index !== -1) {
      const originalChunk = word.slice(index, index + prompt.length);
      return (
        word.slice(0, index) +
        `<span class="word-highlight">${originalChunk}</span>` +
        word.slice(index + prompt.length)
      );
    }
  }
  return word;
}