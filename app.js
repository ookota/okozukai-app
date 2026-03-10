// 状態管理
let currentUser = localStorage.getItem('last_user') || 'masamune';

// Google Apps Script の Web アプリ URL (デプロイ後にここに貼り付けてください)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwQkLBkAR7-xtxrqBedmHY8WYZuoee92WF7i9kA18wL7qnOhEiovcF757OYOL9ruIK1/exec';

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

async function init() {
    await loadAllData();
    applyTheme();
    updateUI();

    // 定期的な同期（30秒ごと）
    setInterval(loadAllData, 30000);

    // イベントリスナー
    document.getElementById('btn-train').addEventListener('click', () => switchUser('masamune'));
    document.getElementById('btn-pokemon').addEventListener('click', () => switchUser('momoyo'));

    document.getElementById('btn-deposit-menu').addEventListener('click', openHelpModal);
    document.getElementById('btn-withdraw').addEventListener('click', () => openNumpadModal('withdraw'));
    document.getElementById('btn-close-modal').addEventListener('click', closeModals);
    document.getElementById('btn-close-help').addEventListener('click', closeModals);
    document.getElementById('btn-help-other').addEventListener('click', () => {
        closeModals();
        openNumpadModal('deposit');
    });

    document.getElementById('btn-settings-toggle').addEventListener('click', openSettingsModal);
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-apply-balance').addEventListener('click', applyBalanceAdjustment);
    document.getElementById('btn-edit-balance').addEventListener('click', () => openNumpadModal('adjust'));

    // 目標設定
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
    document.getElementById('btn-confirm').addEventListener('click', confirmInput);
    document.getElementById('btn-claim-money').addEventListener('click', claimPendingAmount);
}

// サーバーまたはLocalStorageから全データを読み込む
async function loadAllData() {
    // file:// プロトコル（サーバーなしで直接開いた場合）は、サーバー通信をスキップ
    if (window.location.protocol === 'file:') {
        console.warn('Running in file mode. Using LocalStorage.');
        const saved = localStorage.getItem('all_users_data');
        if (saved) {
            allUsersData = JSON.parse(saved);
        }
    } else if (GAS_URL && GAS_URL !== 'https://script.google.com/macros/s/AKfycbwQkLBkAR7-xtxrqBedmHY8WYZuoee92WF7i9kA18wL7qnOhEiovcF757OYOL9ruIK1/exec') {
        try {
            // GASからの読み込みを試行
            const response = await fetch(GAS_URL);
            if (response.ok) {
                allUsersData = await response.json();
                localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
                console.log('Loaded from Google Sheets');
            } else {
                throw new Error('GAS error');
            }
        } catch (e) {
            console.warn('GAS offline or error, using LocalStorage', e);
            const saved = localStorage.getItem('all_users_data');
            if (saved) {
                allUsersData = JSON.parse(saved);
            }
        }
    } else if (GAS_URL === 'https://script.google.com/macros/s/AKfycbwQkLBkAR7-xtxrqBedmHY8WYZuoee92WF7i9kA18wL7qnOhEiovcF757OYOL9ruIK1/exec') {
        // すでにURLが設定されている場合の読み込み
        try {
            const response = await fetch(GAS_URL);
            if (response.ok) {
                allUsersData = await response.json();
                localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
            }
        } catch (e) {
            console.warn('GAS fetch error', e);
            const saved = localStorage.getItem('all_users_data');
            if (saved) allUsersData = JSON.parse(saved);
        }
    } else {
        const saved = localStorage.getItem('all_users_data');
        if (saved) allUsersData = JSON.parse(saved);
    }

    // 現在のユーザーのデータを展開
    const userKey = `user_data_${currentUser}`;
    if (allUsersData[userKey]) {
        userData = allUsersData[userKey];
        // お手伝いマスタの強制同期：最新の定義（風呂洗い等）を必ず含める
        if (!userData.helpMaster) userData.helpMaster = [];
        defaultHelpMaster.forEach(defItem => {
            const existing = userData.helpMaster.find(t => t.id === defItem.id);
            if (existing) {
                // 名前・単価・アイコンを最新の定義に強制上書き
                existing.name = defItem.name;
                existing.price = defItem.price;
                existing.icon = defItem.icon;
            } else {
                // 新規項目を追加
                userData.helpMaster.push(JSON.parse(JSON.stringify(defItem)));
            }
        });
        // 定義にない古い項目を削除（必要に応じて）
        userData.helpMaster = userData.helpMaster.filter(item =>
            defaultHelpMaster.some(def => def.id === item.id)
        );
    } else {
        // ユーザーデータがない場合の初期化
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
    updateUI();
}

// サーバーとLocalStorageに全データを保存する
async function saveAllData() {
    const userKey = `user_data_${currentUser}`;
    allUsersData[userKey] = userData;

    // LocalStorageにまず保存
    localStorage.setItem('all_users_data', JSON.stringify(allUsersData));
    localStorage.setItem('last_user', currentUser);

    // file:// プロトコル または 一般的な静的ホスト
    const skipSync = (!GAS_URL || GAS_URL === 'ここにコピーしたURLを貼り付けてください');
    if (skipSync) return;

    try {
        // GASへの送信（POST）
        const response = await fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allUsersData)
        });

        // mode: 'no-cors' の場合 response.ok は false になるが送信は成功している
        localStorage.removeItem('pending_sync');
        console.log('Synced successfully to Google Sheets');
    } catch (e) {
        console.warn('Could not sync to Google Sheets, saving for later', e);
        localStorage.setItem('pending_sync', 'true');
    }
}

