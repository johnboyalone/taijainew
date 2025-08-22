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
    const playerArray = Object.values(players);
    if (playerArray.length < 2) return;
    const allReady = playerArray.every(p => p.isReady === true);
    if (allReady) {
        startGame(Object.keys(players));
    }
}

function startGame(playerIds) {
    roomRef.update({
        status: 'playing',
        turnOrder: playerIds,
        currentPlayerTurnIndex: 0,
        guessHistory: []
    });
}

function updateGameUI(roomData) {
    // *** FIX: Ensure everyone moves to the gameplay screen ***
    gameElements.setupSection.style.display = 'none';
    gameElements.waitingSection.style.display = 'none';
    gameElements.gameplaySection.style.display = 'block';

    const turnIndex = roomData.currentPlayerTurnIndex;
    const playerTurnId = roomData.turnOrder[turnIndex];
    const playerTurnName = roomData.players[playerTurnId].name;

    // *** FIX: Display whose turn it is clearly ***
    gameElements.turnIndicator.textContent = `ตาของ: ${playerTurnName}`;

    if (playerTurnId === currentPlayerId) {
        gameElements.keypad.classList.remove('disabled');
        buttons.guess.disabled = false;
        gameElements.turnIndicator.textContent += " (ตาของคุณ!)";
        gameElements.turnIndicator.style.color = '#28a745'; // Green for your turn
    } else {
        gameElements.keypad.classList.add('disabled');
        buttons.guess.disabled = true;
        gameElements.turnIndicator.style.color = '#dc3545'; // Red for others' turn
    }
    
    if (roomData.status === 'finished') {
        gameElements.turnIndicator.textContent = `เกมจบแล้ว! ${roomData.winnerName} เป็นผู้ชนะ!`;
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
        logItem.textContent = `${log.playerName} ทายเลข ${log.guess} -> ผล: ${log.result}`;
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
        const players = roomData.players;
        let result = "ไม่มีใครถูกทาย";
        let winnerFound = false;

        for (const playerId in players) {
            if (playerId !== currentPlayerId && players[playerId].secretNumber === guess) {
                const targetName = players[playerId].name;
                result = `ทายถูก! ${targetName} คือเลข ${guess}!`;
                winnerFound = true;
                roomRef.update({ status: 'finished', winnerName: playerName });
                break;
            }
        }
        
        const newLog = { playerName: playerName, guess: guess, result: result };
        const newHistory = roomData.guessHistory ? [...roomData.guessHistory, newLog] : [newLog];
        
        if (!winnerFound) {
            const nextTurnIndex = (roomData.currentPlayerTurnIndex + 1) % roomData.turnOrder.length;
            roomRef.update({ guessHistory: newHistory, currentPlayerTurnIndex: nextTurnIndex });
        } else {
            roomRef.child('guessHistory').set(newHistory);
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
