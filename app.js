/* ===== CATEGORY DEFINITIONS ===== */
const CATS = {
    beaches:     { name: 'Beaches & Water',        color: '#0077be', gradient: 'linear-gradient(135deg, #005c99, #00b4d8)' },
    hikes:       { name: 'Hikes & Trails',          color: '#2e7d32', gradient: 'linear-gradient(135deg, #1b5e20, #66bb6a)' },
    dining:      { name: 'Restaurants',              color: '#c62828', gradient: 'linear-gradient(135deg, #b71c1c, #ef5350)' },
    foodtrucks:  { name: 'Food Trucks & Eats',       color: '#e65100', gradient: 'linear-gradient(135deg, #bf360c, #ff8a65)' },
    adventures:  { name: 'Adventures',               color: '#00695c', gradient: 'linear-gradient(135deg, #004d40, #26a69a)' },
    cultural:    { name: 'Cultural & Museums',        color: '#6a1b9a', gradient: 'linear-gradient(135deg, #4a148c, #ab47bc)' },
    family:      { name: 'Kids & Family',             color: '#d81b60', gradient: 'linear-gradient(135deg, #880e4f, #f06292)' },
    nature:      { name: 'Nature & Scenic',           color: '#33691e', gradient: 'linear-gradient(135deg, #1b5e20, #8bc34a)' },
    local:       { name: 'Local Experiences',         color: '#4e342e', gradient: 'linear-gradient(135deg, #3e2723, #8d6e63)' },
    breweries:   { name: 'Breweries',                 color: '#e65100', gradient: 'linear-gradient(135deg, #bf360c, #ffb74d)' },
    groceries:   { name: 'Grocery Stores',            color: '#37474f', gradient: 'linear-gradient(135deg, #263238, #78909c)' },
    foodsources: { name: 'Fish & Meat Markets',       color: '#01579b', gradient: 'linear-gradient(135deg, #01579b, #4fc3f7)' },
    events:      { name: 'Events & Calendar',         color: '#ad1457', gradient: 'linear-gradient(135deg, #880e4f, #ec407a)' },
    luaus:       { name: 'Luaus',                      color: '#ff6f00', gradient: 'linear-gradient(135deg, #e65100, #ffca28)' },
    treats:      { name: 'Treats & Sweets',            color: '#e91e63', gradient: 'linear-gradient(135deg, #c2185b, #f48fb1)' }
};

/* ===== HELPERS ===== */
function isKidFriendly(a) {
    if (!a.kidInfo) return false;
    const k = a.kidInfo.toLowerCase();
    if (k.includes('not suitable') || k.includes('not for young') || k.includes('not recommended') ||
        k.includes('not ideal for young') || k.includes('not allowed') || k.includes('parents only') ||
        k.includes('no kids under')) return false;
    return true;
}

/* ===== PHOTO CACHE & LOCAL IMAGE SUPPORT ===== */
const photoCache = new Map();
const localImageCache = new Map();

/* Find a single local image for an activity */
async function findLocalImage(activity) {
    const slug = activity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    const candidates = [
        `images/${slug}.jpg`,
        `images/${slug}.png`,
        `images/${slug}.webp`
    ];
    for (const path of candidates) {
        if (localImageCache.has(path)) {
            if (localImageCache.get(path)) return localImageCache.get(path);
            continue;
        }
        try {
            const res = await fetch(path, { method: 'HEAD' });
            if (res.ok) { localImageCache.set(path, path); return path; }
            localImageCache.set(path, null);
        } catch { localImageCache.set(path, null); }
    }
    return null;
}

/* ===== WIKIPEDIA IMAGE FETCHING ===== */
async function fetchWikiImage(title) {
    if (!title) return null;
    if (photoCache.has(title)) return photoCache.get(title);
    try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        let imgUrl = data.originalimage?.source || data.thumbnail?.source || null;
        if (imgUrl && data.thumbnail?.source) {
            imgUrl = data.thumbnail.source.replace(/\/\d+px-/, '/800px-');
        }
        photoCache.set(title, imgUrl);
        return imgUrl;
    } catch {
        photoCache.set(title, null);
        return null;
    }
}

