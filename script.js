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
let hasInteracted = false;
let isBgmEnabled = true;
let isSfxEnabled = true;


document.addEventListener('DOMContentLoaded', () => {

    // --- Sound Effects ---
    const sounds = {
        background: new Audio('sounds/background-music.mp3'),
        click: new Audio('sounds/click.mp3'),
        win: new Audio('sounds/win-wow.mp3'),
        wrong: new Audio('sounds/wrong-answer.mp3'),
        yourTurn: new Audio('sounds/your-turn.mp3')
    };
    sounds.background.loop = true;
    sounds.background.volume = 0.3;

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
        goToCreate: document.getElementById('btn-go-to-create'),
        goToJoin: document.getElementById('btn-go-to-join'),
        createRoom: document.getElementById('btn-create-room'),
        leaveRoom: document.getElementById('btn-leave-room'),
        readyUp: document.getElementById('btn-ready-up'),
        delete: document.getElementById('btn-delete'),
        guess: document.getElementById('btn-guess'),
        assassinate: document.getElementById('btn-assassinate'),
        chatSend: document.getElementById('chat-send-btn'),
        backToHome: document.getElementById('btn-back-to-home'),
        playAgain: document.getElementById('btn-play-again')
    };
    const gameElements = {
        playerList: document.getElementById('player-list'),
        setupSection: document.getElementById('setup-section'),
        waitingSection: document.getElementById('waiting-section'),
        gameplaySection: document.getElementById('gameplay-section'),
        gameDisplay: document.getElementById('game-display'),
        keypad: document.querySelector('.keypad'),
        timerBar: document.getElementById('timer-indicator-bar'),
        target: document.getElementById('target-indicator'),
        turn: document.getElementById('turn-indicator'),
        mySecretNumber: document.querySelector('#my-secret-number-display span')
    };
    // Modals are handled in Event Listeners section
    const settingsElements = {
        openBtnHome: document.getElementById('btn-open-settings-home'),
        overlay: document.getElementById('settings-modal-overlay'),
        closeBtn: document.getElementById('settings-close-btn'),
        toggleBgm: document.getElementById('toggle-bgm'),
        toggleSfx: document.getElementById('toggle-sfx')
    };
    const defeatedOverlay = document.getElementById('defeated-overlay');

    // --- Sound Control ---
    function playSound(sound, isBgm = false) {
        if (!hasInteracted) return;
        const canPlay = isBgm ? isBgmEnabled : isSfxEnabled;
        if (!canPlay) return;
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Sound play failed:", e));
    }

    function updateSoundSettings() {
        isBgmEnabled = localStorage.getItem('isBgmEnabled') !== 'false';
        isSfxEnabled = localStorage.getItem('isSfxEnabled') !== 'false';
        settingsElements.toggleBgm.checked = isBgmEnabled;
        settingsElements.toggleSfx.checked = isSfxEnabled;
        if (isBgmEnabled && hasInteracted && sounds.background.paused) {
            sounds.background.play().catch(e => console.log("BGM play failed:", e));
        } else if (!isBgmEnabled) {
            sounds.background.pause();
        }
    }

    // --- Navigation ---
    function navigateTo(pageName) {
        Object.values(pages).forEach(p => p.style.display = 'none');
        if (pages[pageName]) {
            pages[pageName].style.display = 'flex';
        }
    }

    // --- Lobby Logic ---
    function handleGoToPreLobby() {
        playSound(sounds.click);
        if (!hasInteracted) {
            hasInteracted = true;
            updateSoundSettings();
        }
        const name = inputs.playerName.value.trim();
        if (!name) { alert('กรุณากรอกชื่อ'); return; }
        playerName = name;
        sessionStorage.setItem('playerName', playerName);
        document.getElementById('pre-lobby-player-name').textContent = playerName;
        if (!currentPlayerId) currentPlayerId = database.ref().push().key;
        navigateTo('preLobby');
    }

    function handleGoToJoin() {
        playSound(sounds.click);
        listenToRooms();
        navigateTo('lobbyJoin');
    }

    function createRoom() {
        playSound(sounds.click);
        const roomName = inputs.roomName.value.trim() || `ห้องของ ${playerName}`;
        const newRoomRef = database.ref('rooms').push();
        currentRoomId = newRoomRef.key;
        newRoomRef.set({
            name: roomName,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {},
            status: 'waiting',
            config: {
                maxPlayers: parseInt(inputs.maxPlayers.value),
                digitCount: parseInt(inputs.digitCount.value),
                turnTime: parseInt(inputs.turnTime.value)
            }
        }).then(() => joinRoom(currentRoomId, roomName));
    }

    function joinRoom(roomId, roomName) {
        playSound(sounds.click);
        currentRoomId = roomId;
        roomRef = database.ref(`rooms/${currentRoomId}`);
        roomRef.child('players').once('value', snapshot => {
            roomRef.child('config').once('value', configSnapshot => {
                const config = configSnapshot.val();
                if (snapshot.numChildren() >= config.maxPlayers) { alert('ขออภัย, ห้องนี้เต็มแล้ว'); return; }
                playerRef = database.ref(`rooms/${currentRoomId}/players/${currentPlayerId}`);
                playerRef.set({ name: playerName, isReady: false, hp: 3, status: 'playing', stats: { guesses: 0, assassinateFails: 0, timeOuts: 0 } });
                playerRef.onDisconnect().remove();
                listenToRoomUpdates();
                navigateTo('game');
            });
        });
    }

    function listenToRooms() {
        database.ref('rooms').on('value', snapshot => {
            const roomListContainer = document.getElementById('room-list-container');
            roomListContainer.innerHTML = '';
            const rooms = snapshot.val();
            let hasRooms = false;
            if (rooms) {
                Object.entries(rooms).forEach(([id, room]) => {
                    const playerCount = Object.keys(room.players || {}).length;
                    if (room.status === 'waiting' && playerCount < room.config.maxPlayers) {
                        hasRooms = true;
                        const item = document.createElement('button');
                        item.className = 'room-item';
                        item.textContent = `${room.name} (${playerCount}/${room.config.maxPlayers}) - ${room.config.digitCount} หลัก`;
                        item.onclick = () => joinRoom(id, room.name);
                        roomListContainer.appendChild(item);
                    }
                });
            }
            if (!hasRooms) {
                roomListContainer.innerHTML = '<p>ยังไม่มีห้องว่างในขณะนี้</p>';
            }
        });
    }

    // --- Game Logic (Part 1) ---
    function listenToRoomUpdates() {
        if (!roomRef) return;
        if (roomListener) roomRef.off('value', roomListener);
        roomListener = roomRef.on('value', snapshot => {
            if (!snapshot.exists()) {
                alert('ห้องถูกปิดแล้ว');
                leaveRoom();
                return;
            }
            const roomData = snapshot.val();
            updatePlayerList(roomData);
            // updateChat is in part 2

            const myPlayer = roomData.players ? roomData.players[currentPlayerId] : null;

            if (roomData.status === 'finished') {
                defeatedOverlay.style.display = 'none';
            } else if (myPlayer) {
                defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';
            }

            if (roomData.status === 'waiting') {
                gameElements.setupSection.style.display = 'block';
                gameElements.waitingSection.style.display = 'none';
                gameElements.gameplaySection.style.display = 'none';
                checkIfGameCanStart(roomData);
            } else if (roomData.status === 'playing') {
                gameElements.setupSection.style.display = 'none';
                gameElements.waitingSection.style.display = 'none';
                gameElements.gameplaySection.style.display = 'block';
                
                const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
                if (activePlayers.length <= 1) {
                    const winner = activePlayers.length === 1 ? activePlayers[0] : null;
                    roomRef.update({
                        status: 'finished',
                        winnerName: winner ? winner.name : "ไม่มีผู้ชนะ"
                    });
                } else {
                    updateGameUI(roomData); // in part 2
                }
            } else if (roomData.status === 'finished' && !roomData.summaryShown) {
                roomRef.update({ summaryShown: true });
                endGame(roomData); // in part 2
            }
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
        const shuffledPlayerIds = playerIds.sort(() => Math.random() - 0.5);
        roomRef.update({ status: 'playing', playerOrder: shuffledPlayerIds, targetPlayerIndex: 0, attackerTurnIndex: 0, turnStartTime: firebase.database.ServerValue.TIMESTAMP });
    }
    // --- Game Logic (Part 2) & UI Updates ---

    function animateAttack(attackerId, targetId) {
        const container = document.getElementById('attack-animation-container');
        const attackerEl = document.getElementById(`player-${attackerId}`);
        const targetEl = document.getElementById(`player-${targetId}`);
        container.innerHTML = ''; // Clear old animation

        if (!attackerEl || !targetEl) return;

        const attackerRect = attackerEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const containerRect = container.parentElement.getBoundingClientRect();

        const startX = attackerRect.left + attackerRect.width / 2 - containerRect.left;
        const startY = attackerRect.top + attackerRect.height / 2 - containerRect.top;
        const endX = targetRect.left + targetRect.width / 2 - containerRect.left;
        const endY = targetRect.top + targetRect.height / 2 - containerRect.top;

        const controlX = (startX + endX) / 2;
        const controlY = (startY + endY) / 2 - (Math.abs(startY - endY) < 50 ? 50 : 0);
        const pathD = `M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`;

        for (let i = 0; i < 5; i++) {
            const arrow = document.createElement('div');
            arrow.className = 'attack-arrow';
            arrow.textContent = '>';
            arrow.style.offsetPath = `path("${pathD}")`;
            arrow.style.animationDelay = `${i * 0.2}s`;
            container.appendChild(arrow);
        }
    }

    function updateGameUI(roomData) {
        if (turnTimer) clearInterval(turnTimer);

        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, config, turnStartTime } = roomData;

        if (players[currentPlayerId] && players[currentPlayerId].secretNumber) {
            gameElements.mySecretNumber.textContent = players[currentPlayerId].secretNumber;
        }

        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
        if (activePlayers.length <= 1) return;

        const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
        const targetPlayerId = activePlayers[currentTargetIndexInActive];
        const targetPlayerName = players[targetPlayerId].name;
        gameElements.target.textContent = `เป้าหมาย: ${targetPlayerName}`;

        const attackers = activePlayers.filter(id => id !== targetPlayerId);
        if (attackers.length === 0) return;

        const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
        const attackerPlayerId = attackers[currentAttackerIndexInAttackers];
        const attackerPlayerName = players[attackerPlayerId].name;
        gameElements.turn.textContent = `${attackerPlayerName} กำลังทาย`;

        setTimeout(() => animateAttack(attackerPlayerId, targetPlayerId), 100);

        const isMyTurn = attackerPlayerId === currentPlayerId;
        const amIDefeated = players[currentPlayerId]?.status === 'defeated';
        gameElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        buttons.assassinate.style.display = isMyTurn && !amIDefeated ? 'block' : 'none';

        if (isMyTurn) {
            gameElements.turn.textContent = "ถึงตาคุณแล้ว!";
            playSound(sounds.yourTurn);
        }
        if (targetPlayerId === currentPlayerId) {
            gameElements.target.textContent = `คุณคือเป้าหมาย!`;
        }

        turnTimer = setInterval(() => {
            const elapsed = (Date.now() - turnStartTime) / 1000;
            const remaining = Math.max(0, config.turnTime - elapsed);
            const percentage = (remaining / config.turnTime) * 100;
            gameElements.timerBar.style.width = `${percentage}%`;

            if (remaining <= 0) {
                clearInterval(turnTimer);
                if (isMyTurn) handleTimeOut(attackerPlayerId);
            }
        }, 100);

        updatePersonalHistory(roomData);
    }

    function handleAction(isAssassination) {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            if (currentInput.length !== roomData.config.digitCount) { alert(`ต้องใส่เลข ${roomData.config.digitCount} หลัก`); return; }

            playSound(sounds.click);

            const { playerOrder, players, targetPlayerIndex, config } = roomData;
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
            const targetPlayerId = activePlayers[currentTargetIndexInActive];
            const targetPlayer = players[targetPlayerId];

            const { bulls, cows } = calculateHints(currentInput, targetPlayer.secretNumber);
            const isCorrect = bulls === config.digitCount;

            let updates = {};
            updates[`/players/${currentPlayerId}/lastGuess`] = { guess: currentInput, timestamp: firebase.database.ServerValue.TIMESTAMP };
            updates[`/guessHistory/${database.ref().push().key}`] = { attackerId: currentPlayerId, targetId: targetPlayerId, guess: currentInput, bulls, cows, isAssassination, timestamp: firebase.database.ServerValue.TIMESTAMP };
            updates[`/players/${currentPlayerId}/stats/guesses`] = (players[currentPlayerId].stats.guesses || 0) + 1;

            if (isAssassination) {
                if (isCorrect) {
                    playSound(sounds.win);
                    updates[`/players/${targetPlayerId}/status`] = 'defeated';
                    updates[`/players/${targetPlayerId}/hp`] = 0;
                } else {
                    playSound(sounds.wrong);
                    const myHp = players[currentPlayerId].hp - 1;
                    updates[`/players/${currentPlayerId}/hp`] = myHp;
                    updates[`/players/${currentPlayerId}/stats/assassinateFails`] = (players[currentPlayerId].stats.assassinateFails || 0) + 1;
                    if (myHp <= 0) updates[`/players/${currentPlayerId}/status`] = 'defeated';
                }
            } else {
                if (isCorrect) {
                    playSound(sounds.win);
                    updates[`/players/${targetPlayerId}/status`] = 'defeated';
                    updates[`/players/${targetPlayerId}/hp`] = 0;
                }
            }

            roomRef.update(updates).then(moveToNextTurn);
            currentInput = '';
            gameElements.gameDisplay.textContent = '----';
        });
    }

    function handleTimeOut(timedOutPlayerId) {
        const playerToUpdateRef = database.ref(`rooms/${currentRoomId}/players/${timedOutPlayerId}`);
        playerToUpdateRef.once('value', snapshot => {
            const player = snapshot.val();
            if (!player || player.status !== 'playing') return;
            const newHp = player.hp - 1;
            let updates = { hp: newHp };
            updates[`stats/timeOuts`] = (player.stats.timeOuts || 0) + 1;
            if (newHp <= 0) updates.status = 'defeated';
            playerToUpdateRef.update(updates).then(moveToNextTurn);
        });
    }

    function moveToNextTurn() {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            if (roomData.status !== 'playing') return;

            const { playerOrder, players, targetPlayerIndex, attackerTurnIndex } = roomData;
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            if (activePlayers.length <= 1) {
                roomRef.update({ turnStartTime: firebase.database.ServerValue.TIMESTAMP });
                return;
            }

            const currentTargetId = activePlayers[targetPlayerIndex % activePlayers.length];
            const attackers = activePlayers.filter(id => id !== currentTargetId);

            const nextAttackerIndex = (attackerTurnIndex + 1);
            if (nextAttackerIndex >= attackers.length) {
                const nextTargetPlayerIndex = (targetPlayerIndex + 1) % activePlayers.length;
                roomRef.update({ targetPlayerIndex: nextTargetPlayerIndex, attackerTurnIndex: 0, turnStartTime: firebase.database.ServerValue.TIMESTAMP });
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
            if (guessChars[i] === secretChars[i]) {
                bulls++;
                secretChars.splice(i, 1);
                guessChars.splice(i, 1);
            }
        }
        const secretCounts = {};
        secretChars.forEach(c => secretCounts[c] = (secretCounts[c] || 0) + 1);
        guessChars.forEach(c => {
            if (secretCounts[c] > 0) {
                cows++;
                secretCounts[c]--;
            }
        });
        return { bulls, cows };
    }

    function updatePlayerList(roomData) {
        const { players, status, playerOrder, targetPlayerIndex, attackerTurnIndex } = roomData;
        const playerListEl = gameElements.playerList;
        
        Array.from(playerListEl.getElementsByClassName('player-item')).forEach(el => el.remove());

        if (!players) return;

        let attackerPlayerId = null;
        let targetPlayerId = null;

        if (status === 'playing' && playerOrder) {
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            if (activePlayers.length > 1) {
                const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
                targetPlayerId = activePlayers[currentTargetIndexInActive];
                const attackers = activePlayers.filter(id => id !== targetPlayerId);
                if (attackers.length > 0) {
                    attackerPlayerId = attackers[attackerTurnIndex % attackers.length];
                }
            }
        }

        const playerIdsToRender = playerOrder || Object.keys(players);
        playerIdsToRender.forEach(id => {
            const player = players[id];
            if (!player) return;

            const item = document.createElement('div');
            item.className = 'player-item';
            item.id = `player-${id}`;

            if (player.status === 'defeated') item.classList.add('player-defeated');
            if (id === attackerPlayerId) item.classList.add('attacker');
            if (id === targetPlayerId) item.classList.add('target');

            const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
            const readyStatus = status === 'waiting' ? (player.isReady ? `<span style="color:var(--text-dark);">พร้อม</span>` : `<span style="opacity:0.7;">รอ...</span>`) : hpBar;

            item.innerHTML = `<div class="player-info">${player.name}</div>${readyStatus}`;
            playerListEl.appendChild(item);
        });
    }

    function updatePersonalHistory(roomData) { /* ... Omitted for brevity, same as before ... */ }
    function updateChat(roomData) { /* ... Omitted for brevity, same as before ... */ }
    function showChatMarquee(msg) { /* ... Omitted for brevity, same as before ... */ }
    function endGame(roomData) { /* ... Omitted for brevity, same as before ... */ }
    function assignTitles(roomData) { /* ... Omitted for brevity, same as before ... */ }
    function showTitleCards(roomData, titles, onComplete) { /* ... Omitted for brevity, same as before ... */ }
    function showSummaryPage(roomData, titles) { /* ... Omitted for brevity, same as before ... */ }

    // --- General Functions & Event Listeners ---
    function leaveRoom() {
        playSound(sounds.click);
        if (playerRef) playerRef.remove();
        if (roomRef && roomListener) roomRef.off('value', roomListener);
        if (turnTimer) clearInterval(turnTimer);
        playerRef = null; roomRef = null; roomListener = null; currentRoomId = null; currentInput = '';
        navigateTo('preLobby');
    }

    function handleReadyUp() {
        playSound(sounds.click);
        if (!playerRef) return;
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            let secretNumber = '';
            for (let i = 0; i < digitCount; i++) {
                secretNumber += Math.floor(Math.random() * 10).toString();
            }
            playerRef.update({ isReady: true, secretNumber: secretNumber });
        });
    }

    function handleKeypadClick(e) {
        if (!e.target.classList.contains('key') || e.target.id === 'btn-delete' || e.target.id === 'btn-guess') return;
        playSound(sounds.click);
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            if (gameElements.gameDisplay.textContent === '----') {
                currentInput = '';
            }
            if (currentInput.length < digitCount) {
                currentInput += e.target.textContent;
                gameElements.gameDisplay.textContent = currentInput;
            }
        });
    }

    function handleDelete() {
        playSound(sounds.click);
        currentInput = currentInput.slice(0, -1);
        gameElements.gameDisplay.textContent = currentInput || '----';
    }

    // --- Event Listeners ---
    const goToPreLobbyBtn = document.getElementById('btn-go-to-pre-lobby');
    const playerNameInput = document.getElementById('input-player-name');
    goToPreLobbyBtn.addEventListener('click', handleGoToPreLobby);
    playerNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGoToPreLobby(); });

    buttons.goToCreate.addEventListener('click', () => { playSound(sounds.click); navigateTo('lobbyCreate'); });
    buttons.goToJoin.addEventListener('click', handleGoToJoin);
    buttons.createRoom.addEventListener('click', createRoom);
    buttons.leaveRoom.addEventListener('click', leaveRoom);
    buttons.readyUp.addEventListener('click', handleReadyUp);
    buttons.delete.addEventListener('click', handleDelete);
    buttons.guess.addEventListener('click', () => handleAction(false));
    buttons.assassinate.addEventListener('click', () => handleAction(true));
    buttons.chatSend.addEventListener('click', () => {/* handleSendChat() will be here */});
    buttons.backToHome.addEventListener('click', () => {
        playSound(sounds.click);
        sounds.background.pause();
        hasInteracted = false;
        leaveRoom();
        navigateTo('home');
    });
    buttons.playAgain.addEventListener('click', () => { playSound(sounds.click); navigateTo('preLobby'); });
    inputs.chat.addEventListener('keypress', (e) => { if (e.key === 'Enter') {/* handleSendChat() will be here */} });
    gameElements.keypad.addEventListener('click', handleKeypadClick);

    // Settings Listeners
    const openSettings = () => { playSound(sounds.click); settingsElements.overlay.style.display = 'flex'; };
    const closeSettings = () => { playSound(sounds.click); settingsElements.overlay.style.display = 'none'; };
    settingsElements.openBtnHome.addEventListener('click', openSettings);
    settingsElements.closeBtn.addEventListener('click', closeSettings);
    settingsElements.overlay.addEventListener('click', (e) => { if (e.target === settingsElements.overlay) closeSettings(); });
    settingsElements.toggleBgm.addEventListener('change', (e) => {
        isBgmEnabled = e.target.checked;
        localStorage.setItem('isBgmEnabled', isBgmEnabled);
        updateSoundSettings();
    });
    settingsElements.toggleSfx.addEventListener('change', (e) => {
        isSfxEnabled = e.target.checked;
        localStorage.setItem('isSfxEnabled', isSfxEnabled);
        playSound(sounds.click);
    });

    // --- Initial Load ---
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) {
        playerNameInput.value = savedPlayerName;
    }
    updateSoundSettings();
    navigateTo('home');
});
