let dictionaryData = {};
let currentMatchedWords = [];
let displayedCount = 0;
const BATCH_SIZE = 200;

let sortType = 'alpha'; // 'alpha' or 'length'
let sortDirection = 'asc'; // 'asc' or 'desc'

// fetch dict.json when page is loaded
async function loadDictionary() {
  try {
    const response = await fetch('dict.json');
    dictionaryData = await response.json();
    console.log(
      `Loaded ${Object.keys(dictionaryData).length} words into memory.`
    );
  } catch (error) {
    console.error('Failed to load dictionary:', error);
    document.getElementById(
      'results-container'
    ).innerHTML = `<p class="placeholder-text" style="color: #ff6b6b;">Error loading dict.json. Check console.</p>`;
  }
}

loadDictionary();

const searchInput = document.getElementById('search-input');
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
  const query = e.target.value.trim();

  if (query === '') {
    renderPlaceholder();
    currentMatchedWords = [];
    displayedCount = 0;
    return;
  }

  searchWords(query);
});

// sort type button listener
sortTypeBtn.addEventListener('click', () => {
  sortType = sortType === 'alpha' ? 'length' : 'alpha';

  // update icon
  if (sortType === 'alpha') {
    sortTypeIcon.className = 'fa-solid fa-arrow-down-a-z';
    sortTypeBtn.title = 'Current: Alphabetical (Click to switch to Length)';
  } else {
    sortTypeIcon.className = 'fa-solid fa-arrow-down-1-9';
    sortTypeBtn.title = 'Current: Length (Click to switch to Alphabetical)';
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
    sortDirBtn.title = 'Current: Ascending (Click to switch to Descending)';
  } else {
    sortDirIcon.className = 'fa-solid fa-arrow-down';
    sortDirBtn.title = 'Current: Descending (Click to switch to Ascending)';
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
  const words = Object.keys(dictionaryData);
  let matchedWords = [];

  const queryLower = query.toLowerCase();

  // check if query uses @def command
  if (queryLower.startsWith('@def')) {
    // all words that are defined
    let definedWords = words.filter((word) => wordHasRealDefinition(word));

    // check if part-of-speech filter is included
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

      const posRegex = new RegExp(`\\b${posQuery}\\b`, 'i');

      // search all entries so that words with POS tag, WITHOUT definitions, still appear in results
      let posFilteredWords = words.filter((word) => {
        const entries = dictionaryData[word];
        if (!entries || !Array.isArray(entries)) return false;
        return entries.some((entry) => entry.pos && posRegex.test(entry.pos));
      });

      // if there is extra text after POS tag (regex query), filter further
      if (subQuery !== '') {
        try {
          const regex = new RegExp(subQuery, 'i');
          matchedWords = posFilteredWords.filter((word) => regex.test(word));
        } catch (err) {
          matchedWords = posFilteredWords.filter((word) => word.toLowerCase().includes(subQuery.toLowerCase())
          );
        }
      } else {
        matchedWords = posFilteredWords;
      }
    } else {
      // normal @def query logic
      const subQuery = query.slice(4).trim();

      if (subQuery === '') {
        matchedWords = definedWords;
      } else {
        try {
          const regex = new RegExp(subQuery, 'i');
          matchedWords = definedWords.filter((word) => regex.test(word));
        } catch (err) {
          matchedWords = definedWords.filter((word) => word.toLowerCase().includes(subQuery.toLowerCase())
          );
        }
      }
    }
  } else {
    // normal search logic without @def
    try {
      const regex = new RegExp(query, 'i');
      matchedWords = words.filter((word) => regex.test(word));
    } catch (err) {
      matchedWords = words.filter((word) => word.toLowerCase().includes(query.toLowerCase())
      );
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
      content += `<hr style="border-color: #333; margin: 1rem 0;">`;
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