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
let isChatOpen = false;

// --- DOM Elements ---
const pages = { 
    home: document.getElementById('page-home'), 
    preLobby: document.getElementById('page-pre-lobby'),
    lobbyCreate: document.getElementById('page-lobby-create'),
    lobbyJoin: document.getElementById('page-lobby-join'),
    game: document.getElementById('page-game'),
    summary: document.getElementById('page-summary')
};
const inputs = { 
    playerName: document.getElementById('input-player-name'), 
    roomName: document.getElementById('input-room-name'), 
    maxPlayers: document.getElementById('input-max-players'), 
    digitCount: document.getElementById('input-digit-count'), 
    turnTime: document.getElementById('input-turn-time'), 
    chat: document.getElementById('chat-input') 
};
const buttons = { 
    goToPreLobby: document.getElementById('btn-go-to-pre-lobby'),
    goToCreate: document.getElementById('btn-go-to-create'),
    goToJoin: document.getElementById('btn-go-to-join'),
    createRoom: document.getElementById('btn-create-room'), 
    leaveRoom: document.getElementById('btn-leave-room'), 
    readyUp: document.getElementById('btn-ready-up'), 
    delete: document.getElementById('btn-delete'), 
    guess: document.getElementById('btn-guess'), 
    assassinate: document.getElementById('btn-assassinate'),
    chatSend: document.getElementById('chat-send-btn'),
    backToHome: document.getElementById('btn-back-to-home')
};
const lobbyElements = { 
    preLobbyPlayerName: document.getElementById('pre-lobby-player-name'),
    roomListContainer: document.getElementById('room-list-container') 
};
const gameElements = { 
    roomName: document.getElementById('game-room-name'), 
    playerList: document.getElementById('player-list'), 
    setupSection: document.getElementById('setup-section'), 
    waitingSection: document.getElementById('waiting-section'), 
    gameplaySection: document.getElementById('gameplay-section'), 
    gameDisplay: document.getElementById('game-display'), 
    keypad: document.querySelector('.keypad'), 
    timer: document.getElementById('timer-indicator'), 
    target: document.getElementById('target-indicator'), 
    turn: document.getElementById('turn-indicator'), 
    mySecretNumber: document.querySelector('#my-secret-number-display span') 
};
const historyElements = { 
    toggleBtn: document.getElementById('history-toggle-btn'), 
    overlay: document.getElementById('history-modal-overlay'), 
    body: document.getElementById('history-modal-body'), 
    closeBtn: document.getElementById('history-close-btn') 
};
const chatElements = { 
    toggleBtn: document.getElementById('chat-toggle-btn'), 
    unreadIndicator: document.getElementById('chat-unread-indicator'), 
    overlay: document.getElementById('chat-modal-overlay'), 
    body: document.getElementById('chat-modal-body'), 
    messagesContainer: document.getElementById('chat-messages'),
    closeBtn: document.getElementById('chat-close-btn'),
    floatingContainer: document.getElementById('floating-chat-container')
};
const summaryElements = {
    winnerOverlay: document.getElementById('winner-announcement-overlay'),
    winnerNameDisplay: document.getElementById('winner-name-display'),
    summaryPage: document.getElementById('page-summary'),
    winner: document.getElementById('summary-winner'),
    playerList: document.getElementById('summary-player-list'),
    titleCardOverlay: document.getElementById('title-card-overlay'),
    titleCard: {
        emoji: document.getElementById('title-card-emoji'),
        name: document.getElementById('title-card-name'),
        title: document.getElementById('title-card-title'),
        desc: document.getElementById('title-card-desc')
    }
};
const defeatedOverlay = document.getElementById('defeated-overlay');

// --- Navigation ---
function navigateTo(pageName) { 
    Object.values(pages).forEach(p => p.style.display = 'none');
    if (pages[pageName]) pages[pageName].style.display = 'block';
}

// --- Player & Room Management ---
function handleGoToPreLobby() {
    playerName = inputs.playerName.value.trim();
    if (!playerName) {
        alert('กรุณาใส่ชื่อของคุณ');
        return;
    }
    sessionStorage.setItem('playerName', playerName);
    lobbyElements.preLobbyPlayerName.textContent = playerName;
    navigateTo('preLobby');
}

function handleGoToCreate() {
    navigateTo('lobbyCreate');
}

function handleGoToJoin() {
    navigateTo('lobbyJoin');
    loadRooms();
}

