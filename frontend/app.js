
const CATEGORIES = ['democrats', 'republicans', 'independent'];

const CATEGORY_NAMES_RU = {
    'democrats': 'Демократы',
    'republicans': 'Республиканцы',
    'independent': 'Посередине'
};

const users = {
    'user-a': {
        name: 'Пользователь А',
        interests: {
            'democrats': 0.6,
            'republicans': 0.1,
            'independent': 0.3
        },
        leaning: -0.6, 
        bubbleLevel: 0.2,
        history: [],
        likes: new Set(),
        downvoted: new Set(),
        shared: new Set(),
        blocked: new Set()
    },
    'user-b': {
        name: 'Пользователь Б',
        interests: {
            'democrats': 0.1,
            'republicans': 0.6,
            'independent': 0.3
        },
        leaning: 0.6, 
        bubbleLevel: 0.2,
        history: [],
        likes: new Set(),
        downvoted: new Set(),
        shared: new Set(),
        blocked: new Set()
    }
};

let activeUserId = 'user-a';
let compareMode = false;
let selectedAlgorithm = 'content-based';
let algorithmStrength = 0.5;
let allCachedArticles = [];

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadStateFromLocalStorage();
    updateUIWidgets();
    fetchAndRender();
});

// Сохранение состояния в LocalStorage
function saveStateToLocalStorage() {
    const serializedUsers = {};
    for (const key in users) {
        const u = users[key];
        serializedUsers[key] = {
            name: u.name,
            interests: u.interests,
            leaning: u.leaning,
            bubbleLevel: u.bubbleLevel,
            history: u.history,
            likes: Array.from(u.likes),
            downvoted: Array.from(u.downvoted),
            shared: Array.from(u.shared),
            blocked: Array.from(u.blocked)
        };
    }
    
    localStorage.setItem('reddit_bubble_users', JSON.stringify(serializedUsers));
    localStorage.setItem('reddit_bubble_active_user', activeUserId);
    localStorage.setItem('reddit_bubble_compare_mode', JSON.stringify(compareMode));
    localStorage.setItem('reddit_bubble_selected_algo', selectedAlgorithm);
    localStorage.setItem('reddit_bubble_strength', JSON.stringify(algorithmStrength));
}

function loadStateFromLocalStorage() {
    if (!localStorage.getItem('reddit_bubble_posts')) {
        localStorage.setItem('reddit_bubble_posts', JSON.stringify(window.INITIAL_POSTS || []));
    }
    allCachedArticles = JSON.parse(localStorage.getItem('reddit_bubble_posts')) || [];

    const savedUsers = localStorage.getItem('reddit_bubble_users');
    if (savedUsers) {
        try {
            const parsed = JSON.parse(savedUsers);
            for (const key in parsed) {
                if (users[key]) {
                    users[key].interests = parsed[key].interests;
                    users[key].leaning = parsed[key].leaning;
                    users[key].bubbleLevel = parsed[key].bubbleLevel;
                    users[key].history = parsed[key].history || [];
                    users[key].likes = new Set(parsed[key].likes || []);
                    users[key].downvoted = new Set(parsed[key].downvoted || []);
                    users[key].shared = new Set(parsed[key].shared || []);
                    users[key].blocked = new Set(parsed[key].blocked || []);
                }
            }
            addLog(`[SYSTEM] Загружен сохраненный профиль из localStorage.`, 'info');
        } catch (e) {
            console.error("Ошибка парсинга пользователей из localStorage:", e);
            resetUserProfilesToDefault();
        }
    } else {
        resetUserProfilesToDefault();
    }

    const savedActive = localStorage.getItem('reddit_bubble_active_user');
    if (savedActive) activeUserId = savedActive;

    const savedCompare = localStorage.getItem('reddit_bubble_compare_mode');
    if (savedCompare !== null) {
        compareMode = JSON.parse(savedCompare);
        document.getElementById('toggle-compare-mode').checked = compareMode;
        
        const singleFeed = document.getElementById('single-feed');
        const compareFeed = document.getElementById('compare-feed');
        const userSelector = document.querySelector('.user-selector-container');
        
        if (compareMode) {
            singleFeed.classList.add('hidden');
            compareFeed.classList.remove('hidden');
            userSelector.style.opacity = '0.5';
            userSelector.style.pointerEvents = 'none';
        } else {
            singleFeed.classList.remove('hidden');
            compareFeed.classList.add('hidden');
            userSelector.style.opacity = '1';
            userSelector.style.pointerEvents = 'all';
        }
    }

    const savedAlgo = localStorage.getItem('reddit_bubble_selected_algo');
    if (savedAlgo) {
        selectedAlgorithm = savedAlgo;
        const radio = document.querySelector(`input[name="recommendation-algorithm"][value="${savedAlgo}"]`);
        if (radio) radio.checked = true;
    }

    const savedStrength = localStorage.getItem('reddit_bubble_strength');
    if (savedStrength !== null) {
        algorithmStrength = JSON.parse(savedStrength);
        document.getElementById('algorithm-strength').value = Math.round(algorithmStrength * 100);
        document.getElementById('strength-val').innerText = `${Math.round(algorithmStrength * 100)}%`;
    }
}

