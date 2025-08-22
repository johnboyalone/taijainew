// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyANK5rvwlgWc11EvXQRXpsSOO-tGV29pKA",
    authDomain: "taijai2.firebaseapp.com",
    databaseURL: "https://taijai2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "taijai2",
    storageBucket: "taijai2.appspot.com",
    messagingSenderId: "111291976868",
    appId: "1:111291976868:web:fee4606918ba2bbf93ea31"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- Global State ---
let currentPlayerId = null, playerName = '', currentRoomId = null, currentInput = '';
let playerRef = null, roomRef = null, roomListener = null, turnTimer = null;

// --- DOM Elements ---
const pages = { home: document.getElementById('page-home'), lobby: document.getElementById('page-lobby'), game: document.getElementById('page-game') };
const inputs = { playerName: document.getElementById('input-player-name'), roomName: document.getElementById('input-room-name'), maxPlayers: document.getElementById('input-max-players'), digitCount: document.getElementById('input-digit-count'), turnTime: document.getElementById('input-turn-time') };
const buttons = { goToLobby: document.getElementById('btn-go-to-lobby'), createRoom: document.getElementById('btn-create-room'), leaveRoom: document.getElementById('btn-leave-room'), readyUp: document.getElementById('btn-ready-up'), delete: document.getElementById('btn-delete'), guess: document.getElementById('btn-guess') };
const lobbyElements = { playerName: document.getElementById('lobby-player-name'), roomListContainer: document.getElementById('room-list-container') };
const gameElements = { roomName: document.getElementById('game-room-name'), playerList: document.getElementById('player-list'), setupSection: document.getElementById('setup-section'), waitingSection: document.getElementById('waiting-section'), gameplaySection: document.getElementById('gameplay-section'), gameDisplay: document.getElementById('game-display'), keypad: document.querySelector('.keypad'), timer: document.getElementById('timer-indicator'), target: document.getElementById('target-indicator'), turn: document.getElementById('turn-indicator'), guessLog: document.getElementById('guess-log') };
const historyElements = { container: document.getElementById('history-popup-container'), summary: document.getElementById('history-summary'), overlay: document.getElementById('history-modal-overlay'), content: document.getElementById('history-modal-content'), closeBtn: document.getElementById('history-close-btn') };

// --- Navigation ---
function navigateTo(pageName) { Object.values(pages).forEach(p => p.style.display = 'none'); if (pages[pageName]) pages[pageName].style.display = 'block'; }

// --- Lobby Logic ---
function handleGoToLobby() {
    const name = inputs.playerName.value.trim();
    if (!name) { alert('กรุณากรอกชื่อ'); return; }
    playerName = name;
    sessionStorage.setItem('playerName', playerName);
    lobbyElements.playerName.textContent = playerName;
    if (!currentPlayerId) currentPlayerId = database.ref().push().key;
    listenToRooms();
    navigateTo('lobby');
}

function createRoom() {
    const roomName = inputs.roomName.value.trim() || `ห้องของ ${playerName}`;
    const newRoomRef = database.ref('rooms').push();
    currentRoomId = newRoomRef.key;
    newRoomRef.set({
        name: roomName,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {},
        status: 'waiting',
        config: { maxPlayers: parseInt(inputs.maxPlayers.value), digitCount: parseInt(inputs.digitCount.value), turnTime: parseInt(inputs.turnTime.value) }
    }).then(() => joinRoom(currentRoomId, roomName));
}

function joinRoom(roomId, roomName) {
    currentRoomId = roomId;
    roomRef = database.ref(`rooms/${currentRoomId}`);
    roomRef.child('players').once('value', snapshot => {
        roomRef.child('config').once('value', configSnapshot => {
            const config = configSnapshot.val();
            if (snapshot.numChildren() >= config.maxPlayers) { alert('ขออภัย, ห้องนี้เต็มแล้ว'); return; }
            playerRef = database.ref(`rooms/${currentRoomId}/players/${currentPlayerId}`);
            playerRef.set({ name: playerName, isReady: false, hp: 3, status: 'playing' });
            playerRef.onDisconnect().remove();
            gameElements.roomName.textContent = `ห้อง: ${roomName}`;
            listenToRoomUpdates();
            navigateTo('game');
        });
    });
}