function loadRooms() {
    const roomsRef = database.ref('rooms');
    lobbyElements.roomListContainer.innerHTML = '<p>กำลังโหลดห้อง...</p>';
    roomsRef.once('value', snapshot => {
        lobbyElements.roomListContainer.innerHTML = '';
        const rooms = snapshot.val();
        if (!rooms) {
            lobbyElements.roomListContainer.innerHTML = '<p>ยังไม่มีห้องเลย สร้างห้องสิ!</p>';
            return;
        }
        Object.entries(rooms).forEach(([id, room]) => {
            const playerCount = Object.keys(room.players || {}).length;
            if (room.status === 'waiting' && playerCount < room.config.maxPlayers) {
                const item = document.createElement('div');
                item.className = 'room-item';
                item.textContent = `${room.name} (${playerCount}/${room.config.maxPlayers})`;
                item.onclick = () => joinRoom(id);
                lobbyElements.roomListContainer.appendChild(item);
            }
        });
        if (lobbyElements.roomListContainer.innerHTML === '') {
            lobbyElements.roomListContainer.innerHTML = '<p>ไม่มีห้องว่างเลย สร้างห้องสิ!</p>';
        }
    });
}

function createRoom() {
    const roomName = inputs.roomName.value.trim() || `ห้องของ ${playerName}`;
    const newRoomRef = database.ref('rooms').push();
    currentRoomId = newRoomRef.key;
    
    const roomData = {
        name: roomName,
        status: 'waiting',
        hostId: currentPlayerId,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        config: {
            maxPlayers: parseInt(inputs.maxPlayers.value),
            digitCount: parseInt(inputs.digitCount.value),
            turnTime: parseInt(inputs.turnTime.value)
        },
        players: {}
    };
    
    newRoomRef.set(roomData).then(() => {
        joinRoom(currentRoomId);
    });
}

function joinRoom(roomId) {
    currentRoomId = roomId;
    roomRef = database.ref(`rooms/${currentRoomId}`);
    currentPlayerId = sessionStorage.getItem('playerId');
    if (!currentPlayerId) {
        currentPlayerId = database.ref().push().key;
        sessionStorage.setItem('playerId', currentPlayerId);
    }
    playerRef = roomRef.child(`players/${currentPlayerId}`);
    
    roomRef.child('players').once('value', snapshot => {
        const players = snapshot.val() || {};
        const playerCount = Object.keys(players).length;
        roomRef.child('config/maxPlayers').once('value', maxPlayersSnapshot => {
            if (playerCount >= maxPlayersSnapshot.val()) {
                alert('ห้องเต็มแล้ว!');
                return;
            }
            
            const playerData = {
                name: playerName,
                isReady: false,
                hp: 3,
                secretNumber: '',
                isDefeated: false,
                stats: { guessesMade: 0, correctGuesses: 0, assassinations: 0 }
            };
            playerRef.set(playerData);
            playerRef.onDisconnect().remove();
            
            listenToRoomChanges();
            navigateTo('game');
        });
    });
}

function leaveRoom() {
    if (playerRef) playerRef.remove();
    if (roomListener) roomRef.off('value', roomListener);
    
    playerRef = null;
    roomRef = null;
    currentRoomId = null;
    clearInterval(turnTimer);
    
    gameElements.setupSection.style.display = 'block';
    gameElements.waitingSection.style.display = 'none';
    gameElements.gameplaySection.style.display = 'none';
    defeatedOverlay.style.display = 'none';
    document.body.classList.remove('is-spectator');

    navigateTo('preLobby');
}

function listenToRoomChanges() {
    roomListener = roomRef.on('value', snapshot => {
        if (!snapshot.exists()) {
            alert('ห้องถูกปิดแล้ว');
            leaveRoom();
            return;
        }
        const roomData = snapshot.val();
        updateGameUI(roomData);
    });
}

// --- Game UI Updates ---
function updateGameUI(room) {
    gameElements.roomName.textContent = `ห้อง: ${room.name}`;
    updatePlayerList(room.players);

    const me = room.players[currentPlayerId];
    if (!me) return;

    if (me.isDefeated && room.status !== 'finished') {
        defeatedOverlay.style.display = 'flex';
        document.body.classList.add('is-spectator');
        historyElements.toggleBtn.style.display = 'block';
        chatElements.toggleBtn.style.display = 'block';
    } else {
        defeatedOverlay.style.display = 'none';
        document.body.classList.remove('is-spectator');
    }

    switch (room.status) {
        case 'waiting':
            gameElements.setupSection.style.display = me.isReady ? 'none' : 'block';
            gameElements.waitingSection.style.display = me.isReady ? 'block' : 'none';
            gameElements.gameplaySection.style.display = 'none';
            historyElements.toggleBtn.style.display = 'none';
            chatElements.toggleBtn.style.display = 'none';
            break;
        case 'playing':
            gameElements.setupSection.style.display = 'none';
            gameElements.waitingSection.style.display = 'none';
            gameElements.gameplaySection.style.display = 'block';
            historyElements.toggleBtn.style.display = 'block';
            chatElements.toggleBtn.style.display = 'block';
            updateGameplayUI(room);
            break;
        case 'finished':
            handleGameEnd(room);
            break;
    }
}