// Сброс профилей к полярным пресетам
function resetUserProfilesToDefault() {
    users['user-a'].interests = {
        'democrats': 0.6,
        'republicans': 0.1,
        'independent': 0.3
    };
    users['user-a'].leaning = -0.6;
    users['user-a'].likes.clear();
    users['user-a'].downvoted.clear();
    users['user-a'].shared.clear();
    users['user-a'].blocked.clear();
    users['user-a'].history = [];
    calculateBubbleLevel('user-a');

    users['user-b'].interests = {
        'democrats': 0.1,
        'republicans': 0.6,
        'independent': 0.3
    };
    users['user-b'].leaning = 0.6;
    users['user-b'].likes.clear();
    users['user-b'].downvoted.clear();
    users['user-b'].shared.clear();
    users['user-b'].blocked.clear();
    users['user-b'].history = [];
    calculateBubbleLevel('user-b');
    
    saveStateToLocalStorage();
    addLog(`[SYSTEM] Профили пользователей инициализированы. Пользователь А: Демократ/Либерал. Пользователь Б: Республиканец/Консерватор.`, 'info');
}

// Регистрация обработчиков событий
function initEventListeners() {
    // Вкладки переключения пользователей
    document.getElementById('btn-user-a').addEventListener('click', () => switchActiveUser('user-a'));
    document.getElementById('btn-user-b').addEventListener('click', () => switchActiveUser('user-b'));
    
    // Сброс интересов
    document.getElementById('reset-interests-btn').addEventListener('click', () => {
        resetActiveUserInterests();
        addLog(`[PROFILE] Сброшены интересы для ${users[activeUserId].name}. Настройки сбалансированы.`, 'info');
    });

    // Кнопка лопания пузыря
    document.getElementById('burst-bubble-btn').addEventListener('click', () => {
        burstBubble(activeUserId);
    });

    // Перезапуск ленты
    document.getElementById('refresh-feed-btn').addEventListener('click', () => {
        fetchAndRender();
        addLog(`[FEED] Запрошено ручное обновление ленты.`, 'default');
    });

    // Ползунок силы алгоритма
    const strengthSlider = document.getElementById('algorithm-strength');
    strengthSlider.addEventListener('input', (e) => {
        algorithmStrength = parseInt(e.target.value) / 100;
        document.getElementById('strength-val').innerText = `${e.target.value}%`;
        calculateBubbleLevel('user-a');
        calculateBubbleLevel('user-b');
        updateUIWidgets();
        saveStateToLocalStorage();
    });
    strengthSlider.addEventListener('change', () => {
        fetchAndRender();
        addLog(`[ALGO] Изменена жесткость алгоритма фильтрации: ${(algorithmStrength * 100).toFixed(0)}%`, 'info');
    });

    // Радиокнопки алгоритмов
    const algoRadios = document.querySelectorAll('input[name="recommendation-algorithm"]');
    algoRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedAlgorithm = e.target.value;
            saveStateToLocalStorage();
            fetchAndRender();
            addLog(`[ALGO] Активирован алгоритм: "${e.target.parentNode.querySelector('.radio-label-title').innerText}"`, 'info');
        });
    });

    // Чекбокс режима сравнения
    document.getElementById('toggle-compare-mode').addEventListener('change', (e) => {
        compareMode = e.target.checked;
        saveStateToLocalStorage();
        
        const singleFeed = document.getElementById('single-feed');
        const compareFeed = document.getElementById('compare-feed');
        const userSelector = document.querySelector('.user-selector-container');
        
        if (compareMode) {
            singleFeed.classList.add('hidden');
            compareFeed.classList.remove('hidden');
            userSelector.style.opacity = '0.5';
            userSelector.style.pointerEvents = 'none';
            addLog(`[SIMULATION] Включен режим одновременного сравнения двух пользователей.`, 'success');
        } else {
            singleFeed.classList.remove('hidden');
            compareFeed.classList.add('hidden');
            userSelector.style.opacity = '1';
            userSelector.style.pointerEvents = 'all';
            addLog(`[SIMULATION] Выключен режим сравнения. Возврат к одиночному фиду.`, 'default');
        }
        fetchAndRender();
    });

    // Случайное событие
    document.getElementById('trigger-event-btn').addEventListener('click', triggerRandomEvent);
    
    // Закрытие модального окна
    document.getElementById('event-modal-close').addEventListener('click', () => {
        document.getElementById('event-modal').classList.add('hidden');
    });
    document.getElementById('event-modal-ok').addEventListener('click', () => {
        document.getElementById('event-modal').classList.add('hidden');
    });
}