function listenToRooms() {
    database.ref('rooms').on('value', snapshot => {
        const rooms = snapshot.val();
        lobbyElements.roomListContainer.innerHTML = '';
        if (rooms) {
            Object.entries(rooms).forEach(([id, room]) => {
                const playerCount = Object.keys(room.players || {}).length;
                if (room.status === 'waiting' && playerCount < room.config.maxPlayers) {
                    const item = document.createElement('div');
                    item.className = 'room-item';
                    item.textContent = `${room.name} (${playerCount}/${room.config.maxPlayers}) - ${room.config.digitCount} หลัก`;
                    item.onclick = () => joinRoom(id, room.name);
                    lobbyElements.roomListContainer.appendChild(item);
                }
            });
        }
        if (lobbyElements.roomListContainer.innerHTML === '') {
            lobbyElements.roomListContainer.innerHTML = '<p>ยังไม่มีห้องว่างในขณะนี้</p>';
        }
    });
}

// --- Game Logic ---
function listenToRoomUpdates() {
    if (!roomRef) return;
    if (roomListener) roomRef.off('value', roomListener);
    roomListener = roomRef.on('value', snapshot => {
        if (!snapshot.exists()) { alert('ห้องถูกปิดแล้ว'); leaveRoom(); return; }
        const roomData = snapshot.val();
        updatePlayerList(roomData.players);
        if (roomData.status === 'waiting') checkIfGameCanStart(roomData);
        else if (roomData.status === 'playing' || roomData.status === 'finished') updateGameUI(roomData);
    });
}

function checkIfGameCanStart(roomData) {
    const players = roomData.players || {};
    const playerIds = Object.keys(players);
    if (playerIds.length < 2) return;
    const allReady = Object.values(players).every(p => p.isReady);
    if (allReady) startGame(playerIds);
}

function startGame(playerIds) {
    roomRef.update({ status: 'playing', playerOrder: playerIds, targetPlayerIndex: 0, attackerTurnIndex: 0, guessHistory: [], turnStartTime: firebase.database.ServerValue.TIMESTAMP });
}

function updateGameUI(roomData) {
    gameElements.setupSection.style.display = 'none';
    gameElements.waitingSection.style.display = 'none';
    gameElements.gameplaySection.style.display = 'block';
    historyElements.container.style.display = 'block';

    if (turnTimer) clearInterval(turnTimer);

    const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, status, config, turnStartTime } = roomData;
    const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
    
    if (activePlayers.length <= 1 && status === 'playing') {
        const winnerName = activePlayers.length > 0 ? players[activePlayers[0]].name : "ไม่มี";
        roomRef.update({ status: 'finished', winnerName: winnerName });
        return;
    }

    if (status === 'finished') {
        gameElements.timer.style.display = 'none';
        gameElements.target.textContent = `เกมจบแล้ว!`;
        gameElements.turn.textContent = `${roomData.winnerName} คือผู้ชนะ!`;
        gameElements.keypad.classList.add('disabled');
        historyElements.container.style.display = 'none';
        return;
    }

    const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
    const targetPlayerId = activePlayers[currentTargetIndexInActive];
    const targetPlayerName = players[targetPlayerId].name;
    gameElements.target.textContent = `เป้าหมาย: ${targetPlayerName}`;

    const attackers = activePlayers.filter(id => id !== targetPlayerId);
    if (attackers.length === 0) { roomRef.update({ status: 'finished', winnerName: targetPlayerName }); return; }
    
    const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
    const attackerPlayerId = attackers[currentAttackerIndexInAttackers];
    const attackerPlayerName = players[attackerPlayerId].name;
    gameElements.turn.textContent = `ผู้ทาย: ${attackerPlayerName}`;

    const isMyTurn = attackerPlayerId === currentPlayerId;
    gameElements.keypad.classList.toggle('disabled', !isMyTurn);
    gameElements.turn.style.color = isMyTurn ? '#28a745' : '#6c757d';
    if (isMyTurn) gameElements.turn.textContent += " (ตาของคุณ!)";
    if (targetPlayerId === currentPlayerId) { gameElements.turn.textContent = `คุณคือเป้าหมาย!`; gameElements.turn.style.color = '#dc3545'; }

    gameElements.timer.style.display = 'block';
    turnTimer = setInterval(() => {
        const elapsed = (Date.now() - turnStartTime) / 1000;
        const remaining = Math.max(0, config.turnTime - elapsed);
        gameElements.timer.textContent = Math.ceil(remaining);
        if (remaining <= 0) { clearInterval(turnTimer); if (isMyTurn) handleTimeOut(attackerPlayerId); }
    }, 500);

    updateGuessLog(roomData.guessHistory, players);
    updatePersonalHistory(roomData, targetPlayerId);
}