function updatePlayerList(players) {
    gameElements.playerList.innerHTML = '';
    Object.entries(players).forEach(([id, player]) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        if (player.isDefeated) item.classList.add('player-defeated');

        const infoDiv = document.createElement('div');
        infoDiv.className = 'player-info';
        infoDiv.textContent = player.name + (id === currentPlayerId ? ' (คุณ)' : '');
        
        const hpDiv = document.createElement('div');
        hpDiv.className = 'hp-bar';
        for (let i = 0; i < 3; i++) {
            const hpPoint = document.createElement('div');
            hpPoint.className = 'hp-point';
            if (i >= player.hp) hpPoint.classList.add('lost');
            hpDiv.appendChild(hpPoint);
        }

        const recentGuessDiv = document.createElement('div');
        recentGuessDiv.id = `recent-guess-${id}`;

        item.appendChild(infoDiv);
        item.appendChild(recentGuessDiv);
        item.appendChild(hpDiv);
        gameElements.playerList.appendChild(item);
    });
}

function updateGameplayUI(room) {
    const me = room.players[currentPlayerId];
    gameElements.mySecretNumber.textContent = me.secretNumber;

    const { turn, targetPlayerId, turnStartTime } = room.gameState;
    const targetPlayer = room.players[targetPlayerId];
    const turnPlayer = room.players[turn.playerId];

    gameElements.target.textContent = `เป้าหมาย: ${targetPlayer.name}`;
    gameElements.turn.textContent = `ผู้ทาย: ${turnPlayer.name}` + (turn.playerId === currentPlayerId ? ' (ตาของคุณ!)' : '');

    const isMyTurn = turn.playerId === currentPlayerId && !me.isDefeated;
    gameElements.keypad.classList.toggle('disabled', !isMyTurn);
    buttons.guess.disabled = !isMyTurn;
    buttons.assassinate.disabled = !isMyTurn;

    clearInterval(turnTimer);
    const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        const remaining = room.config.turnTime - elapsed;
        gameElements.timer.textContent = remaining > 0 ? remaining : 0;
        if (remaining <= 0) clearInterval(turnTimer);
    };
    updateTimer();
    turnTimer = setInterval(updateTimer, 1000);
}

// --- Game Logic ---
function handleReadyUp() {
    buttons.readyUp.disabled = true;
    roomRef.child('config/digitCount').once('value', snapshot => {
        const digitCount = snapshot.val();
        const min = Math.pow(10, digitCount - 1);
        const max = Math.pow(10, digitCount) - 1;
        const secretNumber = (Math.floor(Math.random() * (max - min + 1)) + min).toString().padStart(digitCount, '0');
        
        playerRef.update({ isReady: true, secretNumber: secretNumber }).then(() => {
            // *** START: โค้ดที่ย้ายมาและแก้ไขแล้ว ***
            // หลังจากอัปเดตสถานะตัวเองแล้ว ให้เช็คสถานะของห้องทั้งหมด
            roomRef.once('value', roomSnapshot => {
                const roomData = roomSnapshot.val();
                if (roomData.status === 'waiting') {
                    const players = roomData.players || {};
                    const playerCount = Object.keys(players).length;
                    const readyCount = Object.values(players).filter(p => p.isReady).length;
                    
                    // ถ้าผู้เล่นครบและทุกคนพร้อมแล้ว ให้เริ่มเกม
                    if (playerCount === roomData.config.maxPlayers && playerCount === readyCount) {
                        startGame(roomData);
                    }
                }
            });
            // *** END: โค้ดที่ย้ายมาและแก้ไขแล้ว ***
        });
    });
}

