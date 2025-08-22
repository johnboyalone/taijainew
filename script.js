// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyANK5rvwlgWc11EvXQRXpsSOO-tGV29pKA",
    authDomain: "taijai2.firebaseapp.com",
    databaseURL: "https://taijai2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "taijai2",
    storageBucket: "taijai2.appspot.com",
    messagingSenderId: "111291976868",
    appId: "1:111291976868:web:fee4606918ba2bbf93ea31"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- Global Variables ---
let currentPlayerId = null;
let playerName = '';
let currentRoomId = null;
let currentInput = '';
let playerRef = null;
let roomRef = null;
let roomListener = null;

// --- DOM Elements ---
const pages = { home: document.getElementById('page-home'), lobby: document.getElementById('page-lobby'), game: document.getElementById('page-game') };
const inputs = { playerName: document.getElementById('input-player-name') };
const buttons = { goToLobby: document.getElementById('btn-go-to-lobby'), createRoom: document.getElementById('btn-create-room'), leaveRoom: document.getElementById('btn-leave-room'), readyUp: document.getElementById('btn-ready-up'), delete: document.getElementById('btn-delete'), guess: document.getElementById('btn-guess') };
const lobbyElements = { playerName: document.getElementById('lobby-player-name'), roomListContainer: document.getElementById('room-list-container') };
const gameElements = {
    roomName: document.getElementById('game-room-name'),
    playerList: document.getElementById('player-list'),
    setupSection: document.getElementById('setup-section'),
    waitingSection: document.getElementById('waiting-section'),
    gameplaySection: document.getElementById('gameplay-section'),
    gameDisplay: document.getElementById('game-display'),
    keypad: document.querySelector('.keypad'),
    targetIndicator: document.getElementById('target-indicator'), // NEW
    turnIndicator: document.getElementById('turn-indicator'),
    guessLog: document.getElementById('guess-log')
};

// --- Page Navigation ---
function navigateTo(pageName) {
    Object.values(pages).forEach(page => page.style.display = 'none');
    if (pages[pageName]) pages[pageName].style.display = 'block';
}

// --- Core Functions ---
function handleGoToLobby() {
    const name = inputs.playerName.value.trim();
    if (!name) { alert('กรุณากรอกชื่อของคุณ'); return; }
    playerName = name;
    sessionStorage.setItem('playerName', playerName);
    lobbyElements.playerName.textContent = playerName;
    if (!currentPlayerId) currentPlayerId = database.ref().push().key;
    listenToRooms();
    navigateTo('lobby');
}

function createRoom() {
    const roomName = prompt("กรุณาตั้งชื่อห้อง:", `ห้องของ ${playerName}`);
    if (!roomName) return;
    const newRoomRef = database.ref('rooms').push();
    currentRoomId = newRoomRef.key;
    newRoomRef.set({
        name: roomName,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {},
        status: 'waiting'
    }).then(() => joinRoom(currentRoomId, roomName));
}

function joinRoom(roomId, roomName) {
    currentRoomId = roomId;
    roomRef = database.ref(`rooms/${currentRoomId}`);
    playerRef = database.ref(`rooms/${currentRoomId}/players/${currentPlayerId}`);
    playerRef.set({ name: playerName, isReady: false });
    playerRef.onDisconnect().remove();
    gameElements.roomName.textContent = `ห้อง: ${roomName}`;
    listenToRoomUpdates();
    navigateTo('game');
}

function listenToRoomUpdates() {
    if (!roomRef) return;
    roomListener = roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) {
            alert('ห้องนี้ถูกปิดแล้ว กลับสู่หน้าล็อบบี้');
            leaveRoom();
            return;
        }
        const roomData = snapshot.val();
        updatePlayerList(roomData.players);

        if (roomData.status === 'waiting') {
            checkIfGameCanStart(roomData);
        } else if (roomData.status === 'playing' || roomData.status === 'finished') {
            updateGameUI(roomData);
        }
    });
}