// Добавление строк в терминал-логгер
function addLog(text, type = 'default') {
    const consoleLogs = document.getElementById('console-logs');
    if (!consoleLogs) return;

    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line text-${type}`;
    line.innerText = `[${time}] ${text}`;
    
    consoleLogs.appendChild(line);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// Переключение активного пользователя
function switchActiveUser(userId) {
    activeUserId = userId;
    saveStateToLocalStorage();
    
    document.getElementById('btn-user-a').classList.toggle('active', userId === 'user-a');
    document.getElementById('btn-user-b').classList.toggle('active', userId === 'user-b');
    
    document.getElementById('active-user-badge').innerText = users[userId].name;
    
    addLog(`[SYSTEM] Активный профиль переключен на: ${users[userId].name}`, 'default');
    
    updateUIWidgets();
    fetchAndRender();
}

// Нормализация весов интересов (чтобы сумма была = 1.0)
function normalizeInterests(interests) {
    const total = Object.values(interests).reduce((sum, val) => sum + val, 0);
    if (total === 0) {
        CATEGORIES.forEach(c => interests[c] = 1 / CATEGORIES.length);
        return;
    }
    for (const cat in interests) {
        interests[cat] = parseFloat((interests[cat] / total).toFixed(4));
    }
}

// Сброс интересов активного пользователя
function resetActiveUserInterests() {
    const user = users[activeUserId];
    CATEGORIES.forEach(c => {
        user.interests[c] = 1 / CATEGORIES.length;
    });
    user.leaning = 0.0;
    calculateBubbleLevel(activeUserId);
    saveStateToLocalStorage();
    updateUIWidgets();
    fetchAndRender();
}

// Вычисление уровня изоляции (Пузыря)
function calculateBubbleLevel(userId) {
    const user = users[userId];
    const uniformVal = 1 / CATEGORIES.length;
    let variance = 0;
    CATEGORIES.forEach(cat => {
        variance += Math.pow((user.interests[cat] || 0) - uniformVal, 2);
    });
    
    const maxVariance = Math.pow(1 - uniformVal, 2) + (CATEGORIES.length - 1) * Math.pow(0 - uniformVal, 2);
    const concentration = variance / maxVariance; // от 0 до 1
    const bias = Math.abs(user.leaning); // от 0 до 1

    const rawIndex = (concentration * 0.4) + (bias * 0.6);
    user.bubbleLevel = parseFloat((rawIndex * algorithmStrength).toFixed(4));
}

// Кнопка: Лопнуть пузырь!
function burstBubble(userId) {
    const user = users[userId];
    user.leaning = 0.0;
    
    CATEGORIES.forEach(c => {
        user.interests[c] = 1 / CATEGORIES.length;
    });
    user.likes.clear();
    user.downvoted.clear();
    user.shared.clear();
    user.blocked.clear();
    
    calculateBubbleLevel(userId);
    saveStateToLocalStorage();
    updateUIWidgets();
    fetchAndRender();
    addLog(`[BUBBLE BURST] Успешно! Информационный пузырь для ${user.name} разорван. Лента временно разблокирована и диверсифицирована.`, 'success');
}

// Обновление статистических виджетов на левой панели под активного пользователя
function updateUIWidgets() {
    const user = users[activeUserId];
    
    // 1. Обновление прогресс-баров тем
    const interestsList = document.getElementById('interests-progress-list');
    interestsList.innerHTML = '';
    
    const sortedCats = [...CATEGORIES].sort((a, b) => (user.interests[b] || 0) - (user.interests[a] || 0));
    
    sortedCats.forEach(cat => {
        const weight = user.interests[cat] || 0;
        const pct = (weight * 100).toFixed(0);
        
        const item = document.createElement('div');
        item.className = 'interest-item';
        item.innerHTML = `
            <div class="interest-item-header">
                <span class="interest-label">${CATEGORY_NAMES_RU[cat] || cat}</span>
                <span class="interest-pct">${pct}%</span>
            </div>
            <div class="interest-bar-bg">
                <div class="interest-bar-fill" style="width: ${pct}%;"></div>
            </div>
        `;
        interestsList.appendChild(item);
    });

    // 2. Обновление спектра взглядов
    const marker = document.getElementById('spectrum-marker');
    const markerPos = ((user.leaning + 1) / 2) * 100;
    marker.style.left = `${markerPos}%`;
    document.getElementById('leaning-val').innerText = user.leaning.toFixed(2);

    // 3. Обновление датчика пузыря (Circular Gauge)
    const bubblePct = Math.round(user.bubbleLevel * 100);
    document.getElementById('bubble-percentage').innerText = `${bubblePct}%`;
    
    let statusText = 'Разнообразно';
    let statusColor = '#60cdff'; // Синий
    
    if (bubblePct > 75) {
        statusText = 'Эхо-Камера 🚨';
        statusColor = '#ff3b30'; // Красный
    } else if (bubblePct > 45) {
        statusText = 'Узкий пузырь';
        statusColor = '#ff9500'; // Оранжевый
    } else if (bubblePct > 15) {
        statusText = 'Стабилизация';
        statusColor = '#ffcc00'; // Желтый
    }
    
    const statusLabel = document.getElementById('bubble-status');
    statusLabel.innerText = statusText;
    statusLabel.style.color = statusColor;
    
    const strokeDashoffset = 251.2 * (1 - user.bubbleLevel);
    const gaugeFill = document.getElementById('bubble-gauge-fill');
    gaugeFill.style.strokeDashoffset = strokeDashoffset;
    gaugeFill.style.stroke = statusColor;
}

// Запрос рекомендаций и рендеринг ленты
async function fetchAndRender() {
    if (compareMode) {
        const [feedA, feedB] = await Promise.all([
            fetchRecommendations('user-a'),
            fetchRecommendations('user-b')
        ]);
        renderArticlesList(feedA, 'articles-container-compare-a', 'user-a');
        renderArticlesList(feedB, 'articles-container-compare-b', 'user-b');
    } else {
        const feed = await fetchRecommendations(activeUserId);
        renderArticlesList(feed, `articles-container-a`, activeUserId);
    }
}

// Локальный планировщик рекомендаций
async function fetchRecommendations(userId) {
    const user = users[userId];
    
    // Подгрузка статей из кэша / localStorage
    if (!allCachedArticles || allCachedArticles.length === 0) {
        const stored = localStorage.getItem('reddit_bubble_posts');
        if (stored) {
            allCachedArticles = JSON.parse(stored);
        } else {
            allCachedArticles = window.INITIAL_POSTS || [];
            localStorage.setItem('reddit_bubble_posts', JSON.stringify(allCachedArticles));
        }
    }

    const scoredArticles = allCachedArticles.map(article => {
        let score = 0;

        // 1. Категориальное соответствие (интерес к теме)
        const catWeight = user.interests[article.category] || 0;
        const scoreCat = catWeight;

        // 2. Идеологическое соответствие (близость взглядов)
        const scoreLean = 1.0 - (Math.abs(article.leaning - user.leaning) / 2.0);

        // 3. Сенсационность / Кликбейт
        const scoreSens = article.sensationalism / 10.0;

        // Выбор формулы под алгоритм
        if (selectedAlgorithm === 'content-based') {
            score = (scoreCat * 0.6) + (scoreLean * 0.4);
        } 
        else if (selectedAlgorithm === 'engagement') {
            score = (scoreCat * 0.3) + (scoreLean * 0.2) + (scoreSens * 0.5);
        } 
        else if (selectedAlgorithm === 'radicalizer') {
            // Ведет к экстремальным взглядам в выбранную сторону (усиливает до -1.0 или 1.0)
            const targetLeaning = user.leaning >= 0 ? 1.0 : -1.0;
            const scoreRadicalLean = 1.0 - (Math.abs(article.leaning - targetLeaning) / 2.0);
            score = (scoreRadicalLean * 0.5) + (scoreSens * 0.5);
        } 
        else if (selectedAlgorithm === 'bubble-buster') {
            // Показывает противоположные взгляды и малопосещаемые категории
            const scoreOpposingLean = Math.abs(article.leaning - user.leaning) / 2.0;
            const scoreNegCat = 1.0 - scoreCat;
            score = (scoreOpposingLean * 0.7) + (scoreNegCat * 0.3);
        } 
        else {
            score = Math.random();
        }

        // Шум в зависимости от жесткости алгоритма
        const noise = Math.random();
        const finalScore = (score * algorithmStrength) + (noise * (1.0 - algorithmStrength));

        return {
            ...article,
            scores: {
                total: finalScore,
                categoryMatch: scoreCat,
                leaningMatch: scoreLean,
                sensationalismMatch: scoreSens
            }
        };
    });

    // Фильтрация заблокированных и сортировка
    const filtered = scoredArticles.filter(article => !user.blocked.has(article.id));
    filtered.sort((a, b) => b.scores.total - a.scores.total);

    return filtered.slice(0, 15);
}

// Отрисовка списка карточек новостей
function renderArticlesList(articles, containerId, userId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (articles.length === 0) {
        container.innerHTML = '<div class="loading-state">Нет подходящих новостей. Измените настройки алгоритма или лопните пузырь.</div>';
        return;
    }
    
    const user = users[userId];
    
    articles.forEach(article => {
        const isUpvoted = user.likes.has(article.id);
        const isDownvoted = user.downvoted.has(article.id);
        const isShared = user.shared.has(article.id);
        
        const card = document.createElement('article');
        card.className = `article-card ${user.history.includes(article.id) ? 'clicked' : ''}`;
        
        let leaningBadgeText = 'Посередине';
        let leaningClass = 'leaning-center';
        if (article.leaning < -0.25) {
            leaningBadgeText = 'Демократы';
            leaningClass = 'leaning-left'; // Blue in style.css
        } else if (article.leaning > 0.25) {
            leaningBadgeText = 'Республиканцы';
            leaningClass = 'leaning-right'; // Red in style.css
        }

        const sensHtml = article.sensationalism >= 7 ? 
            `<span class="flair-badge clickbait-flair">КЛИКБЕЙТ 🔥</span>` : '';

        const baseVotes = Math.abs(article.title.charCodeAt(0) * 13 + article.title.length * 3) % 400 + 45;
        const displayVotes = baseVotes + (isUpvoted ? 1 : isDownvoted ? -1 : 0);

        // Получение красивой метки категории на русском
        const categoryLabel = CATEGORY_NAMES_RU[article.category] || article.category;

        card.innerHTML = `
            <div class="vote-column">
                <button class="vote-btn up ${isUpvoted ? 'active' : ''}" data-action="upvote" title="Upvote">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 14h6v8h4v-8h6L12 4 4 14z"/>
                    </svg>
                </button>
                <span class="vote-score ${isUpvoted ? 'upvoted' : isDownvoted ? 'downvoted' : ''}">${displayVotes}</span>
                <button class="vote-btn down ${isDownvoted ? 'active' : ''}" data-action="downvote" title="Downvote">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 10h-6V2h-4v8H4l8 10 8-10z"/>
                    </svg>
                </button>
            </div>
            <div class="article-main">
                <div class="article-header-meta">
                    <span class="subreddit-name">r/${categoryLabel.toLowerCase()}</span>
                    <span class="meta-separator">•</span>
                    <span class="source-author">Опубликовал ${article.source.name}</span>
                    <span class="meta-separator">•</span>
                    <span class="post-time">${new Date(article.publishedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="flairs-row">
                    <span class="flair-badge ${leaningClass}">${leaningBadgeText}</span>
                    ${sensHtml}
                </div>
                <a href="${article.url}" target="_blank" class="article-title-link">${article.title}</a>
                <p class="article-desc">${article.description}</p>
                ${article.urlToImage ? `
                <div class="article-media-preview">
                    <img src="${article.urlToImage}" class="article-img" alt="${article.title}">
                </div>
                ` : ''}
                <div class="article-footer-actions">
                    <button class="article-action-btn" data-action="comment">
                        <svg class="action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>${baseVotes % 35 + 5} Обсуждение</span>
                    </button>
                    <button class="article-action-btn ${isShared ? 'shared' : ''}" data-action="share">
                        <svg class="action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                        <span>${isShared ? 'Поделились' : 'Поделиться'}</span>
                    </button>
                    <button class="article-action-btn" data-action="block">
                        <svg class="action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                        </svg>
                        <span>Скрыть</span>
                    </button>
                </div>
            </div>
        `;
        
        // Обработка клика по карточке
        card.querySelector('.article-title-link').addEventListener('click', (e) => {
            handleUserInteraction(userId, article, 'read');
            card.classList.add('clicked');
        });
        
        // Обработка кнопок на карточке
        card.querySelectorAll('.article-action-btn, .vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                handleUserInteraction(userId, article, action);
            });
        });
        
        container.appendChild(card);
    });
}

// Обработка взаимодействия пользователя с постом
function handleUserInteraction(userId, article, action) {
    const user = users[userId];
    
    if (action === 'read') {
        if (!user.history.includes(article.id)) {
            user.history.push(article.id);
            user.interests[article.category] = (user.interests[article.category] || 0) + 0.04;
            user.leaning = user.leaning + 0.08 * (article.leaning - user.leaning);
            addLog(`[ЧТЕНИЕ] ${user.name} открыл новость: "${article.title.substring(0, 35)}...". Взгляды сместились.`, 'default');
        }
    } 
    else if (action === 'upvote') {
        if (user.likes.has(article.id)) {
            user.likes.delete(article.id);
            user.interests[article.category] = Math.max(0.01, (user.interests[article.category] || 0) - 0.12);
            user.leaning = user.leaning - 0.15 * (article.leaning - user.leaning);
            addLog(`[VOTE] ${user.name} убрал апвоут с поста в категории ${CATEGORY_NAMES_RU[article.category]}.`, 'default');
        } else {
            user.likes.add(article.id);
            if (user.downvoted.has(article.id)) {
                user.downvoted.delete(article.id);
                user.interests[article.category] = (user.interests[article.category] || 0) + 0.12;
                user.leaning = user.leaning + 0.20 * (article.leaning - user.leaning);
            }
            user.interests[article.category] = (user.interests[article.category] || 0) + 0.12;
            user.leaning = user.leaning + 0.20 * (article.leaning - user.leaning);
            
            if (selectedAlgorithm === 'engagement' && article.sensationalism >= 7) {
                user.interests[article.category] += 0.08;
                addLog(`[MAX ENGAGEMENT] Апвоутнут кликбейт! Тема "${CATEGORY_NAMES_RU[article.category]}" педалируется алгоритмом.`, 'warning');
            }
            
            addLog(`[VOTE] ${user.name} апвоутнул пост: "${article.title.substring(0, 30)}...". Смещение к категории повышенное.`, 'success');
        }
    }
    else if (action === 'downvote') {
        if (user.downvoted.has(article.id)) {
            user.downvoted.delete(article.id);
            user.interests[article.category] = (user.interests[article.category] || 0) + 0.12;
            user.leaning = user.leaning + 0.15 * (article.leaning - user.leaning);
            addLog(`[VOTE] ${user.name} убрал даунвоут с поста в ${CATEGORY_NAMES_RU[article.category]}.`, 'default');
        } else {
            user.downvoted.add(article.id);
            if (user.likes.has(article.id)) {
                user.likes.delete(article.id);
                user.interests[article.category] = Math.max(0.01, (user.interests[article.category] || 0) - 0.12);
                user.leaning = user.leaning - 0.20 * (article.leaning - user.leaning);
            }
            
            user.interests[article.category] = Math.max(0.01, (user.interests[article.category] || 0) - 0.12);
            user.leaning = user.leaning - 0.20 * (article.leaning - user.leaning);
            
            addLog(`[VOTE] ${user.name} даунвоутнул пост: "${article.title.substring(0, 30)}...". Тема пессимизирована.`, 'warning');
        }
    }
    else if (action === 'comment') {
        addLog(`[COMMUNITY] Открыто обсуждение поста "${article.title.substring(0, 30)}...". В комментариях идут политические споры.`, 'default');
    }
    else if (action === 'share') {
        if (user.shared.has(article.id)) {
            user.shared.delete(article.id);
            user.interests[article.category] = Math.max(0.01, (user.interests[article.category] || 0) - 0.20);
            user.leaning = user.leaning - 0.25 * (article.leaning - user.leaning);
        } else {
            user.shared.add(article.id);
            user.interests[article.category] = (user.interests[article.category] || 0) + 0.22;
            user.leaning = user.leaning + 0.35 * (article.leaning - user.leaning);
            addLog(`[SHARE] ${user.name} поделился материалом! Максимальный приоритет для темы.`, 'info');
        }
    } 
    else if (action === 'block') {
        user.blocked.add(article.id);
        user.interests[article.category] = Math.max(0.01, (user.interests[article.category] || 0) - 0.15);
        user.leaning = user.leaning - 0.20 * (article.leaning - user.leaning);
        addLog(`[BLOCK] ${user.name} скрыл новость. Источник будет реже появляться в ленте.`, 'warning');
    }
    
    user.leaning = Math.max(-1.0, Math.min(1.0, user.leaning));
    
    normalizeInterests(user.interests);
    calculateBubbleLevel(userId);
    saveStateToLocalStorage();
    
    updateUIWidgets();
    fetchAndRender();
}

// Глобальные события (политическая тематика США)
const RANDOM_EVENTS = [
    {
        title: "Борьба за федеральный бюджет и налоги",
        description: "Конгресс обсуждает новый законопроект об увеличении налогов на сверхприбыли крупных корпораций для финансирования зеленых субсидий и бесплатного образования.",
        skeptic: "Демократы: Богатые должны платить справедливые налоги! Это поможет спасти климат и поддержать рабочие семьи.",
        optimist: "Республиканцы: Это убьет экономический рост! Налоги на бизнес приведут к закрытию заводов и потере рабочих мест."
    },
    {
        title: "Историческое решение Верховного суда США",
        description: "Верховный суд США вынес решение, возвращающее штатам полное право самостоятельно регулировать экологические нормативы и правила добычи ресурсов.",
        skeptic: "Демократы: Катастрофа для борьбы с потеплением! Отсутствие единого федерального контроля приведет к загрязнению регионов.",
        optimist: "Республиканцы: Триумф Конституции и прав штатов! Ограничение власти федералов спасет фермеров и энергетику."
    },
    {
        title: "Законопроект об изменении избирательной системы",
        description: "Группа независимых конгрессменов предложила ввести ранжированное голосование (ranked-choice) на выборах Президента для ослабления партийной монополии.",
        skeptic: "Демократы: Это создаст хаос среди избирателей и может невольно помочь правым радикалам пройти в парламент.",
        optimist: "Республиканцы: Очередная попытка манипулировать процедурами выборов вместо честной политической конкуренции."
    }
];

function triggerRandomEvent() {
    const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    
    document.getElementById('event-title').innerText = `⚡ Событие: ${event.title}`;
    document.getElementById('event-description').innerText = event.description;
    
    document.getElementById('reaction-skeptic').innerText = event.skeptic;
    document.getElementById('reaction-optimist').innerText = event.optimist;
    
    document.getElementById('event-modal').classList.remove('hidden');
    
    addLog(`[EVENT] Событие: "${event.title}". Полярные лагери видят его совершенно по-разному.`, 'warning');
}