function startGame(room) {
    const playerIds = Object.keys(room.players);
    const firstTargetIndex = 0;
    const firstGuesserIndex = 1;

    const initialGameState = {
        targetPlayerId: playerIds[firstTargetIndex],
        turnOrder: playerIds,
        turn: {
            playerId: playerIds[firstGuesserIndex],
            targetIndex: firstTargetIndex,
            guesserIndex: firstGuesserIndex
        },
        turnStartTime: firebase.database.ServerValue.TIMESTAMP,
        guesses: {}
    };

    // เขียนข้อมูลกลับไปที่ Firebase เพื่อให้ทุกคนรู้ว่าเกมเริ่มแล้ว
    roomRef.update({
        status: 'playing',
        gameState: initialGameState
    });
}

function handleKeypadClick(e) {
    if (!e.target.classList.contains('key') || e.target.id) return;
    const digit = e.target.textContent;
    roomRef.child('config/digitCount').once('value', snapshot => {
        if (currentInput.length < snapshot.val()) {
            currentInput += digit;
            gameElements.gameDisplay.textContent = currentInput;
        }
    });
}

function handleDelete() {
    currentInput = currentInput.slice(0, -1);
    gameElements.gameDisplay.textContent = currentInput;
}

function handleGuess(isAssassination = false) {
    roomRef.child('config/digitCount').once('value', snapshot => {
        const digitCount = snapshot.val();
        if (currentInput.length !== digitCount) {
            alert(`กรุณากรอกเลขให้ครบ ${digitCount} หลัก`);
            return;
        }
        
        const guessData = {
            playerId: currentPlayerId,
            guess: currentInput,
            isAssassination: isAssassination,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        roomRef.child('gameState/guesses').push(guessData);
        currentInput = '';
        gameElements.gameDisplay.textContent = '';
    });
}

// --- History & Chat ---
function toggleHistory() {
    historyElements.overlay.style.display = 'flex';
    roomRef.child('history').once('value', snapshot => {
        const history = snapshot.val() || {};
        historyElements.body.innerHTML = '';
        Object.values(history).filter(h => h.guesserId === currentPlayerId).forEach(entry => {
            const table = document.createElement('table');
            table.className = 'history-table';
            table.innerHTML = `
                <thead><tr><th colspan="2">ทาย ${entry.targetName}</th></tr></thead>
                <tbody>
                    ${Object.entries(entry.guesses).map(([guess, hints]) => `
                        <tr>
                            <td class="history-guess">${guess}</td>
                            <td><span class="hint-bull">${hints.bulls}</span> <span class="hint-cow">${hints.cows}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            historyElements.body.appendChild(table);
        });
    });
}

function toggleChat() {
    isChatOpen = !isChatOpen;
    chatElements.overlay.style.display = isChatOpen ? 'flex' : 'none';
    if (isChatOpen) {
        chatElements.unreadIndicator.style.display = 'none';
        chatElements.body.scrollTop = chatElements.body.scrollHeight;
    }
}

function handleSendMessage() {
    const message = inputs.chat.value.trim();
    if (message) {
        const messageData = {
            senderId: currentPlayerId,
            senderName: playerName,
            text: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        roomRef.child('chat').push(messageData);
        inputs.chat.value = '';
    }
}

function listenToChat() {
    const chatRef = roomRef.child('chat');
    chatRef.on('child_added', snapshot => {
        const msg = snapshot.val();
        const msgElement = document.createElement('div');
        msgElement.className = `chat-message ${msg.senderId === currentPlayerId ? 'mine' : 'theirs'}`;
        msgElement.innerHTML = `<div class="sender">${msg.senderName}</div><div>${msg.text}</div>`;
        chatElements.messagesContainer.appendChild(msgElement);
        chatElements.body.scrollTop = chatElements.body.scrollHeight;

        if (!isChatOpen && msg.senderId !== currentPlayerId) {
            chatElements.unreadIndicator.style.display = 'block';
            showFloatingChat(msg);
        }
    });
}

function showFloatingChat(msg) {
    const bubble = document.createElement('div');
    bubble.className = 'floating-chat-bubble';
    bubble.textContent = `${msg.senderName}: ${msg.text}`;
    chatElements.floatingContainer.appendChild(bubble);
    setTimeout(() => bubble.remove(), 4000);
}

// --- Game End ---
function handleGameEnd(room) {
    clearInterval(turnTimer);
    const winnerId = room.gameState.winnerId;
    const winner = room.players[winnerId];

    summaryElements.winnerOverlay.classList.add('visible');
    summaryElements.winnerNameDisplay.textContent = winner.name;

    setTimeout(() => {
        summaryElements.winnerOverlay.classList.remove('visible');
        showTitleCards(room.players);
    }, 4000);
}

function showTitleCards(players) {
    const playerEntries = Object.entries(players);
    let currentIndex = 0;

    function displayNextCard() {
        if (currentIndex >= playerEntries.length) {
            summaryElements.titleCardOverlay.classList.remove('visible');
            showSummaryPage(players);
            return;
        }

        const [id, player] = playerEntries[currentIndex];
        const title = getPlayerTitle(player.stats);
        
        summaryElements.titleCard.emoji.textContent = title.emoji;
        summaryElements.title-card-name.textContent = player.name;
        summaryElements.titleCard.title.textContent = title.name;
        summaryElements.titleCard.desc.textContent = title.desc;
        
        summaryElements.titleCardOverlay.classList.add('visible');

        setTimeout(() => {
            summaryElements.titleCardOverlay.classList.remove('visible');
            currentIndex++;
            setTimeout(displayNextCard, 500); // Wait for fade out
        }, 4000);
    }

    displayNextCard();
}

function showSummaryPage(players) {
    const winner = Object.values(players).find(p => !p.isDefeated);
    summaryElements.winner.textContent = `🏆 ผู้ชนะคือ ${winner.name}!`;
    summaryElements.playerList.innerHTML = '';

    Object.values(players).forEach(player => {
        const title = getPlayerTitle(player.stats);
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div class="player-info">
                <div>
                    <div>${player.name}</div>
                    <div class="player-title">${title.name}</div>
                </div>
            </div>
            <div>เลขลับ: ${player.secretNumber}</div>
        `;
        summaryElements.playerList.appendChild(item);
    });

    navigateTo('summary');
}

function getPlayerTitle(stats) {
    const titles = [
        { name: "มือสังหารเลือดเย็น", emoji: "🔪", desc: "เชี่ยวชาญในการกำจัดเป้าหมายอย่างแม่นยำ", cond: (s) => s.assassinations > 0 },
        { name: "นักสืบอัจฉริยะ", emoji: "🕵️", desc: "ทายเลขได้ถูกต้องแม่นยำราวกับตาเห็น", cond: (s) => s.correctGuesses > 2 },
        { name: "จอมมั่ว", emoji: "😵", desc: "ทายไปเรื่อย แต่ไม่ถูกเลยสักครั้ง", cond: (s) => s.guessesMade > 5 && s.correctGuesses === 0 },
        { name: "สายซุ่ม", emoji: "🐢", desc: "ไม่ค่อยทาย แต่ถ้าทายแล้วมักจะถูก", cond: (s) => s.guessesMade < 3 && s.correctGuesses > 0 },
        { name: "ผู้ร่วมสนุก", emoji: "🥳", desc: "มาเพื่อสร้างสีสัน ไม่เน้นแพ้ชนะ", cond: (s) => true }
    ];
    return titles.find(t => t.cond(stats));
}

// --- Event Listeners ---
buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
buttons.goToCreate.addEventListener('click', handleGoToCreate);
buttons.goToJoin.addEventListener('click', handleGoToJoin);
buttons.createRoom.addEventListener('click', createRoom);
buttons.leaveRoom.addEventListener('click', leaveRoom);
buttons.readyUp.addEventListener('click', handleReadyUp);
buttons.delete.addEventListener('click', handleDelete);
buttons.guess.addEventListener('click', () => handleGuess(false));
buttons.assassinate.addEventListener('click', () => handleGuess(true));
buttons.chatSend.addEventListener('click', handleSendMessage);
inputs.chat.addEventListener('keypress', e => { if (e.key === 'Enter') handleSendMessage(); });
buttons.backToHome.addEventListener('click', () => {
    sessionStorage.removeItem('playerId');
    navigateTo('home');
});

gameElements.keypad.addEventListener('click', handleKeypadClick);
historyElements.toggleBtn.addEventListener('click', toggleHistory);
historyElements.closeBtn.addEventListener('click', () => historyElements.overlay.style.display = 'none');
chatElements.toggleBtn.addEventListener('click', toggleChat);
chatElements.closeBtn.addEventListener('click', toggleChat);

historyElements.overlay.addEventListener('click', (e) => { if (e.target === historyElements.overlay) historyElements.overlay.style.display = 'none'; });
chatElements.overlay.addEventListener('click', (e) => { if (e.target === chatElements.overlay) toggleChat(); });

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) {
        inputs.playerName.value = savedPlayerName;
    }
    navigateTo('home');
});
