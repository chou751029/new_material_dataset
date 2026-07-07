// Google Spreadsheet ID
const SPREADSHEET_ID = '1gWQv6qg2R_uTyjYNorDK5vWNpjwL1JXDmxdMi5JjZuA';

// Global State
let rawItems = [];
let filteredItems = [];
let activeFilters = {
  search: '',
  country: '',
  sector: '',
  attribute: ''
};

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const emptyContainer = document.getElementById('empty-container');
const dataGrid = document.getElementById('data-grid');

const searchInput = document.getElementById('search-input');
const filterCountry = document.getElementById('filter-country');
const filterSector = document.getElementById('filter-sector');
const filterAttribute = document.getElementById('filter-attribute');
const activeFiltersContainer = document.getElementById('active-filters-container');

const statTotal = document.getElementById('stat-total');
const statCountries = document.getElementById('stat-countries');
const statSectors = document.getElementById('stat-sectors');

const btnReset = document.getElementById('btn-reset');
const btnRetry = document.getElementById('btn-retry');
const btnExport = document.getElementById('btn-export');

const detailModal = document.getElementById('detail-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  // Search input with basic debounce
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      activeFilters.search = e.target.value;
      applyFilters();
    }, 250);
  });

  // Dropdown changes
  filterCountry.addEventListener('change', (e) => {
    activeFilters.country = e.target.value;
    applyFilters();
  });

  filterSector.addEventListener('change', (e) => {
    activeFilters.sector = e.target.value;
    applyFilters();
  });

  filterAttribute.addEventListener('change', (e) => {
    activeFilters.attribute = e.target.value;
    applyFilters();
  });

  // Buttons
  btnReset.addEventListener('click', resetFilters);
  btnRetry.addEventListener('click', fetchData);
  btnExport.addEventListener('click', handleExport);

  // Modal close handlers
  btnCloseModal.addEventListener('click', () => {
    closeModal();
  });

  // Close modal when clicking on the backdrop
  detailModal.addEventListener('click', (e) => {
    const dialogDimensions = detailModal.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      closeModal();
    }
  });
}

// Global Callback for Google Visualization API JSONP
window.handleGoogleData = function(response) {
  try {
    if (!response || response.status !== 'ok') {
      const errReason = response && response.errors && response.errors[0] ? response.errors[0].detailed_message : '未知錯誤';
      throw new Error(errReason);
    }

    const table = response.table;
    if (!table || !table.rows || table.rows.length === 0) {
      throw new Error('試算表中沒有找到任何政策或技術資料。');
    }

    processRawData(table.rows);
    populateDropdowns();
    updateStats();
    applyFilters();
    showData();
  } catch (error) {
    console.error('Processing Google Data failed:', error);
    showError(error.message);
  }
};

