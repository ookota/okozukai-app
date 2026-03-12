// 状態管理
let currentUser = localStorage.getItem('last_user') || 'masamune';
let isSyncedWithGAS = false; // GASとの初回同期が完了したか

// Google Apps Script の Web アプリ URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycby0DrjL0h0pcXNPh9xsEOHOEvy5zEgiy6shc2ZjFCaClU29B0v7PCSBW5lxm5y6KrU/exec';

// 初期設定（ベースとなる項目）
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

// 全ユーザーおよび家族共通データの管理
let allUsersData = {
    sharedHelpMaster: JSON.parse(JSON.stringify(defaultHelpMaster))
};

let userData = {
    balance: 0,
    history: [],
    goalName: '',
    goalAmount: 1000,
    goalDate: '',
    goalReached: false,
    pendingAmount: 0
};

// 音の管理
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
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
    playFanfare() {
        const notes = [523.25, 659.25, 783.99, 1046.50];
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

let currentInputValue = 0;
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

const numpadModal = document.getElementById('numpad-modal');
const helpModal = document.getElementById('help-modal');
const settingsModal = document.getElementById('settings-modal');
const keyboardInput = document.getElementById('keyboard-input');
const helpOptionsContainer = document.getElementById('help-options');
const settingsListContainer = document.getElementById('settings-list');
const adjustBalanceInput = document.getElementById('adjust-balance-input');
const modalTitle = document.getElementById('modal-title');
const goalDateInput = document.getElementById('goal-target-date');
const dailyAmountDisplay = document.getElementById('daily-amount');
const dailyPlanArea = document.getElementById('daily-plan');

/**
 * 画面（モーダル）の切り替えを行う共通関数
 */
function showPage(pageId) {
    const modals = [helpModal, numpadModal, settingsModal];
    modals.forEach(m => { if (m) m.classList.add('hidden'); });
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.remove('hidden');
    }
}

async function init() {
    // まずローカルデータを「仮」で読み込み、すぐに画面を出す（体感速度のため）
    loadFromLocalStorage();
    applyTheme();
    updateUI();

    // 次にGASから最新データを取得（これが「本物」のデータ）
    await loadAllData();

    // 同期完了フラグを立てる（これ以降 saveAllData がGASに書き込めるようになる）
    isSyncedWithGAS = true;

    setInterval(loadAllData, 30000); // 30秒ごとに自動同期
    initEventListeners();
}

function initEventListeners() {
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
        'btn-claim-money': claimPendingAmount,
        'btn-add-item': addNewHelpItem
    };

    for (const [id, handler] of Object.entries(clickEvents)) {
        const el = document.getElementById(id);
        if (el) el.onclick = () => handler();
    }

    goalNameInput.oninput = (e) => { userData.goalName = e.target.value; saveAllData(); };
    goalAmountInput.oninput = (e) => { userData.goalAmount = parseInt(e.target.value) || 0; saveAllData(); updateUI(); };
    goalDateInput.oninput = (e) => { userData.goalDate = e.target.value; saveAllData(); updateUI(); };
    keyboardInput.onkeypress = (e) => { if (e.key === 'Enter') confirmInput(); };
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('all_users_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                allUsersData = parsed;
            }
            if (!allUsersData.sharedHelpMaster) {
                allUsersData.sharedHelpMaster = JSON.parse(JSON.stringify(defaultHelpMaster));
            }
            expandCurrentUserData();
        } catch (e) {
            console.error('LocalStorage parse error', e);
            // 壊れている場合は初期化
            allUsersData = { sharedHelpMaster: JSON.parse(JSON.stringify(defaultHelpMaster)) };
            expandCurrentUserData();
        }
    }
}

