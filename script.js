let dictionaryData = {};
let posIndex = {}; // pre-indexed part-of-speech arrays
let definedWordsCache = []; // pre-cached defined words
let currentMatchedWords = [];
let displayedCount = 0;
const BATCH_SIZE = 200;

let sortType = 'alpha'; // 'alpha' or 'length'
let sortDirection = 'asc'; // 'asc' or 'desc'

let activePosToken = null;
let searchDebounceTimer = null;

const ENGLISH_POS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'article'];

// fetch dict.json when page is loaded
async function loadDictionary() {
  try {
    const response = await fetch('dict.json');
    dictionaryData = await response.json();
    console.log(
      `Loaded ${Object.keys(dictionaryData).length} words into memory. Indexing parts of speech...`
    );

    const startTime = performance.now();
    buildIndexes();
    const endTime = performance.now();
    console.log(`Indexed parts of speech in ${(endTime - startTime).toFixed(2)}ms`)
  } catch (error) {
    console.error('Failed to load dictionary:', error);
    document.getElementById('results-container').innerHTML = `<p class="placeholder-text" style="color: #ff6b6b;">Error loading dict.json. Check console.</p>`;
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
      // check if definition exists
      if (entry.def) {
        if (Array.isArray(entry.def) && entry.def.length > 0) hasDef = true;
        if (typeof entry.def === 'string' && entry.def.trim() !== '') hasDef = true
      }

      if (entry.pos) {
        const posLower = entry.pos.toLowerCase().trim();
        if (!posSeen.has(posLower)) {
          posSeen.add(posLower);
          if (!posIndex[posLower]) {
            posIndex[posLower] = [];
          }
          posIndex[posLower].push(word);
        }
      }
    });

    if (hasDef) {
      definedWordsCache.push(word);
    }
  }
}

loadDictionary();

const searchInput = document.getElementById('search-input');
const searchTokensContainer = document.getElementById('search-tokens-container');
const autocompletePopup = document.getElementById('autocomplete-popup')
const resultsContainer = document.getElementById('results-container');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');
const sortTypeBtn = document.getElementById('sort-type-btn');
const sortTypeIcon = document.getElementById('sort-type-icon');
const sortDirBtn = document.getElementById('sort-dir-btn');
const sortDirIcon = document.getElementById('sort-dir-icon');

// render initial placeholder section on load
renderPlaceholder();

// user input text box
searchInput.addEventListener('input', (e) => {
  const query = e.target.value;

  if (query.toLowerCase().startsWith('@def:') && !activePosToken) {
    const subQuery = query.slice(5).trim().toLowerCase();
    const exactMatch = ENGLISH_POS.find((pos) => pos === subQuery);
    if (exactMatch) {
      setPosToken(exactMatch);
      return;
    }
    showAutocompletePopup(subQuery);
  } else {
    hideAutocompletePopup();
  }

  // debounce to prevent lag when typing fast
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    evaluateSearch();
  }, 150);
});

// part-of-speech token within search box
searchInput.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !activePosToken) {
    const query = searchInput.value.trim().toLowerCase();
    if (query.startsWith('@def:')) {
      const typedPos = query.slice(5).trim();
      const exactMatch = ENGLISH_POS.find((pos) => pos === typedPos);
      if (exactMatch) {
        e.preventDefault();
        setPosToken(exactMatch);
        return;
      }
    }
  }

  if (e.key === 'Backspace' && searchInput.value === '' && activePosToken) {
    e.preventDefault();
    removePosToken();
  }
});

function showAutocompletePopup(subQuery) {
  const matches = ENGLISH_POS.filter((pos) => pos.includes(subQuery));
  if (matches.length === 0) {
    hideAutocompletePopup();
    return;
  }

  let html = '';
  matches.forEach((pos) => {
    html += `<button class="autocomplete-pill" data-pos="${pos}">${pos}</button>`;
  });
  autocompletePopup.innerHTML = html;
  autocompletePopup.classList.remove('hidden');
  autocompletePopup.querySelectorAll('.autocomplete-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosenPos = btn.getAttribute('data-pos');
      setPosToken(chosenPos);
    });
  });
}

function hideAutocompletePopup() {
  autocompletePopup.classList.add('hidden');
  autocompletePopup.innerHTML = '';
}