function checkIfGameCanStart(roomData) {
    const players = roomData.players || {};
    const playerIds = Object.keys(players);
    if (playerIds.length < 2) return; // Need at least 2 players
    const allReady = Object.values(players).every(p => p.isReady === true);
    if (allReady) {
        startGame(playerIds);
    }
}

function startGame(playerIds) {
    // New Game Logic: Set up for "Mob Guessing" mode
    roomRef.update({
        status: 'playing',
        playerOrder: playerIds, // The master order of all players
        targetPlayerIndex: 0,  // The first player is the first target
        attackerTurnIndex: 0, // The first attacker's turn
        guessHistory: []
    });
}

function updateGameUI(roomData) {
    gameElements.setupSection.style.display = 'none';
    gameElements.waitingSection.style.display = 'none';
    gameElements.gameplaySection.style.display = 'block';

    const { playerOrder, players, targetPlayerIndex, attackerTurnIndex } = roomData;
    
    // Determine who is the target
    const targetPlayerId = playerOrder[targetPlayerIndex];
    const targetPlayerName = players[targetPlayerId].name;
    gameElements.targetIndicator.textContent = `เป้าหมายรอบนี้: ${targetPlayerName}`;

    // Determine who are the attackers
    const attackers = playerOrder.filter(id => id !== targetPlayerId);
    if (attackers.length === 0) return; // Should not happen in a 2+ player game

    // Determine whose turn it is to attack
    const attackerPlayerId = attackers[attackerTurnIndex];
    const attackerPlayerName = players[attackerPlayerId].name;
    gameElements.turnIndicator.textContent = `ผู้ทาย: ${attackerPlayerName}`;

    // Enable/disable controls
    if (attackerPlayerId === currentPlayerId) {
        gameElements.keypad.classList.remove('disabled');
        buttons.guess.disabled = false;
        gameElements.turnIndicator.textContent += " (ตาของคุณ!)";
        gameElements.turnIndicator.style.color = '#28a745';
    } else {
        gameElements.keypad.classList.add('disabled');
        buttons.guess.disabled = true;
        gameElements.turnIndicator.style.color = '#6c757d';
    }
    
    // If I am the target, I can't do anything
    if (targetPlayerId === currentPlayerId) {
        gameElements.keypad.classList.add('disabled');
        buttons.guess.disabled = true;
        gameElements.turnIndicator.textContent = `คุณคือเป้าหมาย! รอเพื่อนทาย...`;
        gameElements.turnIndicator.style.color = '#dc3545';
    }

    if (roomData.status === 'finished') {
        gameElements.targetIndicator.textContent = `เกมจบแล้ว!`;
        gameElements.turnIndicator.textContent = `${roomData.winnerName} เป็นผู้ชนะ!`;
        gameElements.keypad.classList.add('disabled');
        buttons.guess.disabled = true;
    }

    updateGuessLog(roomData.guessHistory);
}

function updateGuessLog(history) {
    gameElements.guessLog.innerHTML = '';
    if (!history) return;
    history.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.textContent = `${log.attackerName} ทายเลขของ ${log.targetName} -> ${log.guess}`;
        gameElements.guessLog.prepend(logItem);
    });
}

function handleGuess() {
    if (currentInput.length !== 4) { alert('กรุณากรอกเลขให้ครบ 4 หลัก'); return; }

    const guess = currentInput;
    currentInput = '';
    gameElements.gameDisplay.textContent = '';

    roomRef.once('value', (snapshot) => {
        const roomData = snapshot.val();
        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex } = roomData;

        const targetPlayerId = playerOrder[targetPlayerIndex];
        const targetPlayer = players[targetPlayerId];
        const attackers = playerOrder.filter(id => id !== targetPlayerId);
        const attackerPlayerId = attackers[attackerTurnIndex];
        const attackerPlayer = players[attackerPlayerId];

        // Log the guess
        const newLog = { 
            attackerName: attackerPlayer.name, 
            targetName: targetPlayer.name,
            guess: guess 
        };
        const newHistory = roomData.guessHistory ? [...roomData.guessHistory, newLog] : [newLog];

        // Check for win condition
        if (targetPlayer.secretNumber === guess) {
            roomRef.update({ 
                status: 'finished', 
                winnerName: attackerPlayer.name,
                guessHistory: newHistory
            });
            return;
        }

        // --- Move to the next turn ---
        const nextAttackerIndex = attackerTurnIndex + 1;

        if (nextAttackerIndex >= attackers.length) {
            // Last attacker has guessed, move to the next target
            const nextTargetIndex = (targetPlayerIndex + 1) % playerOrder.length;
            roomRef.update({
                targetPlayerIndex: nextTargetIndex,
                attackerTurnIndex: 0, // Reset attacker turn
                guessHistory: newHistory
            });
        } else {
            // Move to the next attacker
            roomRef.update({
                attackerTurnIndex: nextAttackerIndex,
                guessHistory: newHistory
            });
        }
    });
}