// オンライン復帰時に自動同期
window.addEventListener('online', () => {
    console.log('Online! Attempting sync...');
    if (localStorage.getItem('pending_sync')) {
        saveAllData();
    }
});

async function switchUser(user) {
    if (currentUser === user) return;
    currentUser = user;
    await loadAllData(); // データの切り替え完了を待機
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

    const images = [
        'pla_01.png', 'pla_02.png', 'pla_03.png', 'pla_04.png', 'pla_05.png',
        'pla_06.png', 'pla_07.png', 'pla_08.png', 'pla_09.png', 'pla_10.png'
    ];

    const tileSize = 80; // CSSと合わせる
    const cols = Math.ceil(window.innerWidth / tileSize);
    const rows = Math.ceil(window.innerHeight / tileSize);
    const totalTiles = cols * rows;

    for (let i = 0; i < totalTiles; i++) {
        const img = document.createElement('img');
        const randomImg = images[Math.floor(Math.random() * images.length)];
        img.src = `画像/${randomImg}`;
        img.className = 'pla-tile';
        bgLayer.appendChild(img);
    }
}

// 画面サイズ変更時にも再計算
window.addEventListener('resize', updateBackground);

function updateUI() {
    const balance = Number(userData.balance) || 0;
    const goalAmount = Number(userData.goalAmount) || 1000;
    const pending = Number(userData.pendingAmount) || 0;

    balanceAmount.textContent = balance.toLocaleString();
    const remaining = Math.max(0, goalAmount - balance);
    remainingDisplay.textContent = remaining.toLocaleString();
    goalLabelEnd.textContent = goalAmount.toLocaleString() + '円';

    // もらう予定
    const pendingEl = document.getElementById('pending-amount');
    if (pendingEl) pendingEl.textContent = pending.toLocaleString();

    historyList.innerHTML = '';
    userData.history.slice(-10).reverse().forEach((item, index) => {
        const actualIndex = userData.history.length - 1 - index;
        const li = document.createElement('li');
        li.className = `history-item ${item.type === 'withdraw' ? 'minus' : 'plus'}`;
        const reason = item.reason ? `(${item.reason})` : '';

        li.innerHTML = `
            <div class="history-content">
                <span>${item.date} ${reason}</span>
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(userData.goalDate);
    targetDate.setHours(0, 0, 0, 0);

    const timeDiff = targetDate.getTime() - today.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (daysDiff <= 0) {
        dailyAmountDisplay.textContent = '-';
        dailyPlanArea.style.display = 'block';
        return;
    }

    const remaining = userData.goalAmount - userData.balance;
    const dailyNeeded = Math.ceil(remaining / daysDiff);

    dailyAmountDisplay.textContent = dailyNeeded.toLocaleString();
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
    const balance = Number(userData.balance) || 0;
    const goal = Number(userData.goalAmount) || 1000;
    const progress = Math.min(100, (balance / goal) * 100);

    if (progressCharacter) {
        progressCharacter.style.left = `${progress}%`;

        if (currentUser === 'masamune') {
            progressCharacter.textContent = '🚃';
        } else {
            if (progress < 25) progressCharacter.textContent = '🥚';
            else if (progress < 50) progressCharacter.textContent = '🐣';
            else if (progress < 75) progressCharacter.textContent = '🐭';
            else progressCharacter.textContent = '🔥';
        }
    }
}

// モーダル管理
function openHelpModal() {
    helpOptionsContainer.innerHTML = '';
    userData.helpMaster.forEach(task => {
        const btn = document.createElement('button');
        btn.className = `help-opt-btn ${task.special ? 'special' : ''}`;
        btn.innerHTML = `${task.icon} ${task.name}<br><small>${task.price}円</small>`;
        btn.onclick = () => {
            closeModals();
            confirmDeposit(task.price, task.name);
        };
        helpOptionsContainer.appendChild(btn);
    });
    helpModal.classList.remove('hidden');
}

function openNumpadModal(mode) {
    inputMode = mode;
    keyboardInput.value = '';
    if (mode === 'deposit') modalTitle.textContent = 'はいったお金';
    else if (mode === 'withdraw') modalTitle.textContent = 'つかったお金';
    else modalTitle.textContent = '残高をなおす';
    numpadModal.classList.remove('hidden');
    setTimeout(() => keyboardInput.focus(), 100); // すぐにフォーカス
}

function openSettingsModal() {
    adjustBalanceInput.value = userData.balance;
    settingsListContainer.innerHTML = '';
    userData.helpMaster.forEach(task => {
        const div = document.createElement('div');
        div.className = 'settings-item';
        div.innerHTML = `<span>${task.icon} ${task.name}</span><div><input type="number" value="${task.price}" data-id="${task.id}"> 円</div>`;
        settingsListContainer.appendChild(div);
    });
    settingsModal.classList.remove('hidden');
}

function applyBalanceAdjustment() {
    const newVal = parseInt(adjustBalanceInput.value);
    if (!isNaN(newVal)) {
        userData.balance = newVal;
        userData.history.push({
            type: 'adjust',
            amount: newVal,
            reason: '設定での調整',
            date: getTodayStr()
        });
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
    helpModal.classList.add('hidden');
    numpadModal.classList.add('hidden');
    settingsModal.classList.add('hidden');
}

function confirmInput() {
    const amount = parseInt(keyboardInput.value);
    if (isNaN(amount) || amount <= 0) return;
    if (inputMode === 'withdraw' && userData.balance < amount) {
        alert('お金がたりないよ！');
        return;
    }

    if (inputMode === 'deposit') {
        confirmDeposit(amount, 'そのた');
    } else if (inputMode === 'withdraw') {
        userData.balance -= amount;
        addHistoryRecord('withdraw', amount, 'つかった');
        updateUI();
        closeModals();
    } else if (inputMode === 'adjust') {
        userData.balance = amount;
        addHistoryRecord('adjust', amount, 'て入力でのしゅうせい');
        updateUI();
        closeModals();
    }
}

function confirmDeposit(amount, reason) {
    // 変更：残高ではなく「もらう予定」に加算
    userData.pendingAmount = (userData.pendingAmount || 0) + amount;

    soundManager.playCoin();

    if (reason === '英語テスト合格') {
        playSpecialEffect('🎉合格おめでとう！🎉');
    } else {
        if (currentUser === 'masamune') playSpecialEffect('出発進行！🚃');
        else playSpecialEffect('レベルアップ！⭐');
    }
    saveAllData(); // 履歴は作らないが、pendingAmountを保存
    updateUI();
    closeModals();
}

function claimPendingAmount() {
    if (!userData.pendingAmount || userData.pendingAmount <= 0) {
        alert('まだもらう予定のお金がないよ！');
        return;
    }

    const amount = userData.pendingAmount;
    userData.balance += amount;
    userData.pendingAmount = 0;

    addHistoryRecord('deposit', amount, 'お手伝いでもらった');

    playSpecialEffect('💰 お金をもらった！ 💰');
    updateUI();
}

function deleteHistoryItem(index) {
    if (!confirm('この履歴を消してもいい？（お金も元にもどるよ）')) return;

    const item = userData.history[index];
    if (item.type === 'deposit' || item.type === 'adjust') {
        userData.balance -= item.amount;
    } else if (item.type === 'withdraw') {
        userData.balance += item.amount;
    }

    userData.history.splice(index, 1);
    saveAllData();
    updateUI();
}

function addHistoryRecord(type, amount, reason) {
    userData.history.push({
        type: type,
        amount: amount,
        reason: reason,
        date: getTodayStr()
    });
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

// 実行開始
init();