function handleTimeOut(timedOutPlayerId) {
    const playerToUpdateRef = database.ref(`rooms/${currentRoomId}/players/${timedOutPlayerId}`);
    playerToUpdateRef.once('value', snapshot => {
        const player = snapshot.val();
        if (!player || player.status !== 'playing') return;
        const newHp = player.hp - 1;
        let updates = { hp: newHp };
        if (newHp <= 0) updates.status = 'defeated';
        playerToUpdateRef.update(updates).then(moveToNextTurn);
    });
}

function handleGuess() {
    roomRef.once('value', snapshot => {
        const roomData = snapshot.val();
        if (currentInput.length !== roomData.config.digitCount) { alert(`ต้องทายเลข ${roomData.config.digitCount} หลัก`); return; }

        const { playerOrder, players, targetPlayerIndex, config } = roomData;
        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
        const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
        const targetPlayerId = activePlayers[currentTargetIndexInActive];
        const targetPlayer = players[targetPlayerId];

        const { bulls, cows } = calculateHints(currentInput, targetPlayer.secretNumber);
        const newLog = { attackerId: currentPlayerId, targetId: targetPlayerId, guess: currentInput, bulls, cows };
        const newHistory = roomData.guessHistory ? [...roomData.guessHistory, newLog] : [newLog];

        let updates = { guessHistory: newHistory };
        if (bulls === config.digitCount) {
            updates[`/players/${targetPlayerId}/status`] = 'defeated';
            updates[`/players/${targetPlayerId}/hp`] = 0;
        }
        
        roomRef.update(updates).then(moveToNextTurn);
        currentInput = '';
        gameElements.gameDisplay.textContent = '';
    });
}

function moveToNextTurn() {
    roomRef.once('value', snapshot => {
        const roomData = snapshot.val();
        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex } = roomData;
        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
        if (activePlayers.length <= 1) { roomRef.update({ turnStartTime: firebase.database.ServerValue.TIMESTAMP }); return; }

        const currentTargetId = activePlayers[targetPlayerIndex % activePlayers.length];
        const attackers = activePlayers.filter(id => id !== currentTargetId);

        const nextAttackerIndex = (attackerTurnIndex + 1);
        if (nextAttackerIndex >= attackers.length) {
            roomRef.update({ targetPlayerIndex: (targetPlayerIndex + 1), attackerTurnIndex: 0, turnStartTime: firebase.database.ServerValue.TIMESTAMP });
        } else {
            roomRef.update({ attackerTurnIndex: nextAttackerIndex, turnStartTime: firebase.database.ServerValue.TIMESTAMP });
        }
    });
}

function calculateHints(guess, secret) {
    let bulls = 0, cows = 0;
    const secretChars = secret.split('');
    const guessChars = guess.split('');
    for (let i = guessChars.length - 1; i >= 0; i--) {
        if (guessChars[i] === secretChars[i]) { bulls++; secretChars.splice(i, 1); guessChars.splice(i, 1); }
    }
    const secretCounts = {};
    secretChars.forEach(c => secretCounts[c] = (secretCounts[c] || 0) + 1);
    guessChars.forEach(c => { if (secretCounts[c] > 0) { cows++; secretCounts[c]--; } });
    return { bulls, cows };
}

// --- UI Updates ---
function updatePlayerList(players) {
    gameElements.playerList.innerHTML = '';
    if (!players) return;
    Object.entries(players).forEach(([id, player]) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        if (player.status === 'defeated') item.classList.add('player-defeated');
        const nameSpan = `<span>${player.name}</span>`;
        const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
        const readyStatus = player.isReady ? `<span class="btn-ready">READY</span>` : '';
        item.innerHTML = `${nameSpan} ${player.isReady ? hpBar : readyStatus}`;
        if (player.status === 'defeated' && item.querySelector('.hp-bar')) item.querySelector('.hp-bar').style.display = 'none';
        gameElements.playerList.appendChild(item);
    });
}

function updateGuessLog(history, players) {
    gameElements.guessLog.innerHTML = '';
    if (!history) return;
    history.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        const attackerName = players[log.attackerId] ? players[log.attackerId].name : 'Unknown';
        const hints = `<span class="hint-bull" title="ถูกตำแหน่ง">${log.bulls}</span> <span class="hint-cow" title="ถูกเลขผิดตำแหน่ง">${log.cows}</span>`;
        item.innerHTML = `${attackerName} ทาย <b>${log.guess}</b> -> ${hints}`;
        gameElements.guessLog.prepend(item);
    });
}