function updatePlayerList(players) {
    gameElements.playerList.innerHTML = '';
    if (!players) return;
    Object.entries(players).forEach(([id, player]) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        let readyStatus = player.isReady ? '<span class="btn-ready">READY</span>' : '';
        playerItem.innerHTML = `<span>${player.name}</span> ${readyStatus}`;
        gameElements.playerList.appendChild(playerItem);
    });
}

function listenToRooms() {
    const roomsRef = database.ref('rooms');
    roomsRef.on('value', (snapshot) => {
        const rooms = snapshot.val();
        lobbyElements.roomListContainer.innerHTML = '';
        if (rooms) {
            Object.entries(rooms).forEach(([id, room]) => {
                if (room.status === 'waiting') {
                    const roomItem = document.createElement('div');
                    roomItem.className = 'room-item';
                    roomItem.textContent = room.name;
                    roomItem.onclick = () => joinRoom(id, room.name);
                    lobbyElements.roomListContainer.appendChild(roomItem);
                }
            });
        }
        if (lobbyElements.roomListContainer.innerHTML === '') {
            lobbyElements.roomListContainer.innerHTML = '<p>ยังไม่มีห้องว่าง, สร้างห้องเลย!</p>';
        }
    });
}

function leaveRoom() {
    if (playerRef) { playerRef.remove(); playerRef.onDisconnect().cancel(); }
    if (roomRef && roomListener) { roomRef.off('value', roomListener); }
    currentRoomId = null; roomRef = null; playerRef = null;
    gameElements.setupSection.style.display = 'block';
    gameElements.waitingSection.style.display = 'none';
    gameElements.gameplaySection.style.display = 'none';
    navigateTo('lobby');
}

function handleReadyUp() {
    if (!playerRef) return;
    const secretNumber = Math.floor(1000 + Math.random() * 9000).toString();
    playerRef.update({ isReady: true, secretNumber: secretNumber });
    gameElements.setupSection.style.display = 'none';
    gameElements.waitingSection.style.display = 'block';
    alert(`เลขลับของคุณคือ ${secretNumber} (ระบบจะจำไว้ให้)`);
}

function handleKeypadClick(e) {
    if (e.target.closest('.keypad.disabled')) return;
    if (!e.target.classList.contains('key')) return;
    if (currentInput.length >= 4) return;
    currentInput += e.target.textContent;
    gameElements.gameDisplay.textContent = currentInput;
}

function handleDelete() {
    if (gameElements.keypad.classList.contains('disabled')) return;
    currentInput = currentInput.slice(0, -1);
    gameElements.gameDisplay.textContent = currentInput;
}

// --- Event Listeners ---
buttons.goToLobby.addEventListener('click', handleGoToLobby);
buttons.createRoom.addEventListener('click', createRoom);
buttons.leaveRoom.addEventListener('click', leaveRoom);
buttons.readyUp.addEventListener('click', handleReadyUp);
gameElements.keypad.addEventListener('click', handleKeypadClick);
buttons.delete.addEventListener('click', handleDelete);
buttons.guess.addEventListener('click', handleGuess);

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) inputs.playerName.value = savedPlayerName;
    navigateTo('home');
});