// Fetch Data from Google Sheets using JSONP (bypasses CORS in file:// and local hosts)
function fetchData() {
  showLoading();
  
  // Create JSONP script tag
  const script = document.createElement('script');
  script.id = 'gviz-jsonp-script';
  // responseHandler parameter tells Google Sheets query engine to wrap JSON inside handleGoogleData() call
  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:handleGoogleData`;
  
  // Catch network or sharing configuration errors
  script.onerror = () => {
    showError('無法載入 Google 試算表，請檢查您的網路連線，並確認試算表已開啟「知道連結的任何人均可檢視」分享設定。');
  };

  // Clean up any old script tag
  const oldScript = document.getElementById('gviz-jsonp-script');
  if (oldScript) {
    oldScript.remove();
  }

  document.body.appendChild(script);
}

// Process rows from Google Visualization JSON format into objects
function processRawData(rows) {
  rawItems = rows.map((row, index) => {
    const c = row.c;
    if (!c) return null;

    // Helper to get formatted string 'f' first, fallback to raw value 'v'
    const getVal = (idx) => {
      const cell = c[idx];
      if (!cell) return '';
      if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
      if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
      return '';
    };

    return {
      id: index,
      country: getVal(0),
      name: getVal(1),
      date: getVal(2),
      sector: getVal(3),
      attribute: getVal(4),
      description: getVal(5),
      metalRelation: getVal(6),
      emergingRelation: getVal(7),
      sourceUrl: getVal(8)
    };
  }).filter(item => item && item.name); // Keep items that have names
}

// Populate Filter Dropdowns dynamically based on data
function populateDropdowns() {
  const countries = new Set();
  const sectors = new Set();
  const attributes = new Set();

  rawItems.forEach(item => {
    if (item.country) countries.add(item.country);
    if (item.attribute) attributes.add(item.attribute);
    if (item.sector) {
      // sector field can be a comma-separated list
      item.sector.split(',').forEach(s => {
        const trimmed = s.trim();
        if (trimmed) sectors.add(trimmed);
      });
    }
  });

  // Country Dropdown
  filterCountry.innerHTML = '<option value="">全部國家</option>';
  Array.from(countries).sort().forEach(country => {
    const opt = document.createElement('option');
    opt.value = country;
    opt.textContent = country;
    filterCountry.appendChild(opt);
  });

  // Sector Dropdown
  filterSector.innerHTML = '<option value="">全部領域</option>';
  Array.from(sectors).sort().forEach(sector => {
    const opt = document.createElement('option');
    opt.value = sector;
    opt.textContent = sector;
    filterSector.appendChild(opt);
  });

  // Attribute Dropdown
  filterAttribute.innerHTML = '<option value="">全部屬性</option>';
  Array.from(attributes).sort().forEach(attr => {
    const opt = document.createElement('option');
    opt.value = attr;
    opt.textContent = attr;
    filterAttribute.appendChild(opt);
  });
}

// Apply Search & Filters to State
function applyFilters() {
  const searchQuery = activeFilters.search.toLowerCase().trim();

  filteredItems = rawItems.filter(item => {
    // Search query matches in name, description, metal, and emerging fields
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery) ||
      item.description.toLowerCase().includes(searchQuery) ||
      item.metalRelation.toLowerCase().includes(searchQuery) ||
      item.emergingRelation.toLowerCase().includes(searchQuery);

    const matchesCountry = !activeFilters.country || item.country === activeFilters.country;
    
    // Sector matches if selected is one of the sub-sectors
    const itemSectors = item.sector.split(',').map(s => s.trim());
    const matchesSector = !activeFilters.sector || itemSectors.includes(activeFilters.sector);
    
    const matchesAttribute = !activeFilters.attribute || item.attribute === activeFilters.attribute;

    return matchesSearch && matchesCountry && matchesSector && matchesAttribute;
  });

  renderActiveTags();
  renderGrid();
  updateStats();
}

// Render Active Filter Tags below inputs
function renderActiveTags() {
  activeFiltersContainer.innerHTML = '';

  const addTag = (type, val, label) => {
    const tag = document.createElement('div');
    tag.className = 'filter-tag';
    tag.innerHTML = `
      <span>${label}: ${val}</span>
      <button data-type="${type}">&times;</button>
    `;
    tag.querySelector('button').addEventListener('click', () => {
      removeFilter(type);
    });
    activeFiltersContainer.appendChild(tag);
  };

  if (activeFilters.search) {
    addTag('search', activeFilters.search, '搜尋');
  }
  if (activeFilters.country) {
    addTag('country', activeFilters.country, '國家');
  }
  if (activeFilters.sector) {
    addTag('sector', activeFilters.sector, '領域');
  }
  if (activeFilters.attribute) {
    addTag('attribute', activeFilters.attribute, '屬性');
  }
}

// Remove single filter tag
function removeFilter(type) {
  if (type === 'search') {
    searchInput.value = '';
    activeFilters.search = '';
  } else if (type === 'country') {
    filterCountry.value = '';
    activeFilters.country = '';
  } else if (type === 'sector') {
    filterSector.value = '';
    activeFilters.sector = '';
  } else if (type === 'attribute') {
    filterAttribute.value = '';
    activeFilters.attribute = '';
  }
  applyFilters();
}

// Reset all Filters
function resetFilters() {
  searchInput.value = '';
  filterCountry.value = '';
  filterSector.value = '';
  filterAttribute.value = '';

  activeFilters = {
    search: '',
    country: '',
    sector: '',
    attribute: ''
  };

  applyFilters();
}

// Update Stats Dashboard numbers
function updateStats() {
  // Compute unique values in current filtered dataset
  const uniqueCountries = new Set();
  const uniqueSectors = new Set();

  rawItems.forEach(item => {
    if (item.country) uniqueCountries.add(item.country);
    if (item.sector) {
      item.sector.split(',').forEach(s => {
        const trimmed = s.trim();
        if (trimmed) uniqueSectors.add(trimmed);
      });
    }
  });

  statTotal.textContent = filteredItems.length;
  statCountries.textContent = uniqueCountries.size;
  statSectors.textContent = uniqueSectors.size;
}

// Render Card Grid HTML
function renderGrid() {
  dataGrid.innerHTML = '';

  if (filteredItems.length === 0) {
    emptyContainer.classList.remove('hidden');
    dataGrid.classList.add('hidden');
    return;
  }

  emptyContainer.classList.add('hidden');
  dataGrid.classList.remove('hidden');

  filteredItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'policy-card';
    card.addEventListener('click', () => openModal(item));

    // Render tags
    const firstSectors = item.sector.split(',').slice(0, 2).map(s => s.trim());
    let sectorTagsHTML = firstSectors.map(s => `<span class="badge badge-sector">${s}</span>`).join('');
    if (item.sector.split(',').length > 2) {
      sectorTagsHTML += `<span class="badge badge-sector">+${item.sector.split(',').length - 2}</span>`;
    }

    const hasMetal = item.metalRelation && item.metalRelation.trim().length > 0;
    const hasEmerging = item.emergingRelation && item.emergingRelation.trim().length > 0;

    card.innerHTML = `
      <div class="card-header">
        <div class="card-tags">
          <span class="badge badge-country">${item.country}</span>
          ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
          ${sectorTagsHTML}
        </div>
        <span class="card-date">${item.date || '無日期'}</span>
      </div>
      <h3>${item.name}</h3>
      <p class="card-desc">${item.description || '點擊查看詳細說明'}</p>
      <div class="card-footer">
        <div class="material-icons-summary">
          ${hasMetal ? '<span class="material-chip-summary metal">🔩 金屬</span>' : ''}
          ${hasEmerging ? '<span class="material-chip-summary emerging">🧪 新興材料</span>' : ''}
        </div>
        <span class="view-more-link">
          詳細內容
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </div>
    `;

    dataGrid.appendChild(card);
  });
}

// Open Detail Dialog Modal
function openModal(item) {
  const modalTags = document.getElementById('modal-tags');
  const modalTitle = document.getElementById('modal-title');
  const modalDate = document.getElementById('modal-date');
  const modalCountry = document.getElementById('modal-country');
  
  const modalDesc = document.getElementById('modal-desc');
  const modalMetal = document.getElementById('modal-metal');
  const modalEmerging = document.getElementById('modal-emerging');
  const modalSource = document.getElementById('modal-source');

  // Populate basic text
  modalTitle.textContent = item.name;
  modalDate.textContent = item.date || '無';
  modalCountry.textContent = item.country || '無';

  // Render Tags
  modalTags.innerHTML = `
    <span class="badge badge-country">${item.country}</span>
    ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
  `;
  item.sector.split(',').forEach(s => {
    const trimmed = s.trim();
    if (trimmed) {
      modalTags.innerHTML += `<span class="badge badge-sector">${trimmed}</span>`;
    }
  });

  // Details contents (with HTML fallback to display placeholders nicely)
  modalDesc.textContent = item.description || '無詳細說明。';
  
  if (item.metalRelation && item.metalRelation.trim()) {
    modalMetal.parentElement.classList.remove('hidden');
    modalMetal.textContent = item.metalRelation;
  } else {
    modalMetal.parentElement.classList.add('hidden');
  }

  if (item.emergingRelation && item.emergingRelation.trim()) {
    modalEmerging.parentElement.classList.remove('hidden');
    modalEmerging.textContent = item.emergingRelation;
  } else {
    modalEmerging.parentElement.classList.add('hidden');
  }

  // Source URL Setup
  if (item.sourceUrl && item.sourceUrl.trim().startsWith('http')) {
    modalSource.parentElement.parentElement.classList.remove('hidden');
    modalSource.href = item.sourceUrl.trim();
    modalSource.textContent = item.sourceUrl.trim().substring(0, 50) + (item.sourceUrl.trim().length > 50 ? '...' : '');
  } else {
    modalSource.parentElement.parentElement.classList.add('hidden');
  }

  // Open the native HTML dialog
  detailModal.showModal();
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

// Close Modal
function closeModal() {
  detailModal.close();
  document.body.style.overflow = ''; // Restore background scrolling
}

// Export Current Filtered items to Excel-compatible CSV
function handleExport() {
  if (filteredItems.length === 0) {
    alert('目前沒有可以匯出的資料！');
    return;
  }

  const headers = ['國家', '政策/技術之名稱', '出版日期', '領域別', '屬性', '內容說明', '與金屬材料/製程關聯內容', '其他新興材料應用內容', '資料來源/連結'];
  let csvContent = "\uFEFF"; // Add UTF-8 BOM for Microsoft Excel compliance

  // Header row
  csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

  // Data rows
  filteredItems.forEach(item => {
    const row = [
      item.country,
      item.name,
      item.date,
      item.sector,
      item.attribute,
      item.description,
      item.metalRelation,
      item.emergingRelation,
      item.sourceUrl
    ];
    csvContent += row.map(val => {
      const cleanVal = val ? val.replace(/"/g, '""') : '';
      return `"${cleanVal}"`;
    }).join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `各國政策與技術盤點篩選匯出_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// UI State Toggles
function showLoading() {
  loadingIndicator.classList.remove('hidden');
  errorContainer.classList.add('hidden');
  emptyContainer.classList.add('hidden');
  dataGrid.classList.add('hidden');
}

function showError(msg) {
  loadingIndicator.classList.add('hidden');
  errorContainer.classList.remove('hidden');
  emptyContainer.classList.add('hidden');
  dataGrid.classList.add('hidden');
  errorMessage.textContent = `錯誤訊息：${msg}。請確認試算表共用設定已設為「知道連結的任何人均可檢視」，且您的網路連線正常。`;
}

function showData() {
  loadingIndicator.classList.add('hidden');
  errorContainer.classList.add('hidden');
}
