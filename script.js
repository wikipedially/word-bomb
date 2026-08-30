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
let activeFavToken = false;
let searchDebounceTimer = null;
let lastSearchQueryWasEmpty = false;
let isUserSortedWhileEmpty = false;

let savedWords = JSON.parse(localStorage.getItem('word_bomb_saved_words')) || [];

const ENGLISH_POS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'article', 'slang', 'gerund', 'onomatopoeia'];

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
    if ((query === '@fav' || query === '@saved') && !activeFavToken) {
      e.preventDefault();
      setFavToken();
      return;
    }
    if (query.startsWith('@def:') && !activePosToken) {
      const typedPos = query.slice(5).trim().toLowerCase();
      const matches = ENGLISH_POS.filter((pos) => pos.startsWith(typedPos));
      if (matches.length === 1) {
        e.preventDefault();
        setDefToken(matches[0]);
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
    if (query === '@fav' || query === '@saved') {
      if (!activeFavToken) {
        e.preventDefault();
        setFavToken();
        return;
      }
    }
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
    if (activeFavToken) removeFavToken();
    else if (activePosToken && activeSnToken) removePosToken();
    else removeTokens();
  }
});

sortTypeBtn.addEventListener('click', () => {
  sortType = sortType === 'alpha' ? 'length' : 'alpha';
  sortTypeIcon.className = sortType === 'alpha' ? 'fa-solid fa-arrow-down-a-z' : 'fa-solid fa-arrow-down-1-9';
  sortTypeBtn.title = sortType;
  
  const isQueryEmpty = searchInput.value.trim() === '' && !activePosToken && !activeSnToken && !activeFavToken;
  if (isQueryEmpty) {
    isUserSortedWhileEmpty = true;
  }

  if (currentMatchedWords.length > 0) applySortingAndRender();
});

sortDirBtn.addEventListener('click', () => {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  sortDirIcon.className = sortDirection === 'asc' ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down';
  sortDirBtn.title = sortDirection;
  
  const isQueryEmpty = searchInput.value.trim() === '' && !activePosToken && !activeSnToken && !activeFavToken;
  if (isQueryEmpty) {
    isUserSortedWhileEmpty = true;
  }

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

  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
  }
});