async function loadAllData() {
    if (!GAS_URL || GAS_URL.includes('貼り付けてください')) return;
    try {
        console.log('Starting GAS fetch from:', GAS_URL);
        const response = await fetch(GAS_URL);
        if (!response.ok) {
            alert('GAS読み込み失敗: ' + response.status + ' ' + response.statusText);
            throw new Error('Fetch failed');
        }
        const data = await response.json();
        console.log('GAS data received:', data);
        if (data && Object.keys(data).length > 0) {
            // GASからデータが取得できたら、それを最優先する
            allUsersData = data;
            if (!allUsersData.sharedHelpMaster) {
                allUsersData.sharedHelpMaster = JSON.parse(JSON.stringify(defaultHelpMaster));
            }
            localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
            expandCurrentUserData();
            updateUI();
        }
    } catch (e) {
        console.warn('Sync failed (offline?):', e);
        // デバッグ用一時コード
        if (e.message.includes('Failed to fetch')) {
            alert('GAS通信エラー（CORSまたはURL間違い）が発生しました。\nURL: ' + GAS_URL + '\nエラー内容: ' + e.message);
        } else {
            alert('GASデータ取得中にエラーが発生しました: ' + e.message);
        }

        // 初回ロード時でGASに繋がらなかった場合は、LocalStorageの値をそのまま使う
        if (!isSyncedWithGAS) {
            loadFromLocalStorage();
            updateUI();
        }
    }
}

function expandCurrentUserData() {
    const userKey = `user_data_${currentUser}`;
    const defaultData = {
        balance: 0,
        history: [],
        goalName: '',
        goalAmount: 1000,
        goalDate: '',
        goalReached: false,
        pendingAmount: 0
    };

    if (allUsersData[userKey]) {
        // 保存されているデータとデフォルト値をマージして、プロパティの欠落を防ぐ
        userData = Object.assign({}, defaultData, allUsersData[userKey]);
        // historyが壊れている場合の保護
        if (!Array.isArray(userData.history)) {
            userData.history = [];
        }
    } else {
        userData = defaultData;
    }
}

async function saveAllData() {
    const userKey = `user_data_${currentUser}`;
    allUsersData[userKey] = userData;
    localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
    localStorage.setItem('last_user', currentUser);

    // まだ一度もGASと同期できていない（＝古いローカルデータかもしれない）場合は、
    // GAS側を上書きしないように送信をブロックする
    if (!isSyncedWithGAS) {
        console.log('Skipping sync to GAS: initial sync not complete.');
        return;
    }

    if (!GAS_URL || GAS_URL.includes('貼り付けてください')) return;
    try {
        console.log('Sending data to GAS...');
        const response = await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify(allUsersData),
            mode: 'no-cors' // GASのPOSTはレスポンスが不透明なためno-corsが必要な場合がある
        });
        // no-cors の場合、response.ok は常に false (status 0) になるため、
        // 成功したかどうかはスプレッドシート側で確認する必要があります。
        console.log('GAS POST attempted', response);
        localStorage.removeItem('pending_sync');
    } catch (e) {
        console.error('GAS POST failed:', e);
        alert('GASへの送信に失敗しました: ' + e.message);
        localStorage.setItem('pending_sync', 'true');
    }
}

function openHelpModal() {
    if (!helpOptionsContainer) return;
    helpOptionsContainer.innerHTML = '';
    allUsersData.sharedHelpMaster.forEach(task => {
        const btn = document.createElement('button');
        btn.className = `help-opt-btn ${task.special ? 'special' : ''}`;
        btn.innerHTML = `${task.icon} ${task.name}<br><small>${task.price}円</small>`;
        btn.onclick = () => { closeModals(); confirmDeposit(task.price, task.name); };
        helpOptionsContainer.appendChild(btn);
    });
    showPage('help-modal');
}

function openSettingsModal() {
    const pw = prompt('パスワード（共通：1234）');
    if (pw !== '1234') return alert('パスワードがちがうよ！');
    if (!adjustBalanceInput || !settingsListContainer) return;

    adjustBalanceInput.value = userData.balance;
    settingsListContainer.innerHTML = '';
    allUsersData.sharedHelpMaster.forEach(task => {
        const div = document.createElement('div');
        div.className = 'settings-item';
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:5px;border-bottom:1px solid #eee;';
        div.innerHTML = `
            <span>${task.icon} ${task.name}</span>
            <div>
                <input type="number" value="${task.price}" data-id="${task.id}" style="width:60px;"> 円
                <button style="padding:2px 5px;margin-left:5px;" onclick="deleteHelpItem('${task.id}')">×</button>
            </div>
        `;
        settingsListContainer.appendChild(div);
    });
    showPage('settings-modal');
}