/* Get a single photo: local > wiki > null */
async function getPhoto(activity) {
    const local = await findLocalImage(activity);
    if (local) return local;
    if (activity.wiki) return await fetchWikiImage(activity.wiki);
    return null;
}

/* ===== DATE HELPERS ===== */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateRange(start, end) {
    if (!start) return '';
    if (!end || start === end) return formatDate(start);
    return `${formatDate(start)} - ${formatDate(end)}`;
}

/* ===== STATE ===== */
let activeCategory = 'all';
let activeView = 'grid'; // 'grid' or 'calendar'
let searchQuery = '';
let sortBy = 'default';
let filterDistance = 'any';
let filterAge = 'any';
let filterOptions = 'any';

/* ===== SORT & FILTER HELPERS ===== */
function parseDriveMinutes(dt) {
    if (!dt) return 999;
    const m = dt.match(/(\d+)/);
    return m ? parseInt(m[1]) : 999;
}

function isFree(a) {
    return a.cost && a.cost.toLowerCase().includes('free');
}

function sortActivities(list) {
    switch (sortBy) {
        case 'distance':
            return [...list].sort((a, b) => parseDriveMinutes(a.driveTime) - parseDriveMinutes(b.driveTime));
        case 'name':
            return [...list].sort((a, b) => a.name.localeCompare(b.name));
        case 'cost-low':
            return [...list].sort((a, b) => {
                const aFree = isFree(a) ? 0 : 1;
                const bFree = isFree(b) ? 0 : 1;
                if (aFree !== bFree) return aFree - bFree;
                return parseDriveMinutes(a.driveTime) - parseDriveMinutes(b.driveTime);
            });
        default:
            return list;
    }
}

function applyFilters(list) {
    return list.filter(a => {
        // Distance filter
        if (filterDistance !== 'any') {
            const mins = parseDriveMinutes(a.driveTime);
            if (mins > parseInt(filterDistance)) return false;
        }
        // Age filter
        if (filterAge === 'toddler') {
            const info = (a.kidInfo || '').toLowerCase() + ' ' + (a.description || '').toLowerCase() + ' ' + (a.tags || []).join(' ').toLowerCase();
            if (info.includes('not suitable') || info.includes('not for young') || info.includes('not recommended for young') || info.includes('not ideal for young') || info.includes('parents only') || info.includes('no kids under')) return false;
            if (info.includes('toddler') || info.includes('stroller') || info.includes('all ages') || info.includes('calm water') || info.includes('wading') || info.includes('shallow')) return true;
            // Allow anything that doesn't explicitly exclude young kids
            return !info.includes('ages 7+') && !info.includes('ages 8+') && !info.includes('ages 6+');
        }
        if (filterAge === 'kids') {
            const info = (a.kidInfo || '').toLowerCase() + ' ' + (a.description || '').toLowerCase();
            if (info.includes('parents only') || info.includes('not recommended for') || info.includes('no kids under')) return false;
            return true;
        }
        if (filterAge === 'parents') {
            const info = (a.kidInfo || '').toLowerCase() + ' ' + (a.description || '').toLowerCase() + ' ' + (a.tags || []).join(' ').toLowerCase();
            return info.includes('parents only') || info.includes('date night') || info.includes('no kids under') || info.includes('not ideal for young');
        }
        // Options filter
        if (filterOptions === 'free') {
            if (!isFree(a)) return false;
        }
        if (filterOptions === 'gf') {
            if (!a.gfInfo) return false;
        }
        return true;
    });
}