modalBody.addEventListener('click', (e) => {
  const defLink = e.target.closest('.def-link');
  if (!defLink) return;

  const targetWord = defLink.getAttribute('data-word');
  const upperWord = targetWord ? targetWord.toUpperCase() : '';

  if (upperWord && dictionaryData[upperWord]) {
    openModal(upperWord);
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
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function setSnToken(num = true) {
  activeSnToken = num;
  searchInput.value = '';
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function setFavToken() {
  activeFavToken = true;
  searchInput.value = '';
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removePosToken() {
  activePosToken = null;
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removeSnToken() {
  activeSnToken = null;
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removeFavToken() {
  activeFavToken = false;
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function removeTokens() {
  activePosToken = null;
  activeSnToken = null;
  activeFavToken = false;
  isUserSortedWhileEmpty = false;
  renderTokensUI();
  evaluateSearch();
  searchInput.focus();
}

function renderTokensUI() {
  let html = '';

  if (activeFavToken) {
    html += `<div class="search-token-pill"><span>@fav</span><button class="search-token-remove" id="remove-fav-btn">&times;</button></div>`;
  }

  if (activeSnToken) {
    const snLabel = activeSnToken === true ? '@sn' : `@sn:${activeSnToken}`;
    html += `<div class="search-token-pill"><span>${snLabel}</span><button class="search-token-remove" id="remove-sn-btn">&times;</button></div>`;
  }

  if (activePosToken) {
    const defLabel = activePosToken === true ? '@def' : `@def:${activePosToken}`;
    html += `<div class="search-token-pill"><span>${defLabel}</span><button class="search-token-remove" id="remove-def-btn">&times;</button></div>`;
  }

  searchTokensContainer.innerHTML = html;

  const removeFavBtn = document.getElementById('remove-fav-btn');
  if (removeFavBtn) removeFavBtn.addEventListener('click', removeFavToken);

  const removeSnBtn = document.getElementById('remove-sn-btn');
  if (removeSnBtn) removeSnBtn.addEventListener('click', removeSnToken);

  const removeDefBtn = document.getElementById('remove-def-btn');
  if (removeDefBtn) removeDefBtn.addEventListener('click', removePosToken);

  searchInput.placeholder = (activePosToken || activeSnToken) ? '' : 'type prompt...';
}

// search function
function evaluateSearch() {
  searchWords(searchInput.value.trim());
}

function searchWords(query) {
  let snPool = null;
  let defPool = null;
  let favPool = null;
  const queryLower = query.toLowerCase();
  currentSnPrompts = [];

  if ((queryLower.startsWith('@sn') && !activeSnToken) || (queryLower.startsWith('@def') && !activePosToken) || ((queryLower.startsWith('@fav') || queryLower.startsWith('@saved')) && !activeFavToken)) {
    return;
  }

  let explicitSn = null;
  if (queryLower.startsWith('@sn:')) {
    const spaceIdx = query.indexOf(' ');
    explicitSn = spaceIdx !== -1 ? query.slice(4, spaceIdx).trim() : query.slice(4).trim();
  }

  // resolve @fav pool
  if (activeFavToken || queryLower.startsWith('@fav') || queryLower.startsWith('@saved')) {
    favPool = new Set(savedWords);
  }

  // resolve @sn pool
  if (activeSnToken || explicitSn) {
    if (!chunkCountData.counts) {
      resultsContainer.innerHTML = `<p class="placeholder-text" style="color: #ff6b6b;">chunkCountList.json not loaded yet.</p>`;
      return;
    }

    let countKeys = [];
    if (explicitSn && /^\d+$/.text(explicitSn)) countKeys = [parseInt(explicitSn, 10)];
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
      try {
        matchedSnWords = JSON.parse(localStorage.getItem(storageKey));
      } catch (e) {
        matchedSnWords = [];
      }
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

      try {
        localStorage.setItem(storageKey, JSON.stringify(matchedSnWords));
      } catch (e) {
        try {
          Object.keys(localStorage).forEach(k => {
            if (k.startsWith('sn_cache_')) localStorage.removeItem(k);
          });
          localStorage.setItem(storageKey, JSON.stringify(matchedSnWords));
        } catch (err) {
          // fallback if storage remains full
        }
      }
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

  // combine pools intersection
  let baseWords = [];
  let poolsToIntersect = [];
  if (favPool !== null) poolsToIntersect.push(favPool);
  if (snPool !== null) poolsToIntersect.push(snPool);
  if (defPool !== null) poolsToIntersect.push(defPool);

  if (poolsToIntersect.length > 0) {
    poolsToIntersect.sort((a, b) => a.size - b.size);
    let smallest = poolsToIntersect[0];
    baseWords = [...smallest].filter(word => {
      return poolsToIntersect.every(pool => pool.has(word));
    });
  } else {
    baseWords = Object.keys(dictionaryData);
  }

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
  if (queryLower.startsWith('@fav') || queryLower.startsWith('@saved')) {
    const spaceIdx = activeTextQuery.indexOf(' ');
    if (spaceIdx !== -1) {
      activeTextQuery = activeTextQuery.slice(spaceIdx + 1).trim();
    } else {
      activeTextQuery = '';
    }
  }

  let matchedWords = [];
  if (activeTextQuery !== '') {
    try {
      const regex = new RegExp(activeTextQuery, 'i');
      matchedWords = baseWords.filter(word => regex.test(word));
    } catch (err) {
      const lowerQuery = activeTextQuery.toLowerCase();
      matchedWords = baseWords.filter(word => word.toLowerCase().includes(lowerQuery));
    }
  } else {
    matchedWords = baseWords;
  }

  const isCurrentlyEmpty = query.trim() === '' && !activePosToken && !activeSnToken && !activeFavToken;

  if (isCurrentlyEmpty) {
    if (!lastSearchQueryWasEmpty) {
      isUserSortedWhileEmpty = false;
      for (let i = matchedWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [matchedWords[i], matchedWords[j]] = [matchedWords[j], matchedWords[i]];
      }
      lastSearchQueryWasEmpty = true;
      currentMatchedWords = matchedWords;
      applySortingAndRender();
    } else {
      displayedCount = 0;
      renderResults();
    }
  } else {
    lastSearchQueryWasEmpty = false;
    isUserSortedWhileEmpty = false;
    currentMatchedWords = matchedWords;
    applySortingAndRender();
  }
}

// rendering
function applySortingAndRender() {
  const isQueryEmpty = searchInput.value.trim() === '' && !activePosToken && !activeSnToken && !activeFavToken;

  if (!isQueryEmpty) {
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
  }

  displayedCount = 0;
  renderResults();
}

function renderResults() {
  if (currentMatchedWords.length === 0) {
    resultsContainer.innerHTML = `<p class="placeholder-text">no matching words found.</p>`;
    return;
  }

  if (displayedCount === 0) {
    let html = `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-subtle); margin-bottom: 0.5rem;">`;
    html += `<span>found ${currentMatchedWords.length} matches:</span>`;
    html += `<span style="opacity: 0.65;">right-click or long-press to save</span>`;
    html += `</div>`;
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
    const isSaved = savedWords.includes(word);

    let baseClass = 'word-pill';
    if (hasDefinition) baseClass += ' has-definition';
    if (isSaved) baseClass += ' saved-word';

    const displayText = currentSnPrompts.length > 0 ? highlightSnMatch(word, currentSnPrompts) : word;

    batchHtml += `<button class ="${baseClass}" data-word="${word}">${displayText}</button>`;
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

      // right-click to toggle favorite
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        toggleSavedWord(word, btn);
      });
    }
  });
}

function toggleSavedWord(word, btnElement) {
  const index = savedWords.indexOf(word);
  if (index === -1) {
    savedWords.push(word);
    btnElement.classList.add('saved-word');
  } else {
    savedWords.splice(index, 1);
    btnElement.classList.remove('saved-word');
  }

  // flash animation
  btnElement.classList.remove('flash-saved');
  void btnElement.offsetWidth;
  btnElement.classList.add('flash-saved');

  try {
    localStorage.setItem('word_bomb_saved_words', JSON.stringify(savedWords));
  } catch (e) {
    console.warn('Failed to save favorites to localStorage', e);
  }

  if (activeFavToken) {
    evaluateSearch();
  }
}

function handleGridScroll(e) {
  const target = e.target;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 30) {
    if (displayedCount < currentMatchedWords.length) renderResults();
  }
}

function renderPlaceholder() {
  resultsContainer.innerHTML = `
    <div class="placeholder-wrapper">
      <p class="placeholder-text">enter a search query for results.</p>
      <p class="placeholder-hint">allows <span id="regex-help-link" class="interactive-link">RegEx</span> queries.</p>
    </div>
  `;

  const regexHelpLink = document.getElementById('regex-help-link');
  if (regexHelpLink) regexHelpLink.addEventListener('click', openRegexHelpModal);
}

function openRegexHelpModal() {
  let content = `<h2>Search Guide</h2>`;
  content += `<p><b>reg</b>ular <b>ex</b>pression can be used for advanced pattern matching. examples:</p>`;
  content += `<ul class="def-list" style="margin-left: 1rem;">`;
  content += `<li><strong>^a</strong> - starts with "a"</li>`;
  content += `<li><strong>a$</strong> - ends with "a"</li>`;
  content += `<li><strong>a.a</strong> - wildcard matching [<b>.</b>]</li>`;
  content += `<li><strong>[aeiou]{3}</strong> - 3 vowels in a row</li>`;
  content += `</ul>`;
  content += `<p style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-subtle);">Tip: Use <strong>@def</strong> for definitions, <strong>@sn:[number]</strong> for solution counts, or @fav to view saved words. (Press SPACE after using an @ command.)</p>`;

  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}

function openModal(word) {
  const entries = dictionaryData[word];
  let content = `<h2>${word}</h2>`;

  const validEntries = entries.filter((entry) => {
    if (!entry.def) return false;
    if (Array.isArray(entry.def)) return entry.def.length > 0;
    return typeof entry.def === 'string' && entry.def.trim() !== '';
  });

  validEntries.forEach((entry, index) => {
    content += `<div class="definition-entry">`;
    if (entry.pos) {
      content += `<span class="pos-tag">${entry.pos}</span>`;
    }
    if (entry.pron) {
      content += `<span class="ipa-tag">${entry.pron}</span>`;
    }

    if (Array.isArray(entry.def)) {
      content += `<ul class="def-list">`;
      entry.def.forEach(d => { content += `<li>${formatDefinitionText(d)}</li>`; });
      content += `</ul>`;
    } else {
      content += `<p>${formatDefinitionText(entry.def)}</p>`;
    }
    content += `</div>`;

    if (index < validEntries.length - 1) {
      content += `<hr style="border: 1px dotted #333; margin: 1rem 0;">`;
    }
  });

  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}

function formatDefinitionText(text) {
  if (typeof text !== 'string') return text;
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[\[(.*?)\]\]/g, (match, word) => {
    word = word.trim();
    const upperWord = word.toUpperCase();

    if (dictionaryData[upperWord] && wordHasRealDefinition(upperWord)) {
      return `<span class="def-link" data-word="${word}">${word}</span>`;
    }
    return word;
  });
  return text;
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