function addNewHelpItem() {
    const name = document.getElementById('new-item-name').value;
    const price = parseInt(document.getElementById('new-item-price').value);
    const icon = document.getElementById('new-item-icon').value || '✨';
    if (!name || isNaN(price)) return alert('名前と金額を入れてね');

    allUsersData.sharedHelpMaster.push({ id: 'custom_' + Date.now(), name, price, icon });
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-price').value = '';
    document.getElementById('new-item-icon').value = '';
    openSettingsModal(); // 再描画
}

/** 削除機能はグローバル関数として定義 */
window.deleteHelpItem = function (id) {
    if (!confirm('これを消してもいいですか？')) return;
    allUsersData.sharedHelpMaster = allUsersData.sharedHelpMaster.filter(t => t.id !== id);
    openSettingsModal(); // 再描画
};

function saveSettings() {
    const inputs = settingsListContainer.querySelectorAll('input[data-id]');
    inputs.forEach(input => {
        const id = input.getAttribute('data-id');
        const task = allUsersData.sharedHelpMaster.find(t => t.id === id);
        if (task) task.price = parseInt(input.value) || 0;
    });
    saveAllData();
    closeModals();
}

function applyBalanceAdjustment() {
    const newVal = parseInt(adjustBalanceInput.value);
    if (!isNaN(newVal)) {
        userData.balance = newVal;
        userData.history.push({ type: 'adjust', amount: newVal, reason: '設定での調整', date: getTodayStr() });
        saveAllData();
        updateUI();
        alert('残高を書きかえました！');
    }
}

function openNumpadModal(mode) {
    inputMode = mode;
    currentInputValue = 0;
    keyboardInput.value = '';

    if (mode === 'deposit') {
        modalTitle.textContent = 'はいったお金';
    } else if (mode === 'withdraw') {
        modalTitle.textContent = 'つかったお金';
    } else if (mode === 'adjust') {
        modalTitle.textContent = 'のこりの お金をしゅうせい';
        keyboardInput.value = userData.balance;
    }

    showPage('numpad-modal');
    setTimeout(() => {
        keyboardInput.focus();
        keyboardInput.select();
    }, 100);
}

function closeModals() {
    [helpModal, numpadModal, settingsModal].forEach(m => { if (m) m.classList.add('hidden'); });
}

function confirmInput() {
    const amount = parseInt(keyboardInput.value);
    if (isNaN(amount) || amount <= 0) return;
    if (inputMode === 'withdraw' && userData.balance < amount) return alert('お金がたりないよ！');

    if (inputMode === 'deposit') confirmDeposit(amount, 'そのた');
    else if (inputMode === 'withdraw') {
        userData.balance -= amount;
        addHistoryRecord('withdraw', amount, 'つかった');
        updateUI(); closeModals();
    } else if (inputMode === 'adjust') {
        userData.balance = amount;
        addHistoryRecord('adjust', amount, 'て入力修正');
        updateUI(); closeModals();
    }
}

function confirmDeposit(amount, reason) {
    userData.pendingAmount = (userData.pendingAmount || 0) + amount;
    soundManager.playCoin();
    playSpecialEffect(reason === '英語テスト合格' ? '🎉合格おめでとう！🎉' : (currentUser === 'masamune' ? '出発進行！🚃' : 'レベルアップ！⭐'));
    saveAllData(); updateUI(); closeModals();
}

