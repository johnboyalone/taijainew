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
let isGameEnding = false; // <-- เพิ่มตัวแปรป้องกันการจบเกมซ้ำซ้อน

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

    function playSound(sound) {
        if (!hasInteracted) return;
        const isSoundEnabled = sound === sounds.background ? isBgmEnabled : isSfxEnabled;
        if (!isSoundEnabled) return;
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Audio play failed:", e));
    }

    // --- DOM Elements ---
    const pages = {
    home: document.getElementById('page-home'),
    preLobby: document.getElementById('page-pre-lobby'),
    lobbyCreate: document.getElementById('page-lobby-create'),
    lobbyJoin: document.getElementById('page-lobby-join'),
    lobbyWait: document.getElementById('page-lobby-wait'), // <-- เพิ่มบรรทัดนี้
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
        backToHome: document.getElementById('btn-back-to-home'),
        playAgain: document.getElementById('btn-play-again')
    };
    const lobbyElements = {
        preLobbyPlayerName: document.getElementById('pre-lobby-player-name'),
        roomListContainer: document.getElementById('room-list-container')
    };
    const gameElements = {
        header: document.getElementById('game-header'),
        turnInfo: document.getElementById('turn-info-text'),
        playerList: document.getElementById('player-list'),
        setupSection: document.getElementById('setup-section'),
        waitingSection: document.getElementById('waiting-section'),
        gameplaySection: document.getElementById('gameplay-section'),
        gameDisplay: document.getElementById('game-display'),
        keypad: document.querySelector('.keypad'),
        timerBar: document.getElementById('timer-bar-inner'),
        mySecretNumber: document.querySelector('#my-secret-number-display span'),
        arrowContainer: document.getElementById('arrow-animation-container')
    };
    const historyElements = {
        toggleBtn: document.getElementById('history-toggle-btn'),
        overlay: document.getElementById('history-modal-overlay'),
        body: document.getElementById('history-modal-body'),
        closeBtn: document.getElementById('history-close-btn'),
        popup: document.getElementById('history-popup'),
        popupContent: document.getElementById('history-popup-content')
    };
    const chatElements = {
        toggleBtn: document.getElementById('chat-toggle-btn'),
        unreadIndicator: document.getElementById('chat-unread-indicator'),
        overlay: document.getElementById('chat-modal-overlay'),
        body: document.getElementById('chat-modal-body'),
        messagesContainer: document.getElementById('chat-messages'),
        closeBtn: document.getElementById('chat-close-btn'),
        marqueeContainer: document.getElementById('chat-marquee-container')
    };
    const summaryElements = {
        winner: document.getElementById('summary-winner'),
        playerList: document.getElementById('summary-player-list'),
        titleCardOverlay: document.getElementById('title-card-overlay'),
        titleCard: {
            emoji: document.getElementById('title-card-emoji'),
            name: document.getElementById('title-card-name'),
            title: document.getElementById('title-card-title'),
            desc: document.getElementById('title-card-desc')
        },
        winnerAnnouncementOverlay: document.getElementById('winner-announcement-overlay'),
        winnerAnnouncementName: document.getElementById('winner-announcement-name')
    };
    const defeatedOverlay = document.getElementById('defeated-overlay');
    const settingsElements = {
        toggleBtn: document.getElementById('settings-toggle-btn'),
        overlay: document.getElementById('settings-modal-overlay'),
        closeBtn: document.getElementById('settings-close-btn'),
        bgmToggle: document.getElementById('toggle-bgm'),
        sfxToggle: document.getElementById('toggle-sfx')
    };

    // --- Navigation ---
    function navigateTo(pageName) {
        Object.values(pages).forEach(p => p.style.display = 'none');
        if (pages[pageName]) pages[pageName].style.display = 'block';
    }

    // --- Lobby Logic ---
    function handleGoToPreLobby() {
        playSound(sounds.click);
        if (!hasInteracted) {
            hasInteracted = true;
            playSound(sounds.background);
        }
        const name = inputs.playerName.value.trim();
        if (!name) { alert('กรุณากรอกชื่อ'); return; }
        playerName = name;
        sessionStorage.setItem('playerName', playerName);
        lobbyElements.preLobbyPlayerName.textContent = playerName;
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
            },
            guessHistory: {}
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
            playerRef.set({
                name: playerName,
                isReady: false,
                hp: 3,
                status: 'playing',
                stats: { guesses: 0, assassinateFails: 0, timeOuts: 0, correctGuesses: 0, firstBlood: false, finalKill: false }
            });
            playerRef.onDisconnect().remove();
            listenToRoomUpdates();
            // navigateTo('game'); // <-- ลบหรือคอมเมนต์บรรทัดนี้
            navigateTo('lobby-wait'); // <-- เพิ่มบรรทัดนี้เข้ามาแทน
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
                        item.innerHTML = `
                            <div class="room-info">
                                <span class="room-name">${room.name}</span>
                                <span class="room-details">${playerCount}/${room.config.maxPlayers} คน - ${room.config.digitCount} หลัก</span>
                            </div>
                            <button class="btn-join-room">เข้าร่วม</button>
                        `;
                        item.querySelector('.btn-join-room').onclick = () => joinRoom(id, room.name);
                        lobbyElements.roomListContainer.appendChild(item);
                    }
                });
            }
            if (lobbyElements.roomListContainer.innerHTML === '') {
                lobbyElements.roomListContainer.innerHTML = '<p class="no-rooms">ยังไม่มีห้องว่างในขณะนี้</p>';
            }
        });
    }

    // --- Game Logic ---
    function listenToRoomUpdates() {
        if (!roomRef) return;
        if (roomListener) roomRef.off('value', roomListener);
        roomListener = roomRef.on('value', snapshot => {
            if (!snapshot.exists()) {
                alert('ห้องถูกปิดแล้ว หรือคุณขาดการเชื่อมต่อ');
                leaveRoom();
                return;
            }
            const roomData = snapshot.val();
            updatePlayerList(roomData.players, roomData.status);
            updateChat(roomData.chat);

            const myPlayer = roomData.players ? roomData.players[currentPlayerId] : null;

            if (myPlayer) {
                defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';
            } else {
                defeatedOverlay.style.display = 'none';
            }

            if (roomData.status === 'waiting') {
                isGameEnding = false;
                gameElements.setupSection.style.display = myPlayer?.isReady ? 'none' : 'block';
                gameElements.waitingSection.style.display = myPlayer?.isReady ? 'block' : 'none';
                gameElements.gameplaySection.style.display = 'none';
                gameElements.header.style.display = 'none';
                checkIfGameCanStart(roomData);
            } else if (roomData.status === 'playing') {
                isGameEnding = false;
                const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
                if (activePlayers.length <= 1 && !isGameEnding) {
                    const winner = activePlayers.length === 1 ? activePlayers[0] : null;
                    const winnerId = Object.keys(roomData.players).find(id => roomData.players[id].name === winner?.name);
                    let updates = {
                        status: 'finished',
                        winnerName: winner ? winner.name : "ไม่มีผู้ชนะ"
                    };
                    if (winnerId) {
                        updates[`/players/${winnerId}/stats/finalKill`] = true;
                    }
                    roomRef.update(updates);
                } else {
                    updateGameUI(roomData);
                }
            } else if (roomData.status === 'finished') {
                if (!isGameEnding) { // <-- แก้ไขเงื่อนไขให้ถูกต้อง
                    isGameEnding = true;
                    fullEndGameSequence(roomData);
                }
            }
        });
    }

    function checkIfGameCanStart(roomData) {
        const players = roomData.players || {};
        const playerIds = Object.keys(players);
        const waitingText = document.querySelector('#waiting-section h3');
        if (waitingText) {
            waitingText.textContent = `กำลังรอผู้เล่น... (${playerIds.length}/${roomData.config.maxPlayers})`;
        }
        if (playerIds.length < 2) return;
        const allReady = Object.values(players).every(p => p.isReady);
        if (allReady) {
            startGame(playerIds);
        }
    }

    function startGame(playerIds) {
        const shuffledPlayerIds = playerIds.sort(() => Math.random() - 0.5);
        roomRef.update({
            status: 'playing',
            playerOrder: shuffledPlayerIds,
            targetPlayerIndex: 0,
            attackerTurnIndex: 0,
            turnStartTime: firebase.database.ServerValue.TIMESTAMP
        });
    }
    function updateGameUI(roomData) {
        gameElements.setupSection.style.display = 'none';
        gameElements.waitingSection.style.display = 'none';
        gameElements.gameplaySection.style.display = 'block';
        gameElements.header.style.display = 'flex';

        if (turnTimer) clearInterval(turnTimer);

        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, config, turnStartTime } = roomData;

        if (players[currentPlayerId] && players[currentPlayerId].secretNumber) {
            gameElements.mySecretNumber.textContent = players[currentPlayerId].secretNumber;
        }

        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
        if (activePlayers.length === 0) return;

        const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
        const targetPlayerId = activePlayers[currentTargetIndexInActive];
        const targetPlayerName = players[targetPlayerId].name;

        const attackers = activePlayers.filter(id => id !== targetPlayerId);
        if (attackers.length === 0) { return; }

        const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
        const attackerPlayerId = attackers[currentAttackerIndexInAttackers];
        const attackerPlayerName = players[attackerPlayerId].name;

        const isMyTurn = attackerPlayerId === currentPlayerId;
        const amIDefeated = players[currentPlayerId]?.status === 'defeated';

        gameElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        buttons.assassinate.style.display = isMyTurn && !amIDefeated ? 'block' : 'none';

        if (isMyTurn) {
            gameElements.turnInfo.innerHTML = `ถึงตาคุณแล้ว! <span>(เป้าหมาย: ${targetPlayerName})</span>`;
            playSound(sounds.yourTurn);
        } else if (targetPlayerId === currentPlayerId) {
            gameElements.turnInfo.innerHTML = `ตาของ ${attackerPlayerName} <span>(คุณคือเป้าหมาย!)</span>`;
        } else {
            gameElements.turnInfo.innerHTML = `ตาของ ${attackerPlayerName} <span>(เป้าหมาย: ${targetPlayerName})</span>`;
        }

        drawArrow(attackerPlayerId, targetPlayerId);
        updatePersonalHistory(roomData, targetPlayerId);

        const startTime = turnStartTime || Date.now();
        turnTimer = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const remainingPercent = Math.max(0, 100 - (elapsed / config.turnTime * 100));
            gameElements.timerBar.style.width = `${remainingPercent}%`;
            if (remainingPercent <= 0) {
                gameElements.keypad.classList.add('disabled'); // <-- แก้ปัญหาไฟดับแล้วยังกดได้
                clearInterval(turnTimer);
                if (isMyTurn) handleTimeOut(attackerPlayerId);
            }
        }, 100);
    }

    function handleAction(isAssassination) {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            if (currentInput.length !== roomData.config.digitCount) { alert(`ต้องใส่เลข ${roomData.config.digitCount} หลัก`); return; }

            playSound(sounds.click);

            const { playerOrder, players, targetPlayerIndex, config, guessHistory } = roomData;
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
            const targetPlayerId = activePlayers[currentTargetIndexInActive];
            const targetPlayer = players[targetPlayerId];

            const { bulls, cows } = calculateHints(currentInput, targetPlayer.secretNumber);
            const isCorrect = bulls === config.digitCount;

            let updates = {};
            const newGuessKey = database.ref().push().key;
            updates[`/guessHistory/${newGuessKey}`] = {
                attackerId: currentPlayerId,
                targetId: targetPlayerId,
                guess: currentInput,
                bulls,
                cows,
                isAssassination,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            updates[`/players/${currentPlayerId}/stats/guesses`] = (players[currentPlayerId].stats.guesses || 0) + 1;

            if (isCorrect) {
                updates[`/players/${currentPlayerId}/stats/correctGuesses`] = (players[currentPlayerId].stats.correctGuesses || 0) + 1;
                const isFirstKill = Object.values(players).every(p => p.status === 'playing');
                if (isFirstKill) {
                    updates[`/players/${currentPlayerId}/stats/firstBlood`] = true;
                }
            }

            if (isAssassination) {
                if (isCorrect) {
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
                    updates[`/players/${targetPlayerId}/status`] = 'defeated';
                    updates[`/players/${targetPlayerId}/hp`] = 0;
                }
            }

            roomRef.update(updates).then(moveToNextTurn);
            currentInput = '';
            gameElements.gameDisplay.textContent = '';
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
    function updatePlayerList(players, status) {
        const playerListContainer = document.getElementById('player-list');
        const lobbyPlayerListContainer = document.getElementById('lobby-player-list');
        if (!playerListContainer || !lobbyPlayerListContainer) return;

        playerListContainer.innerHTML = '';
        lobbyPlayerListContainer.innerHTML = '';

        if (!players) return;

        Object.entries(players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.dataset.playerId = id;

            if (player.status === 'defeated') item.classList.add('player-defeated');

            const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
            const readyStatus = (status === 'waiting') ?
                (player.isReady ? `<span style="color:var(--success-color);">พร้อม</span>` : `<span style="opacity:0.7;">รอ...</span>`) : hpBar;

            item.innerHTML = `
                <div class="player-info">${player.name}</div>
                <div class="player-status">${readyStatus}</div>
            `;
            
            if (status === 'waiting') {
                lobbyPlayerListContainer.appendChild(item.cloneNode(true));
            } else {
                playerListContainer.appendChild(item.cloneNode(true));
            }
        });
    }

    function updatePersonalHistory(roomData, currentTargetId) {
        const { players, guessHistory } = roomData;
        historyElements.popupContent.innerHTML = '';
        historyElements.body.innerHTML = '';

        if (!guessHistory || !players) return;

        const myGuesses = Object.values(guessHistory).filter(log => log.attackerId === currentPlayerId);

        // Update 3-recent-guesses popup
        const myRecentGuessesOnTarget = myGuesses.filter(log => log.targetId === currentTargetId).slice(-3).reverse();
        if (myRecentGuessesOnTarget.length > 0) {
            myRecentGuessesOnTarget.forEach(log => {
                const item = document.createElement('div');
                item.className = 'history-popup-item';
                item.innerHTML = `
                    <span class="guess">${log.guess}</span>
                    <span class="bulls">${log.bulls}</span>
                    <span class="cows">${log.cows}</span>
                `;
                historyElements.popupContent.appendChild(item);
            });
        } else {
            historyElements.popupContent.innerHTML = '<div class="history-popup-item-empty">ยังไม่มีการทายเป้าหมายนี้</div>';
        }

        // Update full history modal
        const myGuessesByTarget = myGuesses.reduce((acc, log) => {
            if (!acc[log.targetId]) acc[log.targetId] = [];
            acc[log.targetId].push(log);
            return acc;
        }, {});

        Object.entries(myGuessesByTarget).forEach(([targetId, logs]) => {
            const targetName = players[targetId] ? players[targetId].name : 'Unknown';
            const section = document.createElement('div');
            section.className = 'history-section';
            section.innerHTML = `<h4>ทาย ${targetName}</h4>`;

            const table = document.createElement('table');
            table.className = 'history-table';
            table.innerHTML = `<thead><tr><th>เลขที่ทาย</th><th>ผล (Bulls)</th><th>ผล (Cows)</th></tr></thead>`;
            const tbody = document.createElement('tbody');
            logs.slice().reverse().forEach(log => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="history-guess">${log.guess} ${log.isAssassination ? '💀' : ''}</td>
                    <td class="history-bulls">${log.bulls}</td>
                    <td class="history-cows">${log.cows}</td>
                `;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            section.appendChild(table);
            historyElements.body.appendChild(section);
        });
    }

    function drawArrow(attackerId, targetId) {
        gameElements.arrowContainer.innerHTML = '';
        const attackerElem = document.querySelector(`.player-item[data-player-id="${attackerId}"]`);
        const targetElem = document.querySelector(`.player-item[data-player-id="${targetId}"]`);

        if (attackerElem && targetElem) {
            const containerRect = gameElements.arrowContainer.getBoundingClientRect();
            const startRect = attackerElem.getBoundingClientRect();
            const endRect = targetElem.getBoundingClientRect();

            const startX = startRect.left + startRect.width / 2 - containerRect.left;
            const startY = startRect.top + startRect.height / 2 - containerRect.top;
            const endX = endRect.left + endRect.width / 2 - containerRect.left;
            const endY = endRect.top + endRect.height / 2 - containerRect.top;

            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            svg.style.width = '100%';
            svg.style.height = '100%';

            const defs = document.createElementNS(svgNS, 'defs');
            const marker = document.createElementNS(svgNS, 'marker');
            marker.setAttribute('id', 'arrowhead');
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '7');
            marker.setAttribute('refX', '0');
            marker.setAttribute('refY', '3.5');
            marker.setAttribute('orient', 'auto');
            const polygon = document.createElementNS(svgNS, 'polygon');
            polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
            marker.appendChild(polygon);
            defs.appendChild(marker);
            svg.appendChild(defs);

            const path = document.createElementNS(svgNS, "path");
            path.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
            path.classList.add('arrow-path');
            
            svg.appendChild(path);
            gameElements.arrowContainer.appendChild(svg);
        }
    }
    // --- Chat Logic ---
    function handleSendChat() {
        const message = inputs.chat.value.trim();
        if (!message) return;

        playSound(sounds.click);
        const chatRef = database.ref(`rooms/${currentRoomId}/chat`).push();
        chatRef.set({
            senderId: currentPlayerId,
            senderName: playerName,
            text: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        inputs.chat.value = '';
    }

    function updateChat(chatData) {
        if (!chatData) return;
        const messages = Object.values(chatData).sort((a, b) => a.timestamp - b.timestamp);
        const lastMessage = messages[messages.length - 1];

        if (lastMessage && lastMessage.senderId !== currentPlayerId && (Date.now() - lastMessage.timestamp < 6000)) {
            showChatMarquee(lastMessage);
        }
        if (!isChatOpen && lastMessage) {
            chatElements.unreadIndicator.style.display = 'block';
        }

        chatElements.messagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'chat-message';
            item.classList.add(msg.senderId === currentPlayerId ? 'mine' : 'theirs');
            item.innerHTML = `<div class="sender">${msg.senderName}</div><div>${msg.text}</div>`;
            chatElements.messagesContainer.appendChild(item);
        });
        if (isChatOpen) {
            chatElements.body.scrollTop = chatElements.body.scrollHeight;
        }
    }

    function showChatMarquee(msg) {
        const marquee = document.createElement('div');
        marquee.className = 'chat-marquee-item';
        marquee.textContent = `${msg.senderName}: ${msg.text}`;
        chatElements.marqueeContainer.appendChild(marquee);
        setTimeout(() => marquee.remove(), 5900);
    }

    // --- End Game Logic ---
    function fullEndGameSequence(roomData) {
        if (turnTimer) clearInterval(turnTimer);
        playSound(sounds.win);

        const titles = assignTitles(roomData);

        showWinnerAnnouncement(roomData, () => {
            showTitleCards(roomData, titles, () => {
                showSummaryPage(roomData, titles);
            });
        });
    }

    function showWinnerAnnouncement(roomData, onComplete) {
        navigateTo('game'); // Ensure we are on the game page to show overlay
        gameElements.gameplaySection.style.display = 'none';
        gameElements.header.style.display = 'none';
        defeatedOverlay.style.display = 'none';

        summaryElements.winnerAnnouncementName.textContent = roomData.winnerName || "ไม่มีผู้ชนะ";
        summaryElements.winnerAnnouncementOverlay.classList.add('visible');

        setTimeout(() => {
            summaryElements.winnerAnnouncementOverlay.classList.remove('visible');
            if (onComplete) onComplete();
        }, 4000);
    }

    function assignTitles(roomData) {
        const { players } = roomData;
        let titles = {};
        const playerArray = Object.entries(players).map(([id, data]) => ({ id, ...data }));

        playerArray.forEach(({ id, name, stats, status }) => {
            stats = stats || { guesses: 0, assassinateFails: 0, timeOuts: 0, correctGuesses: 0 };
            let assigned = false;

            if (name === roomData.winnerName && roomData.winnerName !== "ไม่มีผู้ชนะ") {
                titles[id] = { emoji: '👑', title: 'ผู้รอดชีวิตหนึ่งเดียว', desc: 'ยืนหนึ่งอย่างสมศักดิ์ศรี!' };
                assigned = true;
            }
            if (!assigned && stats.firstBlood) {
                titles[id] = { emoji: '🩸', title: 'มือสังหารเลือดเย็น', desc: 'เป็นผู้ปลิดชีพคนแรกของเกม' };
                assigned = true;
            }
            if (!assigned && stats.assassinateFails >= 2) {
                titles[id] = { emoji: '🤡', title: 'มือสังหารจอมพลาดเป้า', desc: 'เกือบจะเท่แล้ว...ถ้าไม่พลาดเอง' };
                assigned = true;
            }
            if (!assigned && stats.timeOuts >= 2) {
                titles[id] = { emoji: '🐌', title: 'นักคิดแห่งยุค', desc: 'คิดนานจนเพื่อนหลับหมดแล้ว' };
                assigned = true;
            }
            if (!assigned && stats.correctGuesses === 0 && status === 'defeated') {
                titles[id] = { emoji: '👻', title: 'ผู้ไร้ตัวตน', desc: 'มาเล่นจริงๆ ใช่ไหม?' };
                assigned = true;
            }
            if (!assigned && stats.correctGuesses >= 3) {
                titles[id] = { emoji: '🎯', title: 'นักแม่นเป้า', desc: 'ทายถูกเป๊ะๆ บ่อยกว่าใคร' };
                assigned = true;
            }
            if (!assigned && stats.guesses > playerArray.length * 3) {
                titles[id] = { emoji: '🔫', title: 'มือปืนสายกราด', desc: 'เน้นปริมาณ ไม่เน้นคุณภาพ' };
                assigned = true;
            }
            if (!assigned) {
                titles[id] = { emoji: '🪦', title: 'ผู้ล่วงลับ', desc: 'พยายามได้ดีมากแล้วเพื่อน' };
            }
        });
        return titles;
    }

    function showTitleCards(roomData, titles, onComplete) {
        const winnerId = Object.keys(roomData.players).find(id => roomData.players[id].name === roomData.winnerName);
        const otherPlayerIds = Object.keys(titles).filter(id => id !== winnerId);
        const playerIdsInOrder = winnerId ? [winnerId, ...otherPlayerIds] : Object.keys(titles);

        let currentIndex = 0;

        function showNextCard() {
            if (currentIndex >= playerIdsInOrder.length) {
                summaryElements.titleCardOverlay.classList.remove('visible');
                if (onComplete) onComplete();
                return;
            }
            const playerId = playerIdsInOrder[currentIndex];
            const playerData = roomData.players[playerId];
            const titleData = titles[playerId];

            if (!playerData || !titleData) {
                currentIndex++;
                showNextCard();
                return;
            }

            summaryElements.titleCard.emoji.textContent = titleData.emoji;
            summaryElements.titleCard.name.textContent = playerData.name;
            summaryElements.titleCard.title.textContent = titleData.title;
            summaryElements.titleCard.desc.textContent = titleData.desc;

            summaryElements.titleCardOverlay.classList.add('visible');

            setTimeout(() => {
                currentIndex++;
                showNextCard();
            }, 4000);
        }
        showNextCard();
    }

    function showSummaryPage(roomData, titles) {
        summaryElements.winner.textContent = `ผู้ชนะคือ: ${roomData.winnerName}`;
        summaryElements.playerList.innerHTML = '';
        Object.entries(roomData.players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'summary-player-item';
            const title = titles[id] ? `<div class="player-title">${titles[id].emoji} ${titles[id].title}</div>` : '';
            const resultClass = player.name === roomData.winnerName ? 'win' : 'lose';
            const resultText = player.name === roomData.winnerName ? 'ชนะ' : 'แพ้';

            item.innerHTML = `
                <div class="summary-player-info">
                    <div class="player-name">${player.name}</div>
                    ${title}
                </div>
                <div class="summary-player-result ${resultClass}">${resultText}</div>
            `;
            summaryElements.playerList.appendChild(item);
        });
        navigateTo('summary');
    }

    // --- General Functions ---
    function leaveRoom() {
        playSound(sounds.click);
        if (playerRef) playerRef.remove();
        if (roomRef && roomListener) roomRef.off('value', roomListener);
        if (turnTimer) clearInterval(turnTimer);

        playerRef = null; roomRef = null; roomListener = null; currentRoomId = null; currentInput = '';
        isGameEnding = false;

        // Hide all overlays
        defeatedOverlay.style.display = 'none';
        summaryElements.winnerAnnouncementOverlay.classList.remove('visible');
        summaryElements.titleCardOverlay.classList.remove('visible');
        historyElements.overlay.style.display = 'none';
        chatElements.overlay.style.display = 'none';
        settingsElements.overlay.style.display = 'none';

        navigateTo('preLobby');
    }

    function handleReadyUp() {
        playSound(sounds.click);
        if (!playerRef) return;
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            let secretNumber = '';
            const usedDigits = new Set();
            while (usedDigits.size < digitCount) {
                const digit = Math.floor(Math.random() * 10).toString();
                usedDigits.add(digit);
            }
            secretNumber = Array.from(usedDigits).join('');
            playerRef.update({ isReady: true, secretNumber: secretNumber });
        });
    }

    function handleKeypadClick(e) {
        if (!e.target.classList.contains('key') || e.target.id === 'btn-delete' || e.target.id === 'btn-guess') return;
        playSound(sounds.click);
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            if (currentInput.length < digitCount) {
                currentInput += e.target.textContent;
                gameElements.gameDisplay.textContent = currentInput;
            }
        });
    }

    function handleDelete() {
        playSound(sounds.click);
        currentInput = currentInput.slice(0, -1);
        gameElements.gameDisplay.textContent = currentInput;
    }

    // --- Event Listeners ---
    buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
    inputs.playerName.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGoToPreLobby(); });
    buttons.goToCreate.addEventListener('click', () => { playSound(sounds.click); navigateTo('lobbyCreate'); });
    buttons.goToJoin.addEventListener('click', handleGoToJoin);
    buttons.createRoom.addEventListener('click', createRoom);
    buttons.leaveRoom.addEventListener('click', leaveRoom);
    buttons.readyUp.addEventListener('click', handleReadyUp);
    buttons.delete.addEventListener('click', handleDelete);
    buttons.guess.addEventListener('click', () => handleAction(false));
    buttons.assassinate.addEventListener('click', () => handleAction(true));
    buttons.chatSend.addEventListener('click', handleSendChat);
    inputs.chat.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendChat(); });
    gameElements.keypad.addEventListener('click', handleKeypadClick);

    buttons.backToHome.addEventListener('click', () => {
        playSound(sounds.click);
        sounds.background.pause();
        hasInteracted = false;
        leaveRoom();
        navigateTo('home');
    });
    buttons.playAgain.addEventListener('click', leaveRoom);

    historyElements.toggleBtn.addEventListener('click', () => { playSound(sounds.click); historyElements.overlay.style.display = 'flex'; });
    historyElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); historyElements.overlay.style.display = 'none'; });
    historyElements.overlay.addEventListener('click', (e) => { if (e.target === historyElements.overlay) { playSound(sounds.click); historyElements.overlay.style.display = 'none'; } });

    chatElements.toggleBtn.addEventListener('click', () => {
        playSound(sounds.click);
        chatElements.overlay.style.display = 'flex';
        chatElements.unreadIndicator.style.display = 'none';
        isChatOpen = true;
        setTimeout(() => { chatElements.body.scrollTop = chatElements.body.scrollHeight; }, 0);
    });
    chatElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); chatElements.overlay.style.display = 'none'; isChatOpen = false; });
    chatElements.overlay.addEventListener('click', (e) => { if (e.target === chatElements.overlay) { playSound(sounds.click); chatElements.overlay.style.display = 'none'; isChatOpen = false; } });

    settingsElements.toggleBtn.addEventListener('click', () => { playSound(sounds.click); settingsElements.overlay.style.display = 'flex'; });
    settingsElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); settingsElements.overlay.style.display = 'none'; });
    settingsElements.overlay.addEventListener('click', (e) => { if (e.target === settingsElements.overlay) { playSound(sounds.click); settingsElements.overlay.style.display = 'none'; } });

    function updateSoundSettings() {
        isBgmEnabled = localStorage.getItem('isBgmEnabled') !== 'false';
        isSfxEnabled = localStorage.getItem('isSfxEnabled') !== 'false';
        settingsElements.bgmToggle.checked = isBgmEnabled;
        settingsElements.sfxToggle.checked = isSfxEnabled;
        if (hasInteracted) {
            isBgmEnabled ? sounds.background.play() : sounds.background.pause();
        }
    }

    settingsElements.bgmToggle.addEventListener('change', (e) => {
        isBgmEnabled = e.target.checked;
        localStorage.setItem('isBgmEnabled', isBgmEnabled);
        updateSoundSettings();
    });
    settingsElements.sfxToggle.addEventListener('change', (e) => {
        isSfxEnabled = e.target.checked;
        localStorage.setItem('isSfxEnabled', isSfxEnabled);
        playSound(sounds.click);
    });

    // --- Initial Load ---
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) {
        inputs.playerName.value = savedPlayerName;
    }
    updateSoundSettings();
    navigateTo('home');
});