/* ===== RENDER FILTERS ===== */
function renderFilters() {
    const el = document.getElementById('filters');
    const counts = {};
    ACTIVITIES.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1; });

    let html = `<button class="filter-btn active" data-cat="all">All<span class="filter-count">${ACTIVITIES.length}</span></button>`;
    // Add calendar view toggle
    html += `<button class="filter-btn view-toggle" data-view="calendar" id="calendarToggle">Calendar View</button>`;
    for (const [key, cat] of Object.entries(CATS)) {
        if (!counts[key]) continue;
        html += `<button class="filter-btn" data-cat="${key}">${cat.name}<span class="filter-count">${counts[key]}</span></button>`;
    }
    el.innerHTML = html;

    el.querySelectorAll('.filter-btn[data-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            activeView = 'grid';
            document.getElementById('calendarToggle').classList.remove('active');
            el.querySelectorAll('.filter-btn[data-cat]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.cat;
            render();
        });
    });

    document.getElementById('calendarToggle').addEventListener('click', () => {
        activeView = activeView === 'calendar' ? 'grid' : 'calendar';
        document.getElementById('calendarToggle').classList.toggle('active', activeView === 'calendar');
        if (activeView === 'calendar') {
            el.querySelectorAll('.filter-btn[data-cat]').forEach(b => b.classList.remove('active'));
        } else {
            el.querySelector('[data-cat="all"]').classList.add('active');
            activeCategory = 'all';
        }
        render();
    });
}

function render() {
    if (activeView === 'calendar') {
        renderCalendar();
    } else {
        renderGrid();
    }
}