function claimPendingAmount() {
    if (!userData.pendingAmount) return alert('まだお金がないよ！');
    const amount = userData.pendingAmount;
    userData.balance += amount; userData.pendingAmount = 0;
    addHistoryRecord('deposit', amount, 'お手伝いでもらった');
    playSpecialEffect('💰 お金をもらった！ 💰');
    updateUI();
}

function deleteHistoryItem(index) {
    if (!confirm('消してもいいですか？')) return;
    const item = userData.history[index];
    if (['deposit', 'adjust'].includes(item.type)) userData.balance -= item.amount;
    else if (item.type === 'withdraw') userData.balance += item.amount;
    userData.history.splice(index, 1);
    saveAllData(); updateUI();
}

function addHistoryRecord(type, amount, reason) {
    userData.history.push({ type, amount, reason, date: getTodayStr() });
    saveAllData();
}

function getTodayStr() {
    const now = new Date(); return `${now.getMonth() + 1}/${now.getDate()}`;
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

function switchUser(user) {
    if (currentUser === user) return;
    currentUser = user;
    loadAllData(); applyTheme(); updateUI();
}

function applyTheme() {
    try {
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
            withdrawBtn.querySelector('.icon').textContent = '薬'; // '薬' label if icon missing
            withdrawBtn.querySelector('.icon').textContent = '💊';
            withdrawBtn.querySelector('.label').innerHTML = 'つかった<br>お金';
        }
        goalNameInput.value = userData.goalName || '';
        goalAmountInput.value = userData.goalAmount || 1000;
        goalDateInput.value = userData.goalDate || '';
        updateBackground();
    } catch (e) {
        console.error('Apply theme error', e);
    }
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

function updateUI() {
    try {
        const balance = Number(userData.balance) || 0;
        const goalAmount = Number(userData.goalAmount) || 1000;
        const pending = Number(userData.pendingAmount) || 0;
        balanceAmount.textContent = balance.toLocaleString();
        remainingDisplay.textContent = Math.max(0, goalAmount - balance).toLocaleString();
        goalLabelEnd.textContent = goalAmount.toLocaleString() + '円';
        const pendingEl = document.getElementById('pending-amount');
        if (pendingEl) pendingEl.textContent = pending.toLocaleString();
        historyList.innerHTML = '';
        const history = Array.isArray(userData.history) ? userData.history : [];
        history.slice(-10).reverse().forEach((item, index) => {
            const actualIndex = history.length - 1 - index;
            const li = document.createElement('li');
            li.className = `history-item ${item.type === 'withdraw' ? 'minus' : 'plus'}`;
            li.innerHTML = `
                <div class="history-content">
                    <span>${item.date || ''} ${item.reason || ''}</span>
                    <span>${item.type === 'withdraw' ? '-' : '+'}${(item.amount || 0).toLocaleString()}円</span>
                </div>
                <button class="btn-delete" onclick="deleteHistoryItem(${actualIndex})">×</button>
            `;
            historyList.appendChild(li);
        });
        calculateDailyPlan(); updateProgress(); checkGoalReached();
    } catch (e) {
        console.error('UI update error', e);
    }
}

function calculateDailyPlan() {
    if (!userData.goalDate || userData.balance >= userData.goalAmount) { dailyPlanArea.style.display = 'none'; return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const targetDate = new Date(userData.goalDate); targetDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    dailyAmountDisplay.textContent = daysDiff <= 0 ? '-' : Math.ceil((userData.goalAmount - userData.balance) / daysDiff).toLocaleString();
    dailyPlanArea.style.display = 'block';
}

function checkGoalReached() {
    if (userData.balance >= userData.goalAmount && userData.goalAmount > 0) {
        document.getElementById('goal-container').classList.add('goal-reached');
        if (!userData.goalReached) {
            userData.goalReached = true; soundManager.playFanfare();
            playSpecialEffect('🎉 おめでとう！ 🎉'); saveAllData();
        }
    } else {
        document.getElementById('goal-container').classList.remove('goal-reached');
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

window.onresize = updateBackground;
window.onload = init;
window.ononline = () => { if (localStorage.getItem('pending_sync')) saveAllData(); };
