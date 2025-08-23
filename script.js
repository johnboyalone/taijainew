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
let hasInteracted = false; // สำหรับเช็คการเล่นเสียงครั้งแรก

// --- Settings State ---
let settings = {
    isBgmEnabled: true,
    isSfxEnabled: true,
    isNightMode: false
};

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

    function playSound(sound, isSfx = true) {
        if (!hasInteracted) return;
        if (isSfx && !settings.isSfxEnabled) return;
        if (!isSfx && !settings.isBgmEnabled) return;

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
        roomName: document.getElementById('game-room-name'),
        playerList: document.getElementById('player-list'),
        setupSection: document.getElementById('setup-section'),
        waitingSection: document.getElementById('waiting-section'),
        gameplaySection: document.getElementById('gameplay-section'),
        gameDisplay: document.getElementById('game-display'),
        timer: document.getElementById('timer-indicator'),
        target: document.getElementById('target-indicator'),
        turn: document.getElementById('turn-indicator'),
        mySecretNumber: document.querySelector('#my-secret-number-display span')
    };
    const historyElements = {
        toggleBtn: document.getElementById('history-toggle-btn'),
        preview: document.getElementById('history-preview'),
        overlay: document.getElementById('history-modal-overlay'),
        body: document.getElementById('history-modal-body'),
        closeBtn: document.getElementById('history-close-btn')
    };
    const chatElements = {
        toggleBtn: document.getElementById('chat-toggle-btn'),
        overlay: document.getElementById('chat-modal-overlay'),
        body: document.getElementById('chat-modal-body'),
        messagesContainer: document.getElementById('chat-messages'),
        closeBtn: document.getElementById('chat-close-btn'),
        marqueeContainer: document.getElementById('chat-marquee-container')
    };
    const settingsElements = {
        toggleBtn: document.getElementById('settings-toggle-btn'),
        overlay: document.getElementById('settings-modal-overlay'),
        closeBtn: document.getElementById('settings-close-btn'),
        toggleBgm: document.getElementById('toggle-bgm'),
        toggleSfx: document.getElementById('toggle-sfx'),
        toggleTheme: document.getElementById('toggle-theme')
    };
    const keypadElements = {
        modal: document.getElementById('keypad-modal-overlay'),
        openBtn: document.getElementById('btn-open-keypad'),
        closeBtn: document.getElementById('keypad-close-btn'),
        keypad: document.querySelector('#keypad-modal-overlay .keypad'),
        assassinateBtn: document.querySelector('#keypad-modal-overlay #btn-assassinate')
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
    const defeatedBanner = document.getElementById('defeated-banner');

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
            if (settings.isBgmEnabled) {
                sounds.background.play().catch(e => console.log("ไม่สามารถเล่นเพลงพื้นหลังได้:", e));
            }
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
                playerRef.set({ name: playerName, isReady: false, hp: 3, status: 'playing', stats: { guesses: 0, assassinateFails: 0, timeOuts: 0, correctGuesses: 0 } });
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
            if (!snapshot.exists()) {
                alert('ห้องถูกปิดแล้ว');
                leaveRoom();
                return;
            }
            const roomData = snapshot.val();
            updatePlayerList(roomData);
            updateChat(roomData.chat);

            const myPlayer = roomData.players[currentPlayerId];

            if (myPlayer && myPlayer.status === 'defeated') {
                document.body.classList.add('is-spectator');
                defeatedBanner.style.display = 'block';
            } else {
                document.body.classList.remove('is-spectator');
                defeatedBanner.style.display = 'none';
            }

            if (roomData.status === 'waiting') {
                gameElements.setupSection.style.display = myPlayer?.isReady ? 'none' : 'block';
                gameElements.waitingSection.style.display = myPlayer?.isReady ? 'block' : 'none';
                gameElements.gameplaySection.style.display = 'none';
                checkIfGameCanStart(roomData);
            } else if (roomData.status === 'playing') {
                const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
                if (activePlayers.length <= 1) {
                    const winner = activePlayers.length === 1 ? activePlayers[0] : null;
                    roomRef.update({
                        status: 'finished',
                        winnerName: winner ? winner.name : "ไม่มีผู้ชนะ"
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
        
        const allReady = Object.values(players).every(p => p.isReady);

        if (allReady && playerIds.length >= 2) {
            startGame(playerIds);
        }
    }

    function startGame(playerIds) {
        roomRef.update({ 
            status: 'playing', 
            playerOrder: playerIds, 
            targetPlayerIndex: 0, 
            attackerTurnIndex: 0, 
            turnStartTime: firebase.database.ServerValue.TIMESTAMP 
        });
    }


    function updateGameUI(roomData) {
        gameElements.setupSection.style.display = 'none';
        gameElements.waitingSection.style.display = 'none';
        gameElements.gameplaySection.style.display = 'block';

        if (turnTimer) clearInterval(turnTimer);

        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, config, turnStartTime } = roomData;

        if (players[currentPlayerId] && players[currentPlayerId].secretNumber) {
            gameElements.mySecretNumber.textContent = players[currentPlayerId].secretNumber;
        }

        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');

        const currentTargetIndexInActive = targetPlayerIndex % activePlayers.length;
        const targetPlayerId = activePlayers[currentTargetIndexInActive];
        const targetPlayerName = players[targetPlayerId].name;
        gameElements.target.textContent = `เป้าหมาย: ${targetPlayerName}`;

        const attackers = activePlayers.filter(id => id !== targetPlayerId);
        if (attackers.length === 0) { return; } 

        const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
        const attackerPlayerId = attackers[currentAttackerIndexInAttackers];
        const attackerPlayerName = players[attackerPlayerId].name;
        gameElements.turn.textContent = `ผู้ทาย: ${attackerPlayerName}`;

        const isMyTurn = attackerPlayerId === currentPlayerId;
        const amIDefeated = players[currentPlayerId]?.status === 'defeated';
        
        keypadElements.openBtn.style.display = (isMyTurn && !amIDefeated) ? 'block' : 'none';
        keypadElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        keypadElements.assassinateBtn.style.display = (isMyTurn && !amIDefeated) ? 'block' : 'none';

        gameElements.turn.style.color = 'var(--text-dark)';
        if (isMyTurn) {
            gameElements.turn.textContent += " (ตาของคุณ!)";
            gameElements.turn.style.color = 'var(--success-color-text)';
            playSound(sounds.yourTurn);
        }
        if (targetPlayerId === currentPlayerId) { 
            gameElements.turn.textContent = `คุณคือเป้าหมาย!`; 
            gameElements.turn.style.color = 'var(--danger-color-text)';
        }

        gameElements.timer.style.display = 'block';
        turnTimer = setInterval(() => {
            const serverTimeOffset = roomData.serverTimeOffset || 0;
            const estimatedServerTime = Date.now() + serverTimeOffset;
            const elapsed = (estimatedServerTime - turnStartTime) / 1000;
            const remaining = Math.max(0, config.turnTime - elapsed);
            gameElements.timer.textContent = Math.ceil(remaining);
            if (remaining <= 0) { 
                clearInterval(turnTimer); 
                if (isMyTurn) handleTimeOut(attackerPlayerId); 
            }
        }, 500);

        updatePersonalHistory(roomData);
    }

    function handleAction(isAssassination) {
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            const { playerOrder, players, targetPlayerIndex, attackerTurnIndex } = roomData;
            const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
            const targetPlayerId = activePlayers[targetPlayerIndex % activePlayers.length];
            const attackers = activePlayers.filter(id => id !== targetPlayerId);
            const attackerPlayerId = attackers[attackerTurnIndex % attackers.length];

            const isMyTurn = attackerPlayerId === currentPlayerId;
            const amIDefeated = players[currentPlayerId]?.status === 'defeated';
            if (!isMyTurn || amIDefeated) {
                console.log("ไม่ใช่ตาของคุณ ไม่สามารถทายได้");
                return;
            }

            if (currentInput.length !== roomData.config.digitCount) {
                alert(`ต้องใส่เลข ${roomData.config.digitCount} หลัก`);
                return;
            }

            playSound(sounds.click);

            const targetPlayer = players[targetPlayerId];
            const { bulls, cows } = calculateHints(currentInput, targetPlayer.secretNumber);
            const isCorrect = bulls === roomData.config.digitCount;

            let updates = {};
            updates[`/players/${currentPlayerId}/lastGuess`] = { guess: currentInput, timestamp: firebase.database.ServerValue.TIMESTAMP };
            updates[`/guessHistory/${database.ref().push().key}`] = { attackerId: currentPlayerId, targetId: targetPlayerId, guess: currentInput, bulls, cows, isAssassination, timestamp: firebase.database.ServerValue.TIMESTAMP };
            updates[`/players/${currentPlayerId}/stats/guesses`] = (players[currentPlayerId].stats.guesses || 0) + 1;

            if (isCorrect) {
                updates[`/players/${currentPlayerId}/stats/correctGuesses`] = (players[currentPlayerId].stats.correctGuesses || 0) + 1;
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
            }

            roomRef.update(updates).then(moveToNextTurn);
            currentInput = '';
            gameElements.gameDisplay.textContent = '';
            keypadElements.modal.style.display = 'none';
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

    // --- UI Updates ---
    function updatePlayerList(roomData) {
        const { players } = roomData;
        gameElements.playerList.innerHTML = '';
        if (!players) return;
        Object.entries(players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'player-item';
            if (player.status === 'defeated') item.classList.add('player-defeated');

            const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
            const readyStatus = roomData.status === 'waiting' ? (player.isReady ? `<span class="ready-status-ready">พร้อมแล้ว</span>` : `<span class="ready-status-waiting">กำลังรอ...</span>`) : hpBar;

            let recentGuessHTML = '';
            if (id !== currentPlayerId && player.lastGuess && (Date.now() - player.lastGuess.timestamp < 3000)) {
                recentGuessHTML = `<span class="recent-guess">${player.lastGuess.guess}</span>`;
            }

            item.innerHTML = `<div class="player-info"><span>${player.name}</span></div> ${readyStatus} ${recentGuessHTML}`;
            gameElements.playerList.appendChild(item);
        });
    }
    function updatePersonalHistory(roomData) {
        const { players, guessHistory } = roomData;
        historyElements.body.innerHTML = '';
        historyElements.preview.innerHTML = '';
        if (!guessHistory || !players) return;

        const myGuesses = Object.values(guessHistory)
            .filter(log => log.attackerId === currentPlayerId)
            .sort((a, b) => b.timestamp - a.timestamp);

        myGuesses.slice(0, 3).forEach(log => {
            const previewItem = document.createElement('div');
            previewItem.className = 'history-preview-item';
            const hints = `<div><span class="hint-bull">${log.bulls}</span><span class="hint-cow">${log.cows}</span></div>`;
            previewItem.innerHTML = `<span>${log.guess}</span> → ${hints}`;
            historyElements.preview.appendChild(previewItem);
        });

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
            table.innerHTML = `<thead><tr><th>เลขที่ทาย</th><th>ถูก (Bulls)</th><th>เพี้ยน (Cows)</th></tr></thead>`;
            const tbody = document.createElement('tbody');
            logs.forEach(log => {
                const row = document.createElement('tr');
                row.innerHTML = `<td class="history-guess">${log.guess} ${log.isAssassination ? '💀' : ''}</td><td><span class="hint-bull">${log.bulls}</span></td><td><span class="hint-cow">${log.cows}</span></td>`;
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
        chatElements.marqueeContainer.innerHTML = '';
        const marquee = document.createElement('div');
        marquee.className = 'chat-marquee-item';
        marquee.textContent = `${msg.senderName}: ${msg.text}`;
        chatElements.marqueeContainer.appendChild(marquee);
        setTimeout(() => marquee.remove(), 5500);
    }

    // --- End Game Logic ---
    function endGame(roomData) {
        if (turnTimer) clearInterval(turnTimer);
        if (roomData.winnerName !== "ไม่มีผู้ชนะ") playSound(sounds.win);
        const titles = assignTitles(roomData);
        showTitleCards(roomData, titles, () => showSummaryPage(roomData, titles));
    }

    const allTitles = [
        { emoji: '🤓', title: 'นักวิเคราะห์ตัวเลข', desc: 'ทุกการทายคือการคำนวณมาอย่างดี' },
        { emoji: '🧐', title: 'เชอร์ล็อก โฮล์มส์', desc: 'ไม่มีปริศนาไหนรอดพ้นสายตาคุณได้' },
        { emoji: '💣', title: 'มือระเบิดพลีชีพ', desc: 'ทายผิดแล้วพาตัวเองลงหลุมไปด้วย' },
        { emoji: '🐢', title: 'ผู้เดินอย่างมั่นคง', desc: 'ช้าๆ แต่มั่นใจ...มั้งนะ' },
        { emoji: '⚡️', title: 'สายฟ้าฟาด', desc: 'คิดเร็ว ทำเร็ว แพ้เร็ว' },
        { emoji: '😇', title: 'ผู้เล่นสายบุญ', desc: 'ไม่เคยคิดร้ายกับใครเลย (จริงๆนะ)' },
        { emoji: '😈', title: 'ซาตานในคราบนักบุญ', desc: 'ดูเหมือนจะใจดี แต่พร้อมเชือดเสมอ' },
        { emoji: '🎯', title: 'นักแม่นเป้า', desc: 'ทายแม่นเหมือนจับวาง' },
        { emoji: '🎰', title: 'เจ้ามือหวยเถื่อน', desc: 'ใบ้เลขเก่ง แต่ทายเองไม่เคยถูก' },
        { emoji: '🗿', title: 'รูปปั้นหิน', desc: 'นิ่งสงบ สยบทุกความเคลื่อนไหว' },
        { emoji: '🤡', title: 'มือสังหารจอมพลาดเป้า', desc: 'เกือบจะเท่แล้ว...ถ้าไม่พลาดเอง', condition: (stats) => stats.assassinateFails > 1 },
        { emoji: '🐌', title: 'นักคิดแห่งยุค', desc: 'คิดนานจนเพื่อนหลับหมดแล้ว', condition: (stats) => stats.timeOuts > 1 },
        { emoji: '👻', title: 'ผู้ไร้ตัวตน', desc: 'มาเล่นจริงๆ ใช่ไหม?', condition: (stats) => stats.guesses === 0 },
        { emoji: '💥', title: 'มือสังหารเลือดร้อน', desc: 'ตุยเย่คือทางออกเดียว!', condition: (stats) => stats.assassinateFails > 0 && stats.correctGuesses > 0 },
        { emoji: '🧠', title: 'จอมวางแผน', desc: 'ทุกการคาดเดามีความหมาย', condition: (stats) => stats.guesses > 10 },
        { emoji: '🍀', title: 'ผู้ถูกเลือกให้ผิดหวัง', desc: 'ทายเกือบถูก...แต่อีกนิดเดียว', condition: (stats) => stats.guesses > 5 && stats.correctGuesses === 0 },
        { emoji: '🥷', title: 'นินจาล่องหน', desc: 'มาเงียบๆ แต่ฟาดเรียบนะจ๊ะ', condition: (stats) => stats.correctGuesses > 1 },
        { emoji: '🧑‍⚖️', title: 'ผู้พิพากษา', desc: 'ตัดสินชะตาชีวิตของผู้อื่น', condition: (stats) => stats.correctGuesses > 0 },
        { emoji: '🙏', title: 'สายมูเตลู', desc: 'อาศัยดวงล้วนๆ ไม่สนหลักการ', condition: (stats) => stats.guesses > 0 && Math.random() > 0.5 },
        { emoji: '👨‍🔬', title: 'นักทดลอง', desc: 'ลองทุกความเป็นไปได้...ยกเว้นเลขที่ถูก', condition: (stats) => stats.guesses > 8 }
    ];

    function assignTitles(roomData) {
        const { players } = roomData;
        let assignedTitles = {};
        let availableTitles = [...allTitles];
        const playerIds = Object.keys(players);

        const winnerId = playerIds.find(id => players[id].name === roomData.winnerName);
        if (winnerId) {
            assignedTitles[winnerId] = { emoji: '👑', title: 'ผู้รอดชีวิตหนึ่งเดียว', desc: 'ยืนหนึ่งอย่างสมศักดิ์ศรี!' };
        }

        playerIds.forEach(id => {
            if (assignedTitles[id]) return;
            const stats = players[id].stats || { guesses: 0, assassinateFails: 0, timeOuts: 0, correctGuesses: 0 };
            for (let i = 0; i < availableTitles.length; i++) {
                const title = availableTitles[i];
                if (title.condition && title.condition(stats)) {
                    assignedTitles[id] = { emoji: title.emoji, title: title.title, desc: title.desc };
                    availableTitles.splice(i, 1);
                    return;
                }
            }
        });

        playerIds.forEach(id => {
            if (assignedTitles[id]) return;
            if (availableTitles.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableTitles.length);
                const randomTitle = availableTitles[randomIndex];
                assignedTitles[id] = { emoji: randomTitle.emoji, title: randomTitle.title, desc: randomTitle.desc };
                availableTitles.splice(randomIndex, 1);
            } else {
                assignedTitles[id] = { emoji: '🪦', title: 'ผู้ล่วงลับ', desc: 'พยายามได้ดีมากแล้วเพื่อน' };
            }
        });
        return assignedTitles;
    }

    function showTitleCards(roomData, titles, onComplete) {
        const winnerId = Object.keys(roomData.players).find(id => roomData.players[id].name === roomData.winnerName);
        const otherPlayerIds = Object.keys(titles).filter(id => id !== winnerId);
        const playerIdsInOrder = winnerId ? [winnerId, ...otherPlayerIds] : Object.keys(titles);
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
            setTimeout(() => summaryElements.titleCardOverlay.classList.add('visible'), 10);

            setTimeout(() => {
                summaryElements.titleCardOverlay.classList.remove('visible');
                setTimeout(() => {
                    currentIndex++;
                    showNextCard();
                }, 500);
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
            const title = titles[id] ? `<span class="player-title">${titles[id].title}</span>` : '';
            const status = player.name === roomData.winnerName ? 'ชนะ' : 'แพ้';
            item.innerHTML = `
                <div class="summary-player-info">
                    <span class="summary-player-name">${player.name}</span>
                    ${title}
                </div> 
                <span class="summary-player-status">${status}</span>`;
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
        document.body.classList.remove('is-spectator');
        navigateTo('preLobby');
    }

    function handleReadyUp() {
        playSound(sounds.click);
        if (!playerRef) return;
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            let secretNumber = '';
            const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
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

    // --- Settings Logic ---
    function applySettings() {
        if (settings.isBgmEnabled && hasInteracted) sounds.background.play().catch(e => {});
        else sounds.background.pause();
        document.body.classList.toggle('night-mode', settings.isNightMode);
        localStorage.setItem('gameSettings', JSON.stringify(settings));
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem('gameSettings');
        if (savedSettings) {
            settings = JSON.parse(savedSettings);
            settingsElements.toggleBgm.checked = settings.isBgmEnabled;
            settingsElements.toggleSfx.checked = settings.isSfxEnabled;
            settingsElements.toggleTheme.checked = settings.isNightMode;
        }
        applySettings();
    }

    // --- Event Listeners ---
    buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
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
        if (settings.isBgmEnabled) sounds.background.pause();
        hasInteracted = false;
        leaveRoom();
        navigateTo('home');
    });
    buttons.playAgain.addEventListener('click', () => { playSound(sounds.click); navigateTo('preLobby'); });
    inputs.chat.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendChat(); });
    keypadElements.keypad.addEventListener('click', handleKeypadClick);

    historyElements.toggleBtn.addEventListener('click', () => { playSound(sounds.click); historyElements.overlay.style.display = 'flex'; });
    historyElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); historyElements.overlay.style.display = 'none'; });
    historyElements.overlay.addEventListener('click', (e) => { if (e.target === historyElements.overlay) { playSound(sounds.click); historyElements.overlay.style.display = 'none'; } });

    chatElements.toggleBtn.addEventListener('click', () => {
        playSound(sounds.click);
        chatElements.overlay.style.display = 'flex';
        isChatOpen = true;
        setTimeout(() => chatElements.body.scrollTop = chatElements.body.scrollHeight, 0);
    });
    chatElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); chatElements.overlay.style.display = 'none'; isChatOpen = false; });
    chatElements.overlay.addEventListener('click', (e) => { if (e.target === chatElements.overlay) { playSound(sounds.click); chatElements.overlay.style.display = 'none'; isChatOpen = false; } });

    settingsElements.toggleBtn.addEventListener('click', () => { playSound(sounds.click); settingsElements.overlay.style.display = 'flex'; });
    settingsElements.closeBtn.addEventListener('click', () => { playSound(sounds.click); settingsElements.overlay.style.display = 'none'; });
    settingsElements.overlay.addEventListener('click', (e) => { if (e.target === settingsElements.overlay) { playSound(sounds.click); settingsElements.overlay.style.display = 'none'; } });
    settingsElements.toggleBgm.addEventListener('change', (e) => { settings.isBgmEnabled = e.target.checked; applySettings(); });
    settingsElements.toggleSfx.addEventListener('change', (e) => { settings.isSfxEnabled = e.target.checked; applySettings(); });
    settingsElements.toggleTheme.addEventListener('change', (e) => { settings.isNightMode = e.target.checked; applySettings(); });

    keypadElements.openBtn.addEventListener('click', () => {
        playSound(sounds.click);
        keypadElements.modal.style.display = 'flex';
    });
    keypadElements.closeBtn.addEventListener('click', () => {
        playSound(sounds.click);
        keypadElements.modal.style.display = 'none';
    });
    keypadElements.modal.addEventListener('click', (e) => {
        if (e.target === keypadElements.modal) {
            playSound(sounds.click);
            keypadElements.modal.style.display = 'none';
        }
    });

    // --- Initial Load ---
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) inputs.playerName.value = savedPlayerName;
    loadSettings();
    navigateTo('home');
});
