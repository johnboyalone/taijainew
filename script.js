document.addEventListener('DOMContentLoaded', () => {

    // --- Sound Effects ---
    const sounds = {
        background: new Audio('sounds/background-music.mp3'),
        click: new Audio('sounds/click.mp3'),
        win: new Audio('sounds/win-wow.mp3'),
        lose: new Audio('sounds/lose.mp3'),
        turn: new Audio('sounds/your-turn.mp3'),
        correct: new Audio('sounds/correct.mp3'),
        wrong: new Audio('sounds/wrong-answer.mp3'),
    };
    sounds.background.loop = true;
    sounds.background.volume = 0.2;
    let isBgmEnabled = true;
    let isSfxEnabled = true;
    let hasInteracted = false;

    function playSound(sound, isSfx = true) {
        if (!hasInteracted) return;
        if (isSfx && !isSfxEnabled) return;
        if (!isSfx && !isBgmEnabled) return;
        
        sound.currentTime = 0;
        sound.play().catch(e => console.log("ไม่สามารถเล่นเสียงได้:", e));
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
        turnIndicator: document.getElementById('game-turn-indicator'),
        playerListContainer: document.getElementById('player-list-container'),
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
        unreadIndicator: document.getElementById('history-unread-indicator'),
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
    const settingsElements = {
        toggleBtn: document.getElementById('settings-toggle-btn'),
        overlay: document.getElementById('settings-modal-overlay'),
        closeBtn: document.getElementById('settings-close-btn'),
        bgmToggle: document.getElementById('toggle-bgm'),
        sfxToggle: document.getElementById('toggle-sfx')
    };
    const defeatedOverlay = document.getElementById('defeated-overlay');

    // --- Global State ---
    let currentPlayerId = null, playerName = '', currentRoomId = null, currentInput = '';
    let playerRef = null, roomRef = null, roomListener = null, turnTimer = null;
    let isChatOpen = false;
    let hasShownSummary = false;

    // --- Firebase Config ---
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

    // --- Navigation ---
    function navigateTo(pageName) {
        Object.values(pages).forEach(p => p.style.display = 'none');
        if (pages[pageName]) pages[pageName].style.display = 'flex';
    }

    // --- Lobby Logic ---
    function handleGoToPreLobby() {
        if (!hasInteracted) {
            hasInteracted = true;
            if (isBgmEnabled) playSound(sounds.background, false);
        }
        playSound(sounds.click);
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
            guessHistory: {},
            chat: {}
        }).then(() => joinRoom(currentRoomId));
    }

    function joinRoom(roomId) {
        playSound(sounds.click);
        currentRoomId = roomId;
        roomRef = database.ref(`rooms/${currentRoomId}`);
        
        hasShownSummary = false;

        roomRef.child('players').once('value', snapshot => {
            roomRef.child('config').once('value', configSnapshot => {
                const config = configSnapshot.val();
                if (snapshot.numChildren() >= config.maxPlayers && !snapshot.hasChild(currentPlayerId)) {
                    alert('ขออภัย, ห้องนี้เต็มแล้ว');
                    return;
                }
                playerRef = database.ref(`rooms/${currentRoomId}/players/${currentPlayerId}`);
                playerRef.set({
                    name: playerName,
                    isReady: false,
                    hp: 3,
                    status: 'playing',
                    stats: { guesses: 0, correctGuesses: 0, assassinateSuccess: 0, assassinateFails: 0, timeOuts: 0, damageTaken: 0, firstBlood: false }
                });
                playerRef.onDisconnect().remove();
                navigateTo('game');
                listenToRoomUpdates();
            });
        });
    }

    function listenToRooms() {
        const roomsRef = database.ref('rooms');
        roomsRef.on('value', snapshot => {
            const rooms = snapshot.val();
            lobbyElements.roomListContainer.innerHTML = '';
            if (rooms) {
                Object.entries(rooms).forEach(([id, room]) => {
                    const playerCount = Object.keys(room.players || {}).length;
                    if (room.status === 'waiting' && playerCount < room.config.maxPlayers) {
                        const item = document.createElement('div');
                        item.className = 'room-item';
                        item.innerHTML = `<strong>${room.name}</strong> (${playerCount}/${room.config.maxPlayers}) - ${room.config.digitCount} หลัก`;
                        item.onclick = () => {
                            roomsRef.off();
                            joinRoom(id);
                        };
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
                alert('ห้องถูกปิดแล้ว หรือคุณขาดการเชื่อมต่อ');
                leaveRoom(true);
                return;
            }
            
            const roomData = snapshot.val();
            const myPlayer = roomData.players?.[currentPlayerId];

            if (roomData.status === 'finished') {
                if (turnTimer) clearInterval(turnTimer);
                if (!hasShownSummary) {
                    hasShownSummary = true;
                    navigateTo('summary'); 
                    showTitleCards(roomData, roomData.titles, () => {
                        showSummaryPage(roomData, roomData.titles);
                    });
                }
                return; 
            }

            updatePlayerList(roomData);
            updateChat(roomData.chat);
            updateHistory(roomData.guessHistory);

            if (!myPlayer) return;

            defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';

            if (roomData.status === 'waiting') {
                gameElements.setupSection.style.display = 'flex';
                gameElements.gameplaySection.style.display = 'none';
                gameElements.turnIndicator.textContent = `กำลังรอผู้เล่น... (${Object.keys(roomData.players).length}/${roomData.config.maxPlayers})`;
                buttons.readyUp.disabled = myPlayer.isReady || false;
                checkIfGameCanStart(roomData);
            } else if (roomData.status === 'playing') {
                updateGameUI(roomData);
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
        gameElements.gameplaySection.style.display = 'flex';

        if (turnTimer) clearInterval(turnTimer);

        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, config, turnStartTime } = roomData;

        const myPlayer = players[currentPlayerId];
        if (myPlayer && myPlayer.secretNumber) {
            gameElements.mySecretNumberText.textContent = myPlayer.secretNumber;
        }

        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
        if (activePlayers.length === 0) return;

        const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
        const targetPlayerId = activePlayers[currentTargetIndexInActive];
        const targetPlayer = players[targetPlayerId];

        const attackers = activePlayers.filter(id => id !== targetPlayerId);
        if (attackers.length === 0) return;

        const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
        const attackerPlayerId = attackers[currentAttackerIndexInAttackers];
        const attackerPlayer = players[attackerPlayerId];

        const isMyTurn = attackerPlayerId === currentPlayerId;
        const amIDefeated = myPlayer?.status === 'defeated';

        if (isMyTurn) {
            gameElements.turnIndicator.innerHTML = `ถึงตาคุณแล้ว! <span style="font-weight:400; opacity:0.8;">(เป้าหมาย: ${targetPlayer.name})</span>`;
            playSound(sounds.turn);
        } else if (targetPlayerId === currentPlayerId) {
            gameElements.turnIndicator.innerHTML = `<span style="color: var(--danger-color);">คุณคือเป้าหมาย!</span> <span style="font-weight:400; opacity:0.8;">(${attackerPlayer.name} กำลังทาย)</span>`;
        } else {
            gameElements.turnIndicator.innerHTML = `<strong>${attackerPlayer.name}</strong> กำลังทาย <strong>${targetPlayer.name}</strong>`;
        }

        document.querySelectorAll('.player-item').forEach(el => {
            el.classList.remove('is-attacker', 'is-target');
            if (el.dataset.playerId === attackerPlayerId) el.classList.add('is-attacker');
            if (el.dataset.playerId === targetPlayerId) el.classList.add('is-target');
        });
        
        requestAnimationFrame(() => {
            playAttackAnimation(attackerPlayerId, targetPlayerId);
        });

        gameElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        buttons.assassinate.style.display = isMyTurn && !amIDefeated ? 'block' : 'none';

        const startTime = turnStartTime || Date.now();
        turnTimer = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const remainingPercent = Math.max(0, 100 - (elapsed / config.turnTime * 100));
            gameElements.timerBar.style.width = `${remainingPercent}%`;
            if (remainingPercent <= 0) {
                clearInterval(turnTimer);
                if (isMyTurn) handleTimeOut(attackerPlayerId);
            }
        }, 100);
    }

    function handleAction(isAssassination) {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            if (currentInput.length !== roomData.config.digitCount) {
                alert(`ต้องใส่เลข ${roomData.config.digitCount} หลัก`);
                return;
            }

            playSound(sounds.click);

            const { playerOrder, players, targetPlayerIndex, config } = roomData;
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
            const targetPlayerId = activePlayers[currentTargetIndexInActive];
            
            const { bulls, cows } = calculateHints(currentInput, players[targetPlayerId].secretNumber);
            const isCorrect = bulls === config.digitCount;

            let updates = {};
            const historyKey = database.ref().push().key;
            updates[`/guessHistory/${historyKey}`] = { 
                attackerId: currentPlayerId, 
                targetId: targetPlayerId, 
                guess: currentInput, 
                bulls, 
                cows, 
                isAssassination,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            
            let statsUpdate = players[currentPlayerId].stats;
            statsUpdate.guesses = (statsUpdate.guesses || 0) + 1;

            if (isAssassination) {
                if (isCorrect) {
                    playSound(sounds.correct);
                    updates[`/players/${targetPlayerId}/status`] = 'defeated';
                    updates[`/players/${targetPlayerId}/hp`] = 0;
                    statsUpdate.assassinateSuccess = (statsUpdate.assassinateSuccess || 0) + 1;
                    if (Object.values(players).filter(p => p.status === 'playing').length === 2) {
                        statsUpdate.firstBlood = true;
                    }
                } else {
                    playSound(sounds.wrong);
                    const myHp = players[currentPlayerId].hp - 1;
                    updates[`/players/${currentPlayerId}/hp`] = myHp;
                    statsUpdate.assassinateFails = (statsUpdate.assassinateFails || 0) + 1;
                    statsUpdate.damageTaken = (statsUpdate.damageTaken || 0) + 1;
                    if (myHp <= 0) updates[`/players/${currentPlayerId}/status`] = 'defeated';
                }
            } else {
                if (isCorrect) {
                    playSound(sounds.correct);
                    statsUpdate.correctGuesses = (statsUpdate.correctGuesses || 0) + 1;
                }
            }
            updates[`/players/${currentPlayerId}/stats`] = statsUpdate;

            roomRef.update(updates).then(() => moveToNextTurn());
            currentInput = '';
            gameElements.gameDisplay.textContent = '';
        });
    }

    function handleTimeOut(timedOutPlayerId) {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            const player = roomData.players[timedOutPlayerId];
            if (!player || player.status !== 'playing') return;
            
            const newHp = player.hp - 1;
            let updates = {};
            updates[`/players/${timedOutPlayerId}/hp`] = newHp;
            
            let statsUpdate = player.stats;
            statsUpdate.timeOuts = (statsUpdate.timeOuts || 0) + 1;
            statsUpdate.damageTaken = (statsUpdate.damageTaken || 0) + 1;
            
            if (newHp <= 0) {
                updates[`/players/${timedOutPlayerId}/status`] = 'defeated';
            }
            
            updates[`/players/${timedOutPlayerId}/stats`] = statsUpdate;
            roomRef.update(updates).then(() => moveToNextTurn());
        });
    }

    function moveToNextTurn() {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            if (roomData.status !== 'playing') return;

            const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
            if (activePlayers.length <= 1) {
                endGameSequence(roomData);
                return;
            }

            const { playerOrder, players, targetPlayerIndex, attackerTurnIndex } = roomData;
            const activePlayerIds = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            
            const currentTargetId = activePlayerIds[targetPlayerIndex % activePlayerIds.length];
            const attackers = activePlayerIds.filter(id => id !== currentTargetId);

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
            if (guessChars[i] === secretChars[i]) {
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

    function updatePlayerList(roomData) {
        const { players } = roomData;
        const playerListContainer = gameElements.playerListContainer;
        playerListContainer.innerHTML = '';

        if (!players) return;

        const playerOrder = roomData.playerOrder || Object.keys(players);

        playerOrder.forEach(id => {
            const player = players[id];
            if (!player) return;

            const item = document.createElement('div');
            item.className = 'player-item';
            item.dataset.playerId = id;

            if (player.status === 'defeated') item.classList.add('player-defeated');

            const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
            const readyStatus = roomData.status === 'waiting' ? (player.isReady ? `<span style="color:var(--success-color);">พร้อม</span>` : `<span style="opacity:0.7;">รอ...</span>`) : hpBar;

            item.innerHTML = `
                <div class="player-info">${player.name}</div>
                <div class="player-status">${readyStatus}</div>
            `;
            
            playerListContainer.appendChild(item);
        });
    }
    function playAttackAnimation(attackerId, targetId) {
        const attackerEl = document.querySelector(`.player-item[data-player-id="${attackerId}"]`);
        const targetEl = document.querySelector(`.player-item[data-player-id="${targetId}"]`);

        if (!attackerEl || !targetEl) return;

        const containerRect = gameElements.attackAnimationContainer.getBoundingClientRect();
        const startRect = attackerEl.getBoundingClientRect();
        const endRect = targetEl.getBoundingClientRect();

        const startX = startRect.left + startRect.width / 2 - containerRect.left;
        const startY = startRect.top + startRect.height / 2 - containerRect.top;
        const endX = endRect.left + endRect.width / 2 - containerRect.left;
        const endY = endRect.top + endRect.height / 2 - containerRect.top;

        const arrow = document.createElement('div');
        arrow.className = 'attack-arrow';
        arrow.textContent = '>';
        arrow.style.left = `${startX}px`;
        arrow.style.top = `${startY}px`;

        gameElements.attackAnimationContainer.appendChild(arrow);

        requestAnimationFrame(() => {
            arrow.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';
            arrow.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(1.5)`;
        });

        setTimeout(() => {
            arrow.remove();
        }, 800);
    }

    function updateHistory(historyData) {
        historyElements.body.innerHTML = '';
        if (!historyData) return;

        const logs = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);
        
        if (logs.length > 0 && !historyElements.overlay.style.display) {
            historyElements.unreadIndicator.style.display = 'flex';
            historyElements.unreadIndicator.textContent = logs.length;
        }

        const table = document.createElement('table');
        table.className = 'history-table';
        table.innerHTML = '<thead><tr><th>เลขที่ทาย</th><th>ผลลัพธ์</th></tr></thead>';
        const tbody = document.createElement('tbody');
        logs.forEach(log => {
            const row = document.createElement('tr');
            const hints = `<span class="hint-bull">${log.bulls}</span>B <span class="hint-cow">${log.cows}</span>C`;
            row.innerHTML = `<td>${log.guess} ${log.isAssassination ? '💀' : ''}</td><td>${hints}</td>`;
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        historyElements.body.appendChild(table);
    }

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
        setTimeout(() => marquee.remove(), 5800);
    }

    function endGameSequence(roomData) {
        const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
        const winner = activePlayers.length === 1 ? activePlayers[0] : null;
        const winnerName = winner ? winner.name : "ไม่มีผู้ชนะ";

        if (winner && winner.name === playerName) {
            playSound(sounds.win, false);
        } else {
            playSound(sounds.lose, false);
        }

        const titles = assignTitles(roomData);
        
        roomRef.update({
            status: 'finished',
            winnerName: winnerName,
            titles: titles
        });
    }

    function assignTitles(roomData) {
        const { players } = roomData;
        let titles = {};
        const playerArray = Object.entries(players).map(([id, data]) => ({ id, ...data }));

        playerArray.forEach(({ id, name, stats, status }) => {
            stats = stats || {};
            let assignedTitle = null;

            if (status === 'playing') {
                if (stats.hp === 3) assignedTitle = { emoji: '🏆', title: 'ผู้ชนะไร้พ่าย', desc: 'จบเกมโดยไม่เสียเลือดแม้แต่หยดเดียว!' };
                else if (stats.assassinateSuccess > 0) assignedTitle = { emoji: '👑', title: 'ราชาแห่งนักฆ่า', desc: 'สังหารศัตรูและคว้าชัยชนะมาครอง!' };
                else assignedTitle = { emoji: '🥇', title: 'ผู้รอดชีวิตหนึ่งเดียว', desc: 'ยืนหนึ่งอย่างสมศักดิ์ศรี!' };
            }
            
            if (!assignedTitle) {
                if (stats.firstBlood) assignedTitle = { emoji: '🩸', title: 'เหยื่อรายแรก', desc: 'ถูกสังหารเป็นคนแรกของเกม' };
                else if (stats.assassinateFails >= 2) assignedTitle = { emoji: '🤡', title: 'มือสังหารจอมพลาดเป้า', desc: 'เกือบจะเท่แล้ว...ถ้าไม่พลาดเอง' };
                else if (stats.timeOuts >= 2) assignedTitle = { emoji: '🐌', title: 'นักคิดแห่งยุค', desc: 'คิดนานจนเพื่อนหลับหมดแล้ว' };
                else if (stats.guesses === 0) assignedTitle = { emoji: '👻', title: 'ผู้ไร้ตัวตน', desc: 'มาเล่นจริงๆ ใช่ไหม?' };
                else if (stats.correctGuesses > 0) assignedTitle = { emoji: '🎯', title: 'นักสืบผู้เฉียบแหลม', desc: 'ทายเลขคนอื่นถูก แต่ไปไม่ถึงฝัน' };
                else if (stats.damageTaken === 0) assignedTitle = { emoji: '🛡️', title: 'เกราะทองคำ', desc: 'ไม่มีใครทำดาเมจคุณได้เลย...แต่ก็แพ้อยู่ดี' };
                else assignedTitle = { emoji: '🪦', title: 'ผู้ล่วงลับ', desc: 'พยายามได้ดีมากแล้วเพื่อน' };
            }
            titles[id] = assignedTitle;
        });
        return titles;
    }

    function showTitleCards(roomData, titles, onComplete) {
        const playerIdsInOrder = Object.keys(titles);
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

            if (!playerData || !titleData) {
                currentIndex++;
                showNextCard();
                return;
            }

            summaryElements.titleCard.emoji.textContent = titleData.emoji;
            summaryElements.titleCard.name.textContent = playerData.name;
            summaryElements.titleCard.title.textContent = titleData.title;
            summaryElements.titleCard.desc.textContent = titleData.desc;

            summaryElements.titleCardOverlay.style.display = 'flex';
            setTimeout(() => {
                summaryElements.titleCardOverlay.classList.add('visible');
            }, 10);

            setTimeout(() => {
                summaryElements.titleCardOverlay.classList.remove('visible');
                setTimeout(() => {
                    currentIndex++;
                    showNextCard();
                }, 500);
            }, 3500);
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
            const isWinner = player.name === roomData.winnerName;
            item.innerHTML = `
                <div class="summary-player-info">
                    <div class="player-name">${player.name}</div>
                    ${title}
                </div>
                <div class="summary-player-status ${isWinner ? 'winner' : 'loser'}">${isWinner ? 'ชนะ' : 'แพ้'}</div>
            `;
            summaryElements.playerList.appendChild(item);
        });
    }

    function leaveRoom(isDisconnected = false) {
        playSound(sounds.click);
        if (playerRef) playerRef.remove();
        if (roomRef && roomListener) roomRef.off('value', roomListener);
        if (turnTimer) clearInterval(turnTimer);

        playerRef = null; roomRef = null; roomListener = null; currentRoomId = null; currentInput = '';
        
        if (!isDisconnected) {
            navigateTo('preLobby');
        } else {
            navigateTo('home');
        }
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
        gameElements.gameDisplay.textContent = currentInput;
    }

    function updateSoundSettings() {
        isBgmEnabled = localStorage.getItem('isBgmEnabled') !== 'false';
        isSfxEnabled = localStorage.getItem('isSfxEnabled') !== 'false';
        settingsElements.bgmToggle.checked = isBgmEnabled;
        settingsElements.sfxToggle.checked = isSfxEnabled;

        if (isBgmEnabled && hasInteracted) {
            sounds.background.play().catch(e => {});
        } else {
            sounds.background.pause();
        }
    }

    // --- Event Listeners ---
    buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
    inputs.playerName.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGoToPreLobby(); });
    buttons.goToCreate.addEventListener('click', () => { playSound(sounds.click); navigateTo('lobbyCreate'); });
    buttons.goToJoin.addEventListener('click', handleGoToJoin);
    buttons.createRoom.addEventListener('click', createRoom);
    buttons.leaveRoom.addEventListener('click', () => leaveRoom(false));
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
        leaveRoom(true);
    });
    buttons.playAgain.addEventListener('click', () => {
        playSound(sounds.click);
        navigateTo('preLobby');
    });

    [historyElements, chatElements, settingsElements].forEach(modal => {
        modal.toggleBtn?.addEventListener('click', () => {
            playSound(sounds.click);
            modal.overlay.style.display = 'flex';
            if (modal.unreadIndicator) modal.unreadIndicator.style.display = 'none';
            if (modal === chatElements) {
                isChatOpen = true;
                setTimeout(() => chatElements.body.scrollTop = chatElements.body.scrollHeight, 0);
            }
        });
        modal.closeBtn.addEventListener('click', () => {
            playSound(sounds.click);
            modal.overlay.style.display = 'none';
            if (modal === chatElements) isChatOpen = false;
        });
        modal.overlay.addEventListener('click', (e) => {
            if (e.target === modal.overlay) {
                playSound(sounds.click);
                modal.overlay.style.display = 'none';
                if (modal === chatElements) isChatOpen = false;
            }
        });
    });

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