/* ===== RENDER GRID ===== */
function renderGrid() {
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const stats = document.getElementById('stats');
    const q = searchQuery.toLowerCase().trim();

    let filtered = ACTIVITIES.filter(a => {
        if (activeCategory !== 'all' && a.category !== activeCategory) return false;
        if (q) {
            const haystack = [a.name, a.description, a.address, a.category, a.recurring || '', ...(a.tags || [])].join(' ').toLowerCase();
            return haystack.includes(q);
        }
        return true;
    });

    filtered = applyFilters(filtered);
    filtered = sortActivities(filtered);

    stats.textContent = `Showing ${filtered.length} of ${ACTIVITIES.length} activities`;

    if (!filtered.length) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    grid.innerHTML = filtered.map(a => {
        const cat = CATS[a.category] || CATS.events;
        const costTag = a.cost
            ? (a.cost.toLowerCase().includes('free')
                ? `<span class="card-tag tag-free">Free</span>`
                : `<span class="card-tag tag-cost">${a.cost.length > 30 ? a.cost.slice(0, 30) + '...' : a.cost}</span>`)
            : '';
        const driveTag = a.driveTime ? `<span class="card-tag tag-drive">${a.driveTime}${a.distance ? ' · ' + a.distance : ''}</span>` : '';
        const kidsTag = isKidFriendly(a) ? `<span class="card-tag tag-kids">Kid-friendly</span>` : '';
        const gfTag = a.gfInfo ? `<span class="card-tag tag-gf">GF options</span>` : '';
        const dateTag = a.eventDate ? `<span class="card-tag tag-date">${formatDate(a.eventDate)}</span>` : '';
        const recurTag = a.recurring ? `<span class="card-tag tag-recur">${a.recurring}</span>` : '';
        const topPick = (a.tags || []).includes('TOP PICK') ? `<span class="card-tag tag-top">TOP PICK</span>` : '';

        return `
        <div class="card" data-id="${a.id}" onclick="openModal(${a.id})">
            <div class="card-image" style="background: ${cat.gradient}">
                <div class="fallback">${a.name}</div>
                <img loading="lazy" data-id="${a.id}" data-wiki="${a.wiki || ''}" src="" alt="${a.name}"
                     onload="if(this.src)this.parentElement.querySelector('.fallback').style.opacity='0'"
                     onerror="this.style.display='none'" style="display:none">
                ${a.driveTime ? `<span class="card-badge">${a.driveTime}${a.distance ? ' · ' + a.distance : ''}</span>` : ''}
                <span class="card-category-badge" style="background:${cat.color}">${cat.name}</span>
                <div class="card-links" onclick="event.stopPropagation()">
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address || a.name + ' Oahu Hawaii')}" target="_blank" rel="noopener" title="Google Maps" class="card-link-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></a>
                    ${a.url ? `<a href="${a.url}" target="_blank" rel="noopener" title="Website" class="card-link-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}
                </div>
            </div>
            <div class="card-body">
                <h3 class="card-title">${a.name}</h3>
                <p class="card-desc">${a.description}</p>
                <div class="card-meta">
                    ${topPick}${dateTag}${recurTag}${driveTag}${costTag}${kidsTag}${gfTag}
                </div>
            </div>
        </div>`;
    }).join('');

    lazyLoadImages();
}

/* ===== RENDER CALENDAR VIEW ===== */
function renderCalendar() {
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const stats = document.getElementById('stats');
    empty.style.display = 'none';

    const events = ACTIVITIES.filter(a => a.category === 'events' || a.category === 'luaus');
    const dated = events.filter(a => a.eventDate && !a.recurring).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const recurring = events.filter(a => a.recurring);
    const luaus = ACTIVITIES.filter(a => a.category === 'luaus');

    stats.textContent = `Calendar: ${dated.length} events + ${recurring.length} recurring + ${luaus.length} luaus`;

    // Group by week
    const weeks = {};
    const weekLabels = {
        '2026-03-15': 'Week 1: Mar 15-21 (Arrival + Spring Break)',
        '2026-03-22': 'Week 2: Mar 22-28',
        '2026-03-29': 'Week 3: Mar 29 - Apr 4',
        '2026-04-05': 'Week 4: Apr 5-11',
        '2026-04-12': 'Week 5: Apr 12-19 (Final Week)'
    };
    const weekStarts = Object.keys(weekLabels);

    dated.forEach(ev => {
        let weekKey = weekStarts[0];
        for (const ws of weekStarts) {
            if (ev.eventDate >= ws) weekKey = ws;
        }
        if (!weeks[weekKey]) weeks[weekKey] = [];
        weeks[weekKey].push(ev);
    });

    let html = '';

    // Top 10 Must-Do
    const topPicks = ACTIVITIES.filter(a => (a.tags || []).includes('TOP PICK'));
    if (topPicks.length) {
        html += `<div class="calendar-section top-picks-section">
            <h2 class="calendar-heading">Must-Do Events</h2>
            <div class="top-picks-grid">
                ${topPicks.map(a => {
                    const cat = CATS[a.category] || CATS.events;
                    return `<div class="top-pick-card" onclick="openModal(${a.id})">
                        <div class="top-pick-color" style="background:${cat.gradient}"></div>
                        <div class="top-pick-info">
                            <strong>${a.name}</strong>
                            <span class="top-pick-date">${a.eventDate ? formatDate(a.eventDate) : a.recurring || ''}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // Recurring weekly events
    if (recurring.length) {
        html += `<div class="calendar-section">
            <h2 class="calendar-heading">Every Week During Your Stay</h2>
            <div class="recurring-grid">
                ${recurring.map(a => {
                    const cat = CATS[a.category] || CATS.events;
                    return `<div class="recurring-card" onclick="openModal(${a.id})">
                        <div class="recurring-day" style="background:${cat.color}">${a.recurring}</div>
                        <div class="recurring-info">
                            <strong>${a.name}</strong>
                            <span>${a.hours || ''}</span>
                            <span class="recurring-cost">${a.cost || ''}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // Week-by-week events
    for (const ws of weekStarts) {
        const weekEvents = weeks[ws] || [];
        if (!weekEvents.length) continue;
        html += `<div class="calendar-section">
            <h2 class="calendar-heading">${weekLabels[ws]}</h2>
            <div class="week-events">
                ${weekEvents.map(a => {
                    const cat = CATS[a.category] || CATS.events;
                    const isTopPick = (a.tags || []).includes('TOP PICK');
                    return `<div class="week-event ${isTopPick ? 'top-pick' : ''}" onclick="openModal(${a.id})">
                        <div class="event-date-col" style="background:${cat.color}">
                            <span class="event-day">${new Date(a.eventDate + 'T12:00:00').getDate()}</span>
                            <span class="event-month">${new Date(a.eventDate + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short'})}</span>
                        </div>
                        <div class="event-info-col">
                            <div class="event-title">${isTopPick ? '<span class="top-badge">TOP PICK</span> ' : ''}${a.name}</div>
                            <div class="event-meta">${a.hours || ''} ${a.address ? '&middot; ' + a.address : ''}</div>
                            <div class="event-desc">${a.description.slice(0, 150)}${a.description.length > 150 ? '...' : ''}</div>
                            <div class="event-tags">
                                ${a.cost ? (a.cost.toLowerCase().includes('free') ? '<span class="card-tag tag-free">Free</span>' : `<span class="card-tag tag-cost">${a.cost.slice(0, 30)}</span>`) : ''}
                                ${isKidFriendly(a) ? '<span class="card-tag tag-kids">Kid-friendly</span>' : ''}
                                ${a.driveTime ? `<span class="card-tag tag-drive">${a.driveTime}${a.distance ? ' · ' + a.distance : ''}</span>` : ''}
                            </div>
                            <div class="event-links" onclick="event.stopPropagation()">
                                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address || a.name + ' Oahu Hawaii')}" target="_blank" rel="noopener" class="event-link">Maps</a>
                                ${a.url ? `<a href="${a.url}" target="_blank" rel="noopener" class="event-link">Website</a>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // Luaus
    if (luaus.length) {
        html += `<div class="calendar-section">
            <h2 class="calendar-heading">Luaus - Book at Least One!</h2>
            <div class="luau-grid">
                ${luaus.map(a => {
                    const cat = CATS.luaus;
                    return `<div class="luau-card" onclick="openModal(${a.id})">
                        <div class="luau-color" style="background:${cat.gradient}"></div>
                        <div class="luau-body">
                            <h3>${a.name}</h3>
                            <p>${a.description.slice(0, 180)}...</p>
                            <div class="luau-meta">
                                <span><strong>Cost:</strong> ${a.cost}</span>
                                <span><strong>Drive:</strong> ${a.driveTime}</span>
                                <span><strong>When:</strong> ${a.hours}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    grid.innerHTML = html;
}

/* ===== LAZY LOAD CARD IMAGES ===== */
function lazyLoadImages() {
    const cardImages = document.querySelectorAll('.card-image');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(async entry => {
            if (!entry.isIntersecting) return;
            const container = entry.target;
            observer.unobserve(container);
            const img = container.querySelector('img[data-id]');
            if (!img) return;
            const id = parseInt(img.dataset.id);
            const wiki = img.dataset.wiki;

            // Try local image first
            const activity = ACTIVITIES.find(a => a.id === id);
            if (activity) {
                const localImg = await findLocalImage(activity);
                if (localImg) {
                    img.src = localImg;
                    img.style.display = 'block';
                    return;
                }
            }
            // Fallback to Wikipedia
            if (wiki) {
                const url = await fetchWikiImage(wiki);
                if (url) {
                    img.src = url;
                    img.style.display = 'block';
                }
            }
        });
    }, { rootMargin: '200px' });
    cardImages.forEach(el => observer.observe(el));
}

/* ===== MODAL ===== */
async function openModal(id) {
    const a = ACTIVITIES.find(x => x.id === id);
    if (!a) return;
    const cat = CATS[a.category] || CATS.events;
    const modal = document.getElementById('modal');
    const gallery = document.getElementById('modal-gallery');
    const body = document.getElementById('modal-body');

    gallery.innerHTML = `<div class="gallery-fallback" style="background: ${cat.gradient}">${a.name}</div>`;

    const details = [];
    if (a.eventDate) details.push({ label: 'Date', value: formatDateRange(a.eventDate, a.eventEndDate) });
    if (a.recurring) details.push({ label: 'Recurring', value: a.recurring });
    if (a.address) details.push({ label: 'Address', value: a.address });
    if (a.driveTime) details.push({ label: 'Drive Time', value: a.driveTime });
    if (a.distance) details.push({ label: 'Distance', value: a.distance + ' from house' });
    if (a.cost) details.push({ label: 'Cost', value: a.cost });
    if (a.hours) details.push({ label: 'Hours', value: a.hours });
    if (a.kidInfo) details.push({ label: 'Kids', value: a.kidInfo });
    if (a.gfInfo) details.push({ label: 'Gluten-Free', value: a.gfInfo });
    if (a.region) details.push({ label: 'Region', value: a.region });

    const mapQuery = encodeURIComponent(a.address || a.name + ' Oahu Hawaii');
    const urlLink = a.url ? `<a href="${a.url}" target="_blank" rel="noopener" class="modal-event-link">Visit Website &rarr;</a>` : '';

    body.innerHTML = `
        <h2>${a.name}</h2>
        <span class="modal-category" style="background:${cat.color}">${cat.name}</span>
        ${(a.tags || []).includes('TOP PICK') ? '<span class="modal-top-pick">TOP PICK</span>' : ''}
        <p class="modal-desc">${a.description}</p>
        <div class="modal-details">
            ${details.map(d => `<div class="detail-item"><span class="detail-label">${d.label}</span><span class="detail-value">${d.value}</span></div>`).join('')}
        </div>
        ${a.tips ? `<div class="modal-tips"><div class="modal-tips-title">Tips</div><p>${a.tips}</p></div>` : ''}
        ${a.tags?.length ? `<div class="modal-tags">${a.tags.filter(t => t !== 'TOP PICK').map(t => `<span class="modal-tag">${t}</span>`).join('')}</div>` : ''}
        <div class="modal-actions">
            <a href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener" class="modal-map-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Google Maps
            </a>
            ${urlLink}
        </div>
    `;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const photo = await getPhoto(a);
    if (photo) {
        gallery.innerHTML = `<img src="${photo}" alt="${a.name}" onerror="this.style.display='none'">`;
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
}

/* ===== SCROLL TO TOP ===== */
function setupScrollTop() {
    const btn = document.createElement('button');
    btn.className = 'scroll-top';
    btn.innerHTML = '&#8593;';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    });
}

/* ===== EVENT LISTENERS ===== */
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});
document.getElementById('search').addEventListener('input', e => {
    searchQuery = e.target.value;
    render();
});

/* ===== SORT & FILTER CONTROLS ===== */
document.getElementById('sortBy').addEventListener('change', e => {
    sortBy = e.target.value;
    render();
});
document.getElementById('filterDistance').addEventListener('change', e => {
    filterDistance = e.target.value;
    highlightActiveSelects();
    render();
});
document.getElementById('filterAge').addEventListener('change', e => {
    filterAge = e.target.value;
    highlightActiveSelects();
    render();
});
document.getElementById('filterOptions').addEventListener('change', e => {
    filterOptions = e.target.value;
    highlightActiveSelects();
    render();
});

function highlightActiveSelects() {
    document.querySelectorAll('.control-select').forEach(sel => {
        const isActive = sel.value !== 'any' && sel.value !== 'default';
        sel.style.borderColor = isActive ? '#1a73e8' : '#ddd';
        sel.style.backgroundColor = isActive ? '#f0f7ff' : '#fff';
    });
}

/* ===== INIT ===== */
(function init() {
    renderFilters();
    render();
    setupScrollTop();
})();