function updatePersonalHistory(roomData, currentTargetId) {
    const { players, guessHistory } = roomData;
    if (!guessHistory || !players) return;

    const myGuesses = guessHistory.filter(log => log.attackerId === currentPlayerId);
    
    // Update Summary
    const currentTargetPlayer = players[currentTargetId];
    if (currentTargetPlayer) {
        const lastGuessOnTarget = myGuesses.filter(log => log.targetId === currentTargetId).pop();
        if (lastGuessOnTarget) {
            historyElements.summary.innerHTML = `ทาย '${currentTargetPlayer.name}': <b>${lastGuessOnTarget.guess}</b> -> <span class="hint-bull">${lastGuessOnTarget.bulls}</span> <span class="hint-cow">${lastGuessOnTarget.cows}</span>`;
        } else {
            historyElements.summary.innerHTML = `ยังไม่ได้ทาย '${currentTargetPlayer.name}'`;
        }
    } else {
        historyElements.summary.innerHTML = 'ประวัติส่วนตัว';
    }

    // Update Modal Content
    historyElements.content.innerHTML = '';
    const myGuessesByTarget = myGuesses.reduce((acc, log) => {
        if (!acc[log.targetId]) acc[log.targetId] = [];
        acc[log.targetId].push(log);
        return acc;
    }, {});

    Object.entries(myGuessesByTarget).forEach(([targetId, logs]) => {
        const targetName = players[targetId] ? players[targetId].name : 'Unknown';
        const section = document.createElement('div');
        section.className = 'history-player-section';
        let sectionHTML = `<h4>ทาย ${targetName}</h4>`;
        logs.slice().reverse().forEach(log => {
            const hints = `<span class="hint-bull">${log.bulls}</span> <span class="hint-cow">${log.cows}</span>`;
            sectionHTML += `<div class="log-item"><span><b>${log.guess}</b></span> <span>${hints}</span></div>`;
        });
        section.innerHTML = sectionHTML;
        historyElements.content.appendChild(section);
    });
}

function leaveRoom() {
    if (playerRef) playerRef.remove();
    if (roomRef && roomListener) roomRef.off('value', roomListener);
    if (turnTimer) clearInterval(turnTimer);
    
    playerRef = null;
    roomRef = null;
    roomListener = null;
    currentRoomId = null;
    currentInput = '';
    
    gameElements.gameplaySection.style.display = 'none';
    gameElements.setupSection.style.display = 'block';
    gameElements.waitingSection.style.display = 'none';
    historyElements.container.style.display = 'none';
    gameElements.guessLog.innerHTML = '';
    gameElements.playerList.innerHTML = '';
    
    navigateTo('lobby');
}

function handleReadyUp() {
    if (!playerRef) return;
    roomRef.child('config/digitCount').once('value', snapshot => {
        const digitCount = snapshot.val();
        const min = Math.pow(10, digitCount - 1);
        const max = Math.pow(10, digitCount) - 1;
        const secretNumber = (Math.floor(Math.random() * (max - min + 1)) + min).toString();
        playerRef.update({ isReady: true, secretNumber: secretNumber });
        gameElements.setupSection.style.display = 'none';
        gameElements.waitingSection.style.display = 'block';
    });
}

function handleKeypadClick(e) {
    if (!e.target.classList.contains('key') || e.target.id === 'btn-delete' || e.target.id === 'btn-guess') return;
    roomRef.child('config/digitCount').once('value', snapshot => {
        const digitCount = snapshot.val();
        if (currentInput.length < digitCount) {
            currentInput += e.target.textContent;
            gameElements.gameDisplay.textContent = currentInput;
        }
    });
}

function handleDelete() {
    currentInput = currentInput.slice(0, -1);
    gameElements.gameDisplay.textContent = currentInput;
}

// --- Event Listeners ---
buttons.goToLobby.addEventListener('click', handleGoToLobby);
buttons.createRoom.addEventListener('click', createRoom);
buttons.leaveRoom.addEventListener('click', leaveRoom);
buttons.readyUp.addEventListener('click', handleReadyUp);
buttons.delete.addEventListener('click', handleDelete);
buttons.guess.addEventListener('click', handleGuess);
gameElements.keypad.addEventListener('click', handleKeypadClick);

historyElements.summary.addEventListener('click', () => {
    historyElements.overlay.style.display = 'flex';
});
historyElements.closeBtn.addEventListener('click', () => {
    historyElements.overlay.style.display = 'none';
});
historyElements.overlay.addEventListener('click', (e) => {
    if (e.target === historyElements.overlay) {
        historyElements.overlay.style.display = 'none';
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) {
        inputs.playerName.value = savedPlayerName;
    }
    navigateTo('home');
});
