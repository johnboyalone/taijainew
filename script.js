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
let recentGuesses = []; // สำหรับเก็บ 3 การทายล่าสุด

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
    sounds.background.volume = 0.2;

    function playSound(sound, isSfx = true) {
        if (!hasInteracted) return;
        const canPlay = isSfx ? isSfxEnabled : isBgmEnabled;
        if (!canPlay) return;

        if (sound.tagName === 'AUDIO') {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("ไม่สามารถเล่นเสียงได้:", e));
        }
    }

    function updateSoundSettings() {
        isBgmEnabled = localStorage.getItem('isBgmEnabled') !== 'false';
        isSfxEnabled = localStorage.getItem('isSfxEnabled') !== 'false';
        inputs.bgmToggle.checked = isBgmEnabled;
        inputs.sfxToggle.checked = isSfxEnabled;
        if (isBgmEnabled && hasInteracted) {
            sounds.background.play().catch(e => console.log("ไม่สามารถเล่นเพลงพื้นหลังได้:", e));
        } else {
            sounds.background.pause();
        }
    }

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
        chat: document.getElementById('chat-input'),
        bgmToggle: document.getElementById('toggle-bgm'),
        sfxToggle: document.getElementById('toggle-sfx')
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
        playAgain: document.getElementById('btn-play-again'),
        settings: document.getElementById('btn-settings')
    };
    const lobbyElements = {
        preLobbyPlayerName: document.getElementById('pre-lobby-player-name'),
        roomListContainer: document.getElementById('room-list-container')
    };
    const gameElements = {
        container: document.getElementById('game-container'),
        turnIndicator: document.getElementById('game-turn-indicator'),
        targetIndicator: document.getElementById('game-target-indicator'),
        playerList: document.getElementById('player-list'),
        playerListSetup: document.getElementById('player-list-setup'),
        setupSection: document.getElementById('setup-section'),
        gameplaySection: document.getElementById('gameplay-section'),
        gameDisplay: document.getElementById('game-display'),
        keypad: document.querySelector('.keypad'),
        mySecretNumberText: document.getElementById('my-secret-number-text'),
        timerBar: document.getElementById('timer-bar'),
        attackAnimationContainer: document.getElementById('attack-animation-container')
    };
    const historyElements = {
        toggleBtn: document.getElementById('history-toggle-btn'),
        overlay: document.getElementById('history-modal-overlay'),
        body: document.getElementById('history-modal-body'),
        closeBtn: document.getElementById('history-close-btn'),
        recentGuesses: document.getElementById('history-recent-guesses')
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
        }
    };
    const defeatedOverlay = document.getElementById('defeated-overlay');
    const settingsOverlay = document.getElementById('settings-modal-overlay');

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
            if (isBgmEnabled) playSound(sounds.background, false);
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
                playerRef.set({
                    name: playerName,
                    isReady: false,
                    hp: 3,
                    status: 'playing',
                    stats: { guesses: 0, correctGuesses: 0, assassinateSuccess: 0, assassinateFails: 0, timeOuts: 0, damageTaken: 0, firstBlood: false }
                });
                playerRef.onDisconnect().remove();
                recentGuesses = []; // ล้างประวัติการทายเมื่อเข้าห้องใหม่
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
                        item.innerHTML = `<div><strong>${room.name}</strong></div><div>${playerCount}/${room.config.maxPlayers} คน - ${room.config.digitCount} หลัก</div>`;
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
            if (!snapshot.exists()) {
                alert('ห้องถูกปิดแล้ว');
                leaveRoom();
                return;
            }
            const roomData = snapshot.val();
            updatePlayerList(roomData);
            updateChat(roomData.chat);

            const myPlayer = roomData.players ? roomData.players[currentPlayerId] : null;

            if (!myPlayer) return; // ถ้าเราไม่มีข้อมูลในห้องแล้ว ให้ออก

            if (roomData.status === 'finished') {
                defeatedOverlay.style.display = 'none';
            } else {
                defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';
            }

            if (roomData.status === 'waiting') {
                gameElements.setupSection.style.display = 'block';
                gameElements.gameplaySection.style.display = 'none';
                buttons.readyUp.disabled = myPlayer.isReady;
                checkIfGameCanStart(roomData);
            } else if (roomData.status === 'playing') {
                const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
                if (activePlayers.length <= 1 && roomData.status !== 'finished') {
                    const winner = activePlayers.length === 1 ? activePlayers[0] : null;
                    const winnerId = Object.keys(roomData.players).find(id => roomData.players[id].name === (winner ? winner.name : null));
                    roomRef.update({
                        status: 'finished',
                        winnerName: winner ? winner.name : "ไม่มีผู้ชนะ",
                        winnerId: winnerId || null
                    });
                } else {
                    updateGameUI(roomData);
                }
            } else if (roomData.status === 'finished' && !roomData.summaryShown) {
                roomRef.update({ summaryShown: true });
                endGame(roomData);
            }
        });
    }

    function checkIfGameCanStart(roomData) {
        const players = roomData.players || {};
        const playerIds = Object.keys(players);
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
        gameElements.gameplaySection.style.display = 'block';

        if (turnTimer) clearInterval(turnTimer);

        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, config, turnStartTime } = roomData;

        if (players[currentPlayerId] && players[currentPlayerId].secretNumber) {
            gameElements.mySecretNumberText.textContent = players[currentPlayerId].secretNumber;
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
        const amITarget = targetPlayerId === currentPlayerId;
        const amIDefeated = players[currentPlayerId]?.status === 'defeated';

        gameElements.turnIndicator.textContent = `${attackerPlayerName} กำลังทาย`;
        gameElements.targetIndicator.textContent = `เป้าหมาย: ${targetPlayerName}`;

        if (isMyTurn) {
            gameElements.turnIndicator.textContent = "ถึงตาคุณแล้ว!";
            playSound(sounds.yourTurn);
        }
        if (amITarget) {
            gameElements.targetIndicator.textContent = "คุณคือเป้าหมาย!";
        }

        gameElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        buttons.assassinate.style.display = isMyTurn && !amIDefeated ? 'block' : 'none';

        showAttackAnimation(attackerPlayerId, targetPlayerId);

        const serverTimeOffset = (firebase.database().getServerTime() || Date.now()) - Date.now();
        turnTimer = setInterval(() => {
            const serverNow = Date.now() + serverTimeOffset;
            const elapsed = (serverNow - turnStartTime) / 1000;
            const remainingRatio = Math.max(0, 1 - (elapsed / config.turnTime));
            gameElements.timerBar.style.width = `${remainingRatio * 100}%`;

            if (remainingRatio <= 0) {
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
            const myStats = players[currentPlayerId].stats;
            updates[`/players/${currentPlayerId}/stats/guesses`] = (myStats.guesses || 0) + 1;
            updates[`/guessHistory/${database.ref().push().key}`] = { attackerId: currentPlayerId, targetId: targetPlayerId, guess: currentInput, bulls, cows, isAssassination, timestamp: firebase.database.ServerValue.TIMESTAMP };

            if (isAssassination) {
                if (isCorrect) {
                    updates[`/players/${targetPlayerId}/status`] = 'defeated';
                    updates[`/players/${targetPlayerId}/hp`] = 0;
                    updates[`/players/${currentPlayerId}/stats/assassinateSuccess`] = (myStats.assassinateSuccess || 0) + 1;
                    
                    const isFirstKill = !Object.values(players).some(p => p.stats.firstBlood);
                    if (isFirstKill) {
                        updates[`/players/${currentPlayerId}/stats/firstBlood`] = true;
                    }
                } else {
                    playSound(sounds.wrong);
                    const myHp = players[currentPlayerId].hp - 1;
                    updates[`/players/${currentPlayerId}/hp`] = myHp;
                    updates[`/players/${currentPlayerId}/stats/assassinateFails`] = (myStats.assassinateFails || 0) + 1;
                    updates[`/players/${currentPlayerId}/stats/damageTaken`] = (myStats.damageTaken || 0) + 1;
                    if (myHp <= 0) updates[`/players/${currentPlayerId}/status`] = 'defeated';
                }
            } else {
                if (isCorrect) {
                    updates[`/players/${currentPlayerId}/stats/correctGuesses`] = (myStats.correctGuesses || 0) + 1;
                }
            }

            roomRef.update(updates).then(moveToNextTurn);
            currentInput = '';
            gameElements.gameDisplay.textContent = '----'.substring(0, config.digitCount);
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
            updates[`stats/damageTaken`] = (player.stats.damageTaken || 0) + 1;
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
        const secretCounts = {};
        const guessCounts = {};

        for (let i = 0; i < secret.length; i++) {
            if (secretChars[i] === guessChars[i]) {
                bulls++;
            } else {
                secretCounts[secretChars[i]] = (secretCounts[secretChars[i]] || 0) + 1;
                guessCounts[guessChars[i]] = (guessCounts[guessChars[i]] || 0) + 1;
            }
        }

        for (const key in guessCounts) {
            if (secretCounts[key]) {
                cows += Math.min(guessCounts[key], secretCounts[key]);
            }
        }
        return { bulls, cows };
    }

    function showAttackAnimation(attackerId, targetId) {
        const attackerElem = document.querySelector(`.player-item[data-player-id="${attackerId}"]`);
        const targetElem = document.querySelector(`.player-item[data-player-id="${targetId}"]`);
        const container = gameElements.attackAnimationContainer;

        if (attackerElem && targetElem && container) {
            container.innerHTML = '';
            const arrow = document.createElement('div');
            arrow.className = 'attack-arrow';
            arrow.innerHTML = '➤';

            const startRect = attackerElem.getBoundingClientRect();
            const endRect = targetElem.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            const startX = startRect.left + startRect.width / 2 - containerRect.left;
            const startY = startRect.top + startRect.height / 2 - containerRect.top;
            const endX = endRect.left + endRect.width / 2 - containerRect.left;
            const endY = endRect.top + endRect.height / 2 - containerRect.top;

            const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;

            arrow.style.left = `${startX}px`;
            arrow.style.top = `${startY}px`;
            arrow.style.transform = `rotate(${angle}deg)`;

            container.appendChild(arrow);

            requestAnimationFrame(() => {
                arrow.style.transform = `translate(${endX - startX}px, ${endY - startY}px) rotate(${angle}deg)`;
            });

            setTimeout(() => arrow.remove(), 1000);
        }
    }

    // --- UI Updates ---
    function updatePlayerList(roomData) {
        const { players, status, playerOrder, targetPlayerIndex, attackerTurnIndex } = roomData;
        const listsToUpdate = [gameElements.playerList, gameElements.playerListSetup];
        listsToUpdate.forEach(list => { if (list) list.innerHTML = ''; });

        if (!players) return;

        let targetPlayerId, attackerPlayerId;
        if (status === 'playing') {
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            if (activePlayers.length > 0) {
                const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
                targetPlayerId = activePlayers[currentTargetIndexInActive];
                const attackers = activePlayers.filter(id => id !== targetPlayerId);
                if (attackers.length > 0) {
                    const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
                    attackerPlayerId = attackers[currentAttackerIndexInAttackers];
                }
            }
        }

        Object.entries(players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.dataset.playerId = id;

            if (player.status === 'defeated') item.classList.add('player-defeated');
            if (id === targetPlayerId) item.classList.add('target');
            if (id === attackerPlayerId) item.classList.add('attacker');

            const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
            const readyStatus = status === 'waiting' ? (player.isReady ? `<span style="color:var(--text-dark);">พร้อม</span>` : `<span style="opacity:0.7;">รอ...</span>`) : hpBar;

            item.innerHTML = `<div class="player-info">${player.name}</div>${readyStatus}`;
            
            listsToUpdate.forEach(list => {
                if (list) list.appendChild(item.cloneNode(true));
            });
        });
    }
    function updatePersonalHistory(roomData) {
        const { players, guessHistory } = roomData;
        historyElements.body.innerHTML = '';
        if (!guessHistory || !players) return;

        const myGuesses = Object.values(guessHistory).filter(log => log.attackerId === currentPlayerId);
        recentGuesses = myGuesses.slice(-3); // อัปเดต 3 การทายล่าสุด

        // อัปเดตการแสดงผลบนปุ่มประวัติ
        historyElements.recentGuesses.innerHTML = recentGuesses.map(log => {
            const targetName = players[log.targetId] ? players[log.targetId].name.substring(0, 3) : '???';
            return `<div>${log.guess} → ${targetName} (${log.bulls}B, ${log.cows}C)</div>`;
        }).join('');

        const myGuessesByTarget = myGuesses.reduce((acc, log) => {
            if (!acc[log.targetId]) acc[log.targetId] = [];
            acc[log.targetId].push(log);
            return acc;
        }, {});

        Object.entries(myGuessesByTarget).forEach(([targetId, logs]) => {
            const targetName = players[targetId] ? players[targetId].name : 'Unknown';
            const section = document.createElement('div');
            section.innerHTML = `<h4>ทาย ${targetName}</h4>`;

            const table = document.createElement('table');
            table.className = 'history-table';
            table.innerHTML = `<thead><tr><th>เลขที่ทาย</th><th>ผล</th></tr></thead>`;
            const tbody = document.createElement('tbody');
            logs.slice().reverse().forEach(log => {
                const row = document.createElement('tr');
                const hints = `<span class="hint-bull">${log.bulls}</span> <span class="hint-cow">${log.cows}</span>`;
                row.innerHTML = `<td class="history-guess">${log.guess} ${log.isAssassination ? '💀' : ''}</td><td>${hints}</td>`;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            section.appendChild(table);
            historyElements.body.appendChild(section);
        });
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
    function endGame(roomData) {
        if (turnTimer) clearInterval(turnTimer);
        if (roomData.winnerName !== "ไม่มีผู้ชนะ") playSound(sounds.win);

        const titles = assignTitles(roomData);
        showTitleCards(roomData, titles, () => {
            showSummaryPage(roomData, titles);
        });
    }

    function assignTitles(roomData) {
        const { players, winnerId } = roomData;
        let assignedTitles = {};

        Object.entries(players).forEach(([id, player]) => {
            const stats = player.stats || { guesses: 0, correctGuesses: 0, assassinateSuccess: 0, assassinateFails: 0, timeOuts: 0, damageTaken: 0, firstBlood: false };
            let potentialTitles = [];

            // --- หมวดผู้ชนะ ---
            if (id === winnerId) {
                if (player.hp === 3) potentialTitles.push({ p: 100, emoji: '🏆', title: 'แชมป์เปี้ยนไร้พ่าย', desc: 'ชนะอย่างสมบูรณ์แบบ โดยไม่เสียเลือดแม้แต่หยดเดียว' });
                if (stats.assassinateSuccess > 0) potentialTitles.push({ p: 90, emoji: '⚡️', title: 'มือสังหารสายฟ้าแลบ', desc: 'ปิดเกมด้วยคมดาบแห่งตัวเลข' });
                if (stats.guesses > 0 && (stats.correctGuesses / stats.guesses) > 0.5) potentialTitles.push({ p: 85, emoji: '🧠', title: 'จอมวางแผนอัจฉริยะ', desc: 'ทุกการคาดเดาล้วนมีความหมาย' });
                potentialTitles.push({ p: 1, emoji: '👑', title: 'ผู้รอดชีวิตหนึ่งเดียว', desc: 'ยืนหนึ่งอย่างสมศักดิ์ศรี!' });
            }
            // --- หมวดมือสังหาร ---
            if (stats.assassinateSuccess >= 2) potentialTitles.push({ p: 80, emoji: '🎯', title: 'เพชฌฆาตตาเหยี่ยว', desc: 'เมื่อถึงคราวสังหาร...ไม่เคยพลาด' });
            if (stats.assassinateFails >= 2) potentialTitles.push({ p: 75, emoji: '🤡', title: 'มือสังหารจอมพลาดเป้า', desc: 'เกือบจะเท่แล้ว...ถ้าไม่พลาดเอง' });
            if (stats.firstBlood) potentialTitles.push({ p: 70, emoji: '🔪', title: 'นักเชือดเลือดเย็น', desc: 'เป็นผู้เปิดฉากการนองเลือดในครั้งนี้' });
            if (stats.assassinateFails > 0 && player.status === 'defeated' && player.hp <= 0) potentialTitles.push({ p: 65, emoji: '💣', title: 'ระเบิดพลีชีพ', desc: 'ยอมตายดีกว่าเสียศักดิ์ศรี!' });

            // --- หมวดนักทาย ---
            if (stats.timeOuts >= 2) potentialTitles.push({ p: 60, emoji: '🐢', title: 'นักคิดแห่งยุค', desc: 'คิดนานจนเพื่อนหลับหมดแล้ว' });
            if (stats.guesses >= 15) potentialTitles.push({ p: 55, emoji: '🎲', title: 'นักเสี่ยงโชค', desc: 'ไม่สนฮินท์ เน้นเดาสุ่ม!' });
            
            // --- หมวดผู้ถูกกระทำและอื่นๆ ---
            if (player.status === 'defeated' && player.hp === 0 && stats.assassinateSuccess === 0) potentialTitles.push({ p: 50, emoji: '🤕', title: 'กระสอบทรายเดินได้', desc: 'รับทุกการโจมตีจนตัวพรุน' });
            if (id !== winnerId && player.hp === 1) potentialTitles.push({ p: 45, emoji: '🍀', title: 'คนดวงดี', desc: 'รอดมาได้แบบเส้นยาแดงผ่าแปด' });
            if (player.status === 'defeated' && stats.guesses === 0) potentialTitles.push({ p: 40, emoji: '👻', title: 'ผู้ไร้ตัวตน', desc: 'มาเล่นจริงๆ ใช่ไหม?' });
            
            // --- ฉายาพื้นฐาน ---
            if (player.status === 'defeated') potentialTitles.push({ p: 0, emoji: '🪦', title: 'ผู้ล่วงลับ', desc: 'พยายามได้ดีมากแล้วเพื่อน' });

            // เลือกฉายาที่มี Priority สูงสุด
            if (potentialTitles.length > 0) {
                assignedTitles[id] = potentialTitles.sort((a, b) => b.p - a.p)[0];
            } else {
                 assignedTitles[id] = { emoji: '👤', title: 'ผู้เล่นทั่วไป', desc: 'เข้าร่วมการแข่งขันอย่างมีเกียรติ' };
            }
        });
        return assignedTitles;
    }

    function showTitleCards(roomData, titles, onComplete) {
        const playerIdsInOrder = Object.keys(titles).sort((a, b) => (b === roomData.winnerId) - (a === roomData.winnerId));
        let currentIndex = 0;

        function showNextCard() {
            if (currentIndex >= playerIdsInOrder.length) {
                summaryElements.titleCardOverlay.style.display = 'none';
                if (onComplete) onComplete();
                return;
            }
            const playerId = playerIdsInOrder[currentIndex];
            const playerData = roomData.players[playerId];
            const titleData = titles[playerId];

            if (!playerData || !titleData) { currentIndex++; showNextCard(); return; }

            summaryElements.titleCard.emoji.textContent = titleData.emoji;
            summaryElements.titleCard.name.textContent = playerData.name;
            summaryElements.titleCard.title.textContent = titleData.title;
            summaryElements.titleCard.desc.textContent = titleData.desc;

            summaryElements.titleCardOverlay.style.display = 'flex';
            setTimeout(() => summaryElements.titleCardOverlay.classList.add('visible'), 10);
            setTimeout(() => {
                summaryElements.titleCardOverlay.classList.remove('visible');
                setTimeout(() => { currentIndex++; showNextCard(); }, 500);
            }, 4000);
        }
        showNextCard();
    }

    function showSummaryPage(roomData, titles) {
        summaryElements.winner.textContent = `ผู้ชนะคือ: ${roomData.winnerName || 'ไม่มี'}`;
        summaryElements.playerList.innerHTML = '';
        Object.entries(roomData.players).forEach(([id, player]) => {
            const card = document.createElement('div');
            card.className = 'summary-player-card';
            if (id === roomData.winnerId) card.classList.add('winner');

            const infoDiv = document.createElement('div');
            infoDiv.className = 'summary-player-info';
            infoDiv.innerHTML = `<div class="player-name">${player.name}</div><div class="player-title">${titles[id] ? titles[id].title : ''}</div>`;

            const statusDiv = document.createElement('div');
            statusDiv.className = 'summary-player-status';
            if (id === roomData.winnerId) {
                statusDiv.classList.add('win');
                statusDiv.textContent = 'ชนะ';
            } else {
                statusDiv.classList.add('lose');
                statusDiv.textContent = 'แพ้';
            }
            card.appendChild(infoDiv);
            card.appendChild(statusDiv);
            summaryElements.playerList.appendChild(card);
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
        navigateTo('preLobby');
    }

    function handleReadyUp() {
        playSound(sounds.click);
        if (!playerRef) return;
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            let secretNumber = '';
            const digits = '0123456789'.split('');
            for (let i = 0; i < digitCount; i++) {
                secretNumber += digits[Math.floor(Math.random() * digits.length)];
            }
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
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            gameElements.gameDisplay.textContent = currentInput.padEnd(digitCount, '–');
        });
    }

    // --- Event Listeners ---
    const playerNameInput = document.getElementById('input-player-name');
    buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
    playerNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGoToPreLobby(); });

    buttons.goToCreate.addEventListener('click', () => { playSound(sounds.click); navigateTo('lobbyCreate'); });
    buttons.goToJoin.addEventListener('click', handleGoToJoin);
    buttons.createRoom.addEventListener('click', createRoom);
    buttons.leaveRoom.addEventListener('click', leaveRoom);
    buttons.readyUp.addEventListener('click', handleReadyUp);
    buttons.delete.addEventListener('click', handleDelete);
    buttons.guess.addEventListener('click', () => handleAction(false));
    buttons.assassinate.addEventListener('click', () => handleAction(true));
    buttons.chatSend.addEventListener('click', handleSendChat);

    buttons.backToHome.addEventListener('click', () => {
        playSound(sounds.click);
        hasInteracted = false;
        sounds.background.pause();
        sounds.background.currentTime = 0;
        leaveRoom();
        navigateTo('home');
    });

    buttons.playAgain.addEventListener('click', () => {
        playSound(sounds.click);
        navigateTo('preLobby');
    });

    inputs.chat.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendChat(); });
    gameElements.keypad.addEventListener('click', handleKeypadClick);

    historyElements.toggleBtn.addEventListener('click', () => { playSound(sounds.click); historyElements.overlay.style.display = 'flex'; });
    historyElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); historyElements.overlay.style.display = 'none'; });

    chatElements.toggleBtn.addEventListener('click', () => {
        playSound(sounds.click);
        chatElements.overlay.style.display = 'flex';
        chatElements.unreadIndicator.style.display = 'none';
        isChatOpen = true;
        setTimeout(() => chatElements.body.scrollTop = chatElements.body.scrollHeight, 0);
    });
    chatElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); chatElements.overlay.style.display = 'none'; isChatOpen = false; });

    buttons.settings.addEventListener('click', () => { playSound(sounds.click); settingsOverlay.style.display = 'flex'; });
    document.getElementById('settings-close-btn').addEventListener('click', () => { playSound(sounds.click); settingsOverlay.style.display = 'none'; });

    inputs.bgmToggle.addEventListener('change', (e) => {
        isBgmEnabled = e.target.checked;
        localStorage.setItem('isBgmEnabled', isBgmEnabled);
        updateSoundSettings();
    });
    inputs.sfxToggle.addEventListener('change', (e) => {
        isSfxEnabled = e.target.checked;
        localStorage.setItem('isSfxEnabled', isSfxEnabled);
        playSound(sounds.click);
    });

    // --- Initial Load ---
    updateSoundSettings();
    navigateTo('home');
});