function setPosToken(pos) {
  activePosToken = pos;
  searchInput.value = '';
  hideAutocompletePopup();
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

function renderTokensUI() {
  if (activePosToken) {
    searchTokensContainer.innerHTML = `
      <div class="search-token-pill">
        <span>@def:${activePosToken}</span>
        <button class="search-token-remove" id="remove-token-btn">&times;</button>
      </div>
    `;
    document.getElementById('remove-token-btn').addEventListener('click', () => {
      removePosToken();
    });
    searchInput.placeholder = '';
  } else {
    searchTokensContainer.innerHTML = '';
    searchInput.placeholder = 'Type prompt...';
  }
}

function evaluateSearch() {
  const rawInput = searchInput.value.trim();
  let builtQuery = '';
  if (activePosToken) {
    builtQuery = `@def:${activePosToken} ${rawInput}`;
  } else {
    builtQuery = rawInput;
  }

  if (builtQuery === '') {
    renderPlaceholder();
    currentMatchedWords = [];
    displayedCount = 0;
    return;
  }
  searchWords(builtQuery);
}

// sort type button listener
sortTypeBtn.addEventListener('click', () => {
  sortType = sortType === 'alpha' ? 'length' : 'alpha';

  // update icon
  if (sortType === 'alpha') {
    sortTypeIcon.className = 'fa-solid fa-arrow-down-a-z';
    sortTypeBtn.title = 'alphabetical';
  } else {
    sortTypeIcon.className = 'fa-solid fa-arrow-down-1-9';
    sortTypeBtn.title = 'length';
  }

  if (currentMatchedWords.length > 0) {
    applySortingAndRender();
  }
});

// sort direction button listener
sortDirBtn.addEventListener('click', () => {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';

  // update icon
  if (sortDirection === 'asc') {
    sortDirIcon.className = 'fa-solid fa-arrow-up';
    sortDirBtn.title = 'ascending';
  } else {
    sortDirIcon.className = 'fa-solid fa-arrow-down';
    sortDirBtn.title = 'descending';
  }

  if (currentMatchedWords.length > 0) {
    applySortingAndRender();
  }
});

// press '/' to focus search input
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// render default placeholder section with clickable RegEx link
function renderPlaceholder() {
  resultsContainer.innerHTML = `
    <div class="placeholder-wrapper">
      <p class="placeholder-text">Enter a search query for results.</p>
      <p class="placeholder-hint">allows <span id="regex-help-link" class="interactive-link">RegEx</span> queries.</p>
    </div>
  `;

  const regexHelpLink = document.getElementById('regex-help-link');
  if (regexHelpLink) {
    regexHelpLink.addEventListener('click', () => {
      openRegexHelpModal();
    });
  }
}

function openRegexHelpModal() {
  let content = `<h2>RegEx Search Guide</h2>`;
  content += `<p><b>reg</b>ular <b>ex</b>pression can be used for advanced pattern matching in search queries. here are a few examples:</p>`;
  content += `<ul class="def-list" style="margin-left: 1rem;">`;
  content += `<li><strong>^a</strong> - finds words starting with "a" (e.g., "<b>A</b>pple")</li>`;
  content += `<li><strong>a$</strong> - finds word ending with "a" (e.g., "comm<b>A</b>")</li>`;
  content += `<li><strong>a.a</strong> - matches any character to [<b>.</b>] (e.g., "<b>A</b>n<b>A</b>", "l<b>A</b>v<b>A</b>")</li>`;
  content += `<li><strong>[aeiou]{3}</strong> - finds words with 3 vowels in a row</li>`;
  content += `</ul>`;
  content += `<p style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-subtle);">Tip: <strong>@def</strong> can also be used to list all words that have definitions, and @def:[part-of-speech] to filter by part of speech.</p>`;

  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}


// checks if a word has a valid definition
function wordHasRealDefinition(word) {
  const entries = dictionaryData[word];
  if (!entries || !Array.isArray(entries)) return false;

  return entries.some((entry) => {
    if (!entry.def) return false;
    if (Array.isArray(entry.def)) return entry.def.length > 0;
    return typeof entry.def === 'string' && entry.def.trim() !== '';
  });
}

// search filter logic
function searchWords(query) {
  let matchedWords = [];
  const queryLower = query.toLowerCase();

  if (queryLower.startsWith('@def')) {
    if (queryLower.startsWith('@def:')) {
      const spaceIndex = query.indexOf(' ');
      let posQuery = '';
      let subQuery = '';

      if (spaceIndex !== -1) {
        posQuery = query.slice(5, spaceIndex).trim().toLowerCase();
        subQuery = query.slice(spaceIndex + 1).trim();
      } else {
        posQuery = query.slice(5).trim().toLowerCase();
      }

      let basePool = [];
      for (const posKey in posIndex) {
        if (posKey.startsWith(posQuery)) {
          basePool.push(...posIndex[posKey]);
        }
      }
      basePool = [...new Set(basePool)];

      if (subQuery !== '') {
        try {
          const regex = new RegExp(subQuery, 'i');
          matchedWords = basePool.filter((word) => regex.test(word));
        } catch (err) {
          matchedWords = basePool.filter((word) => word.toLowerCase().includes(subQuery.toLowerCase()));
        }
      } else {
        matchedWords = basePool;
      }
    } else {
      const subQuery = query.slice(4).trim();
      if (subQuery === '') {
        matchedWords = definedWordsCache;
      } else {
        try {
          const regex = new RegExp(subQuery, 'i');
          matchedWords = definedWordsCache.filter((word) => regex.test(word));
        } catch (err) {
          matchedWords = definedWordsCache.filter((word) => word.toLowerCase().includes(subQuery.toLowerCase()));
        }
      }
    }
  } else {
    const words = Object.keys(dictionaryData);
    try {
      const regex = new RegExp(query, 'i');
      matchedWords = words.filter((word) => regex.test(word));
    } catch (err) {
      matchedWords = words.filter((word) => word.toLowerCase().includes(query.toLowerCase()));
    }
  }
  currentMatchedWords = matchedWords;
  applySortingAndRender();
}

// sorting utility function
function applySortingAndRender() {
  currentMatchedWords.sort((a, b) => {
    let comparison = 0;
    if (sortType === 'alpha') {
      comparison = a.localeCompare(b);
    } else {
      comparison = a.length - b.length;
      if (comparison === 0) {
        comparison = a.localeCompare(b);
      }
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  displayedCount = 0;
  renderResults();
}

// display filtered words in batches (BATCH_SIZE) with infinite scroll support
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
    gridContainer.addEventListener('scroll', handleGridScroll);
  }

  const gridContainer = document.getElementById('word-grid-container');
  if (!gridContainer) return;

  const nextBatchEnd = Math.min(
    displayedCount + BATCH_SIZE,
    currentMatchedWords.length
  );
  const batchToRender = currentMatchedWords.slice(displayedCount, nextBatchEnd);

  let batchHtml = '';
  batchToRender.forEach((word) => {
    const hasDefinition = wordHasRealDefinition(word);
    const cssClass = hasDefinition
      ? 'word-pill has-definition'
      : 'word-pill no-definition';

    batchHtml += `<button class="${cssClass}" data-word="${word}">${word}</button>`;
  });

  gridContainer.insertAdjacentHTML('beforeend', batchHtml);
  displayedCount = nextBatchEnd;

  gridContainer.querySelectorAll('.word-pill').forEach((btn) => {
    if (!btn.dataset.bound) {
      btn.dataset.bound = 'true';
      const word = btn.getAttribute('data-word');
      const hasDefinition = wordHasRealDefinition(word);

      if (hasDefinition) {
        btn.addEventListener('click', () => {
          openModal(word);
        });
      } else {
        btn.style.cursor = 'default';
      }
    }
  });
}

// checks if scrolled near bottom of word list
function handleGridScroll(e) {
  const target = e.target;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 30) {
    if (displayedCount < currentMatchedWords.length) {
      renderResults();
    }
  }
}

// modal body
function openModal(word) {
  const entries = dictionaryData[word];
  let content = `<h2>${word}</h2>`;

  entries.forEach((entry, index) => {
    content += `<div class="definition-entry">`;
    content += `<span class="pos-tag">${entry.pos}</span>`;

    if (entry.pron) {
      content += `<span class="ipa-tag">${entry.pron}</span>`;
    }

    if (Array.isArray(entry.def)) {
      content += `<ul class="def-list">`;
      entry.def.forEach((d) => {
        content += `<li>${d}</li>`;
      });
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

// close modal if X is clicked
closeModalBtn.addEventListener('click', () => {
  modal.classList.add('hidden');
});

// close modal if clicking outside
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.add('hidden');
  }
});

// close modal when ESC is pressed
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
  }
});