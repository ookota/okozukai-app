// --- 調査用コード 開始 ---
(function () {
    const debugArea = document.createElement('div');
    debugArea.id = 'debug-log-area';
    debugArea.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.8);color:#0f0;font-family:monospace;font-size:12px;z-index:9999;padding:5px;pointer-events:none;border-top:1px solid #0f0;';
    document.body.appendChild(debugArea);

    window.logToScreen = function (msg) {
        const line = document.createElement('div');
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        debugArea.appendChild(line);
        debugArea.scrollTop = debugArea.scrollHeight;
        console.log(msg);
    };

    window.onerror = function (msg, url, lineNo, columnNo, error) {
        window.logToScreen(`❌ エラー発生: ${msg} (行:${lineNo} 列:${columnNo})`);
        return false;
    };

    // ボタンクリックの監視
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('button');
        if (btn) {
            window.logToScreen(`👆 クリックされました: ${btn.id || btn.className || 'ボタン'}`);
        }
    }, true);

    window.logToScreen('🚀 調査用コード 読み込み完了');
})();
// --- 調査用コード 終了 ---

// 状態管理
let currentUser = localStorage.getItem('last_user') || 'masamune';

// Google Apps Script の Web アプリ URL (デプロイ後にここに貼り付けてください)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzjqvg3Oa7n10aFQQQ3bpNC5wkVO1ESwCfuf0Qlte9pu68_dD5lO-fILEhwUL2yN_Q9/exec';

// ユーザーごとの初期設定
const defaultHelpMaster = [
    { id: 'bath', name: '風呂洗い', price: 10, icon: '🛁' },
    { id: 'bed', name: '布団たたみ', price: 10, icon: '🛌' },
    { id: 'laundry_fold', name: '洗濯たたみ', price: 10, icon: '🧺' },
    { id: 'laundry_store', name: '洗濯しまい', price: 10, icon: '👕' },
    { id: 'laundry_carry', name: '洗濯運び', price: 10, icon: '🏠' },
    { id: 'dishes', name: 'お皿洗い', price: 10, icon: '🍽️' },
    { id: 'socks', name: '靴下洗い', price: 10, icon: '🧦' },
    { id: 'garbage', name: 'ごみ捨て', price: 10, icon: '🗑️' },
    { id: 'cooking', name: 'ご飯作り', price: 10, icon: '🍳' },
    { id: 'english', name: '英語テスト合格', price: 500, icon: '🏫', special: true }
];

// 全ユーザーのデータを管理(サーバー同期用)
let allUsersData = {};

let userData = {
    balance: 0,
    history: [],
    goalName: '',
    goalAmount: 1000,
    goalDate: '', // 新規：目標日
    helpMaster: JSON.parse(JSON.stringify(defaultHelpMaster)),
    goalReached: false,
    pendingAmount: 0 // 追加：もらう予定
};

// 音の管理
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // チャリン（入金音）
    playCoin() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    // ファンファーレ（目標達成音）
    playFanfare() {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.15);
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.15 + 0.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(this.ctx.currentTime + i * 0.15);
            osc.stop(this.ctx.currentTime + i * 0.15 + 0.4);
        });
    }
}
const soundManager = new SoundManager();

let currentInputValue = 0; // 金額管理を数値に変更
let inputMode = 'deposit';

// DOM要素
const balanceAmount = document.getElementById('total-amount');
const historyList = document.getElementById('history-list');
const progressCharacter = document.getElementById('progress-character');
const goalLabelEnd = document.getElementById('goal-label-end');
const remainingDisplay = document.getElementById('remaining-amount');
const goalNameInput = document.getElementById('goal-name');
const goalAmountInput = document.getElementById('goal-target-amount');
const displayUserName = document.getElementById('display-user-name');
const body = document.body;

// モーダル等
const numpadModal = document.getElementById('numpad-modal');
const helpModal = document.getElementById('help-modal');
const settingsModal = document.getElementById('settings-modal');
const keyboardInput = document.getElementById('keyboard-input'); // キーボード入力用
const helpOptionsContainer = document.getElementById('help-options');
const settingsListContainer = document.getElementById('settings-list');
const adjustBalanceInput = document.getElementById('adjust-balance-input');
const modalTitle = document.getElementById('modal-title');
const goalDateInput = document.getElementById('goal-target-date');
const dailyAmountDisplay = document.getElementById('daily-amount');
const dailyPlanArea = document.getElementById('daily-plan');

/**
 * 画面（モーダル）の切り替えを行う共通関数
 * @param {string} pageId - 表示したい要素のID
 */
function showPage(pageId) {
    window.logToScreen(`📺 Page切り替え: ${pageId}`);

    // 全てのモーダルを一旦隠す
    const modals = [helpModal, numpadModal, settingsModal];
    modals.forEach(m => {
        if (m) m.classList.add('hidden');
    });

    // 指定されたIDを表示する
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.remove('hidden');
        window.logToScreen(`✅ ${pageId} を表示しました`);
    } else {
        window.logToScreen(`⚠️ ${pageId} が見つかりませんでした`);
    }
}

async function init() {
    window.logToScreen('⚙️ init() 開始');
    loadFromLocalStorage(); // まずローカルデータを読み込んでUIを反応させる
    applyTheme();
    updateUI();

    // バックグラウンドでGASと同期（awaitしない）
    loadAllData();

    // 定期的な同期（30秒ごと）
    setInterval(loadAllData, 30000);

    // イベントリスナー（安全な初期化）
    initEventListeners();

    window.logToScreen('✅ 初期化完了');
}

function initEventListeners() {
    window.logToScreen('👂 イベントリスナー登録開始');

    const clickEvents = {
        'btn-train': () => switchUser('masamune'),
        'btn-pokemon': () => switchUser('momoyo'),
        'btn-deposit-menu': openHelpModal,
        'btn-withdraw': () => openNumpadModal('withdraw'),
        'btn-close-modal': closeModals,
        'btn-close-help': closeModals,
        'btn-help-other': () => openNumpadModal('deposit'),
        'btn-settings-toggle': openSettingsModal,
        'btn-save-settings': saveSettings,
        'btn-apply-balance': applyBalanceAdjustment,
        'btn-edit-balance': () => openNumpadModal('adjust'),
        'btn-confirm': confirmInput,
        'btn-claim-money': claimPendingAmount
    };

    for (const [id, handler] of Object.entries(clickEvents)) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => {
                window.logToScreen(`🖱️ Event: ${id}`);
                handler();
            });
        } else {
            window.logToScreen(`⚠️ Element not found: ${id}`);
        }
    }

    // 目標設定の入力系
    goalNameInput.addEventListener('input', (e) => {
        userData.goalName = e.target.value;
        saveAllData();
    });
    goalAmountInput.addEventListener('input', (e) => {
        userData.goalAmount = parseInt(e.target.value) || 0;
        saveAllData();
        updateUI();
    });
    goalDateInput.addEventListener('input', (e) => {
        userData.goalDate = e.target.value;
        saveAllData();
        updateUI();
    });

    // 入力決定（エンターキー対応）
    keyboardInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmInput();
    });
}

// LocalStorageからデータを読み込む
function loadFromLocalStorage() {
    window.logToScreen('💾 LocalStorage読み込み中...');
    const saved = localStorage.getItem('all_users_data');
    if (saved) {
        try {
            allUsersData = JSON.parse(saved);
            expandCurrentUserData();
            window.logToScreen('💾 ローカルデータ成功');
        } catch (e) {
            window.logToScreen('❌ LocalStorage parse error');
        }
    }
}

// データ読み込み（GAS同期）
async function loadAllData() {
    const placeholder = 'ここにコピーしたURLを貼り付けてください';
    if (!GAS_URL || GAS_URL === placeholder) return;

    try {
        window.logToScreen('☁️ GAS取得開始...');
        const response = await fetch(GAS_URL);
        if (!response.ok) throw new Error('GAS fetch failed');
        const data = await response.json();
        if (data && Object.keys(data).length > 0) {
            allUsersData = data;
            localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
            expandCurrentUserData();
            updateUI();
            window.logToScreen('☁️ GAS連携成功');
        }
    } catch (e) {
        window.logToScreen('⚠️ GAS同期なし (オフライン動作)');
    }
}

// データの展開
function expandCurrentUserData() {
    const userKey = `user_data_${currentUser}`;
    if (allUsersData[userKey]) {
        userData = allUsersData[userKey];
        if (!userData.helpMaster) userData.helpMaster = [];
        defaultHelpMaster.forEach(defItem => {
            const existing = userData.helpMaster.find(t => t.id === defItem.id);
            if (existing) {
                existing.name = defItem.name;
                existing.price = defItem.price;
                existing.icon = defItem.icon;
            } else {
                userData.helpMaster.push(JSON.parse(JSON.stringify(defItem)));
            }
        });
    } else {
        userData = {
            balance: 0,
            history: [],
            goalName: '',
            goalAmount: 1000,
            goalDate: '',
            helpMaster: JSON.parse(JSON.stringify(defaultHelpMaster)),
            goalReached: false,
            pendingAmount: 0
        };
    }
}

// データの保存
async function saveAllData() {
    const userKey = `user_data_${currentUser}`;
    allUsersData[userKey] = userData;
    localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
    localStorage.setItem('last_user', currentUser);

    if (!GAS_URL || GAS_URL.includes('貼り付けてください')) return;

    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(allUsersData)
        });
        localStorage.removeItem('pending_sync');
        window.logToScreen('☁️ 保存成功');
    } catch (e) {
        window.logToScreen('⚠️ 保存失敗 (要同期)');
        localStorage.setItem('pending_sync', 'true');
    }
}

// オンライン復帰
window.addEventListener('online', () => {
    window.logToScreen('🌐 通信復帰');
    if (localStorage.getItem('pending_sync')) saveAllData();
});

async function switchUser(user) {
    if (currentUser === user) return;
    window.logToScreen(`👤 ユーザー切替: ${user}`);
    currentUser = user;
    await loadAllData();
    applyTheme();
    updateUI();
}

function applyTheme() {
    const theme = currentUser === 'masamune' ? 'train' : 'pokemon';
    body.className = `theme-${theme}`;

    document.getElementById('btn-train').classList.toggle('active', currentUser === 'masamune');
    document.getElementById('btn-pokemon').classList.toggle('active', currentUser === 'momoyo');

    const depositBtn = document.getElementById('btn-deposit-menu');
    const withdrawBtn = document.getElementById('btn-withdraw');

    if (currentUser === 'masamune') {
        displayUserName.textContent = 'マサムネ駅';
        depositBtn.querySelector('.icon').textContent = '📗';
        depositBtn.querySelector('.label').innerHTML = 'お手伝い<br>内容';
        withdrawBtn.querySelector('.icon').textContent = '📕';
        withdrawBtn.querySelector('.label').innerHTML = 'つかった<br>お金';
    } else {
        displayUserName.textContent = 'モモヨのポケモンセンター';
        depositBtn.querySelector('.icon').textContent = '🔴';
        depositBtn.querySelector('.label').innerHTML = 'お手伝い<br>内容';
        withdrawBtn.querySelector('.icon').textContent = '💊';
        withdrawBtn.querySelector('.label').innerHTML = 'つかった<br>お金';
    }

    goalNameInput.value = userData.goalName;
    goalAmountInput.value = userData.goalAmount;
    goalDateInput.value = userData.goalDate || '';

    updateBackground();
}

function updateBackground() {
    const bgLayer = document.getElementById('bg-layer');
    if (!bgLayer) return;
    bgLayer.innerHTML = '';
    if (currentUser !== 'masamune') return;

    const images = ['pla_01.png', 'pla_02.png', 'pla_03.png', 'pla_04.png', 'pla_05.png', 'pla_06.png', 'pla_07.png', 'pla_08.png', 'pla_09.png', 'pla_10.png'];
    const tileSize = 80;
    const cols = Math.ceil(window.innerWidth / tileSize);
    const rows = Math.ceil(window.innerHeight / tileSize);
    for (let i = 0; i < cols * rows; i++) {
        const img = document.createElement('img');
        img.src = `画像/${images[Math.floor(Math.random() * images.length)]}`;
        img.className = 'pla-tile';
        bgLayer.appendChild(img);
    }
}

window.addEventListener('resize', updateBackground);

function updateUI() {
    const balance = Number(userData.balance) || 0;
    const goalAmount = Number(userData.goalAmount) || 1000;
    const pending = Number(userData.pendingAmount) || 0;

    balanceAmount.textContent = balance.toLocaleString();
    remainingDisplay.textContent = Math.max(0, goalAmount - balance).toLocaleString();
    goalLabelEnd.textContent = goalAmount.toLocaleString() + '円';

    const pendingEl = document.getElementById('pending-amount');
    if (pendingEl) pendingEl.textContent = pending.toLocaleString();

    historyList.innerHTML = '';
    userData.history.slice(-10).reverse().forEach((item, index) => {
        const actualIndex = userData.history.length - 1 - index;
        const li = document.createElement('li');
        li.className = `history-item ${item.type === 'withdraw' ? 'minus' : 'plus'}`;
        li.innerHTML = `
            <div class="history-content">
                <span>${item.date} ${item.reason || ''}</span>
                <span>${item.type === 'withdraw' ? '-' : '+'}${item.amount.toLocaleString()}円</span>
            </div>
            <button class="btn-delete" onclick="deleteHistoryItem(${actualIndex})">×</button>
        `;
        historyList.appendChild(li);
    });

    calculateDailyPlan();
    updateProgress();
    checkGoalReached();
}

function calculateDailyPlan() {
    if (!userData.goalDate || userData.balance >= userData.goalAmount) {
        dailyPlanArea.style.display = 'none';
        return;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const targetDate = new Date(userData.goalDate); targetDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

    if (daysDiff <= 0) {
        dailyAmountDisplay.textContent = '-';
    } else {
        dailyAmountDisplay.textContent = Math.ceil((userData.goalAmount - userData.balance) / daysDiff).toLocaleString();
    }
    dailyPlanArea.style.display = 'block';
}

function checkGoalReached() {
    const goalContainer = document.getElementById('goal-container');
    if (userData.balance >= userData.goalAmount && userData.goalAmount > 0) {
        goalContainer.classList.add('goal-reached');
        if (!userData.goalReached) {
            userData.goalReached = true;
            soundManager.playFanfare();
            playSpecialEffect('🎉 おめでとう！ 🎉');
            saveAllData();
        }
    } else {
        goalContainer.classList.remove('goal-reached');
        userData.goalReached = false;
    }
}

function updateProgress() {
    const progress = Math.min(100, (userData.balance / userData.goalAmount) * 100);
    if (progressCharacter) {
        progressCharacter.style.left = `${progress}%`;
        if (currentUser === 'masamune') progressCharacter.textContent = '🚃';
        else {
            if (progress < 25) progressCharacter.textContent = '🥚';
            else if (progress < 50) progressCharacter.textContent = '🐣';
            else if (progress < 75) progressCharacter.textContent = '🐭';
            else progressCharacter.textContent = '🔥';
        }
    }
}

function openNumpadModal(mode) {
    inputMode = mode;
    keyboardInput.value = '';
    const titles = { withdraw: 'つかったお金', deposit: 'はいったお金', adjust: '残高をなおす' };
    modalTitle.textContent = titles[mode] || 'しゅうせい';
    showPage('numpad-modal');
    setTimeout(() => keyboardInput.focus(), 100);
}

/**
 * お手伝いメニューを動的に生成して表示
 */
function openHelpModal() {
    window.logToScreen('📋 お手伝いメニューを生成中...');
    if (!helpOptionsContainer) return;

    helpOptionsContainer.innerHTML = '';
    userData.helpMaster.forEach(task => {
        const btn = document.createElement('button');
        btn.className = `help-opt-btn ${task.special ? 'special' : ''}`;
        btn.innerHTML = `${task.icon} ${task.name}<br><small>${task.price}円</small>`;
        btn.onclick = () => {
            window.logToScreen(`👆 選択: ${task.name}`);
            closeModals();
            confirmDeposit(task.price, task.name);
        };
        helpOptionsContainer.appendChild(btn);
    });
    showPage('help-modal');
}

/**
 * 設定メニュー（単価設定）を表示
 * ※簡単なパスワード保護を追加
 */
function openSettingsModal() {
    const pw = prompt('パスワードをいれてね（おうちの人用）');
    if (pw !== '1234') { // デフォルトパスワード
        alert('パスワードがちがうよ！');
        return;
    }

    if (!adjustBalanceInput || !settingsListContainer) return;

    adjustBalanceInput.value = userData.balance;
    settingsListContainer.innerHTML = '';
    userData.helpMaster.forEach(task => {
        const div = document.createElement('div');
        div.className = 'settings-item';
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:5px;border-bottom:1px solid #eee;';
        div.innerHTML = `
            <span>${task.icon} ${task.name}</span>
            <div>
                <input type="number" value="${task.price}" data-id="${task.id}" style="width:60px;padding:5px;border-radius:5px;border:1px solid #ccc;"> 円
            </div>
        `;
        settingsListContainer.appendChild(div);
    });
    showPage('settings-modal');
}

function applyBalanceAdjustment() {
    const newVal = parseInt(document.getElementById('adjust-balance-input').value);
    if (!isNaN(newVal)) {
        userData.balance = newVal;
        userData.history.push({ type: 'adjust', amount: newVal, reason: '設定での調整', date: getTodayStr() });
        saveAllData();
        updateUI();
        alert('残高を書きかえました！');
    }
}

function saveSettings() {
    const inputs = settingsListContainer.querySelectorAll('input');
    inputs.forEach(input => {
        const id = input.getAttribute('data-id');
        const task = userData.helpMaster.find(t => t.id === id);
        if (task) task.price = parseInt(input.value) || 0;
    });
    saveAllData();
    closeModals();
}

function closeModals() {
    window.logToScreen('🏠 モーダルを閉じます');
    [helpModal, numpadModal, settingsModal].forEach(m => m.classList.add('hidden'));
}

function confirmInput() {
    const amount = parseInt(keyboardInput.value);
    if (isNaN(amount) || amount <= 0) return;
    if (inputMode === 'withdraw' && userData.balance < amount) {
        alert('お金がたりないよ！');
        return;
    }

    if (inputMode === 'deposit') confirmDeposit(amount, 'そのた');
    else if (inputMode === 'withdraw') {
        userData.balance -= amount;
        addHistoryRecord('withdraw', amount, 'つかった');
        updateUI();
        closeModals();
    } else if (inputMode === 'adjust') {
        userData.balance = amount;
        addHistoryRecord('adjust', amount, 'て入力修正');
        updateUI();
        closeModals();
    }
}

function confirmDeposit(amount, reason) {
    userData.pendingAmount = (userData.pendingAmount || 0) + amount;
    soundManager.playCoin();
    playSpecialEffect(reason === '英語テスト合格' ? '🎉合格おめでとう！🎉' : (currentUser === 'masamune' ? '出発進行！🚃' : 'レベルアップ！⭐'));
    saveAllData();
    updateUI();
    closeModals();
}

function claimPendingAmount() {
    if (!userData.pendingAmount) return alert('まだお金がないよ！');
    const amount = userData.pendingAmount;
    userData.balance += amount;
    userData.pendingAmount = 0;
    addHistoryRecord('deposit', amount, 'お手伝いでもらった');
    playSpecialEffect('💰 お金をもらった！ 💰');
    updateUI();
}

function deleteHistoryItem(index) {
    if (!confirm('消してもいい？')) return;
    const item = userData.history[index];
    if (['deposit', 'adjust'].includes(item.type)) userData.balance -= item.amount;
    else if (item.type === 'withdraw') userData.balance += item.amount;
    userData.history.splice(index, 1);
    saveAllData();
    updateUI();
}

function addHistoryRecord(type, amount, reason) {
    userData.history.push({ type, amount, reason, date: getTodayStr() });
    saveAllData();
}

function getTodayStr() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}`;
}

function playSpecialEffect(text) {
    const overlay = document.createElement('div');
    overlay.className = 'effect-overlay animate-pop';
    overlay.textContent = text;
    document.body.appendChild(overlay);
    if (text.includes('🎉')) {
        document.body.classList.add('sparkle-bg');
        setTimeout(() => document.body.classList.remove('sparkle-bg'), 2000);
    }
    setTimeout(() => overlay.remove(), 2000);
}

window.addEventListener('DOMContentLoaded', init);
