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

document.addEventListener('DOMContentLoaded', () => {

    // --- Sound Effects ---
    const sounds = {
        background: new Audio('sounds/background-music.mp3'),
        click: new Audio('sounds/click.mp3'),
        win: new Audio('sounds/win-wow.mp3'),
        wrong: new Audio('sounds/wrong-answer.mp3'),
        yourTurn: new Audio('sounds/your-turn.mp3')
    };
    // ตั้งค่าเสียงพื้นหลัง
    sounds.background.loop = true;
    sounds.background.volume = 0.3;

    // ฟังก์ชันกลางสำหรับเล่นเสียง
    function playSound(sound) {
        if (!hasInteracted) return; // ถ้าผู้ใช้ยังไม่เคยกดอะไรเลย จะยังไม่เล่นเสียง
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
            sounds.background.play().catch(e => console.log("ไม่สามารถเล่นเพลงพื้นหลังได้:", e));
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
                playerRef.set({ name: playerName, isReady: false, hp: 3, status: 'playing', stats: { guesses: 0, assassinateFails: 0, timeOuts: 0 } });
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

    // --- New Animation Function ---
    function animateAttack(attackerId, targetId) {
        const container = document.getElementById('attack-animation-container');
        const attackerEl = document.getElementById(`player-${attackerId}`);
        const targetEl = document.getElementById(`player-${targetId}`);
        container.innerHTML = ''; // เคลียร์อนิเมชันเก่าทิ้ง

        if (!attackerEl || !targetEl) return;

        // คำนวณตำแหน่งกึ่งกลางของแต่ละช่อง
        const attackerRect = attackerEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const containerRect = container.parentElement.getBoundingClientRect(); // ใช้ parentElement (player-list)

        const startX = attackerRect.left + attackerRect.width / 2 - containerRect.left;
        const startY = attackerRect.top + attackerRect.height / 2 - containerRect.top;
        const endX = targetRect.left + targetRect.width / 2 - containerRect.left;
        const endY = targetRect.top + targetRect.height / 2 - containerRect.top;

        // สร้าง Path สำหรับให้ > วิ่งตาม
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // ปรับเส้นโค้งให้สวยขึ้นเล็กน้อย
        const controlX = (startX + endX) / 2;
        const controlY = (startY + endY) / 2 - (Math.abs(startY - endY) < 50 ? 50 : 0); // ทำให้โค้งออกถ้าอยู่แถวเดียวกัน
        path.setAttribute('d', `M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`);
        path.setAttribute('id', 'arrow-path');
        path.style.display = 'none'; // ไม่ต้องแสดงเส้น Path

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        svg.style.overflow = 'visible'; // ให้ลูกศรวิ่งนอกกรอบได้
        svg.appendChild(path);
        container.appendChild(svg);

        // สร้างลูกศร > จำนวน 5 ตัวให้วิ่งตามกัน
        for (let i = 0; i < 5; i++) {
            const arrow = document.createElement('div');
            arrow.className = 'attack-arrow';
            arrow.textContent = '>';
            arrow.style.offsetPath = `path("${path.getAttribute('d')}")`;
            arrow.style.animationDelay = `${i * 0.2}s`; // ทำให้ลูกศรแต่ละตัวเริ่มวิ่งไม่พร้อมกัน
            container.appendChild(arrow);
        }
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
            updatePlayerList(roomData); // อัปเดต Player List ก่อนเสมอ
            updateChat(roomData.chat);

            const myPlayer = roomData.players[currentPlayerId];

            if (roomData.status === 'finished') {
                defeatedOverlay.style.display = 'none';
            } else if (myPlayer) {
                defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';
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
        if (playerIds.length < 2) return;
        const allReady = Object.values(players).every(p => p.isReady);
        if (allReady) startGame(playerIds);
    }

    function startGame(playerIds) {
        // สลับลำดับผู้เล่นแบบสุ่มเมื่อเริ่มเกม
        const shuffledPlayerIds = playerIds.sort(() => Math.random() - 0.5);
        roomRef.update({ status: 'playing', playerOrder: shuffledPlayerIds, targetPlayerIndex: 0, attackerTurnIndex: 0, turnStartTime: firebase.database.ServerValue.TIMESTAMP });
    }

    // --- Game Logic (Part 2) & UI Updates ---

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
        if (activePlayers.length <= 1) return; // หยุดถ้าผู้เล่นไม่พอ

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

        // เรียกใช้ฟังก์ชันอนิเมชัน
        // ใช้ setTimeout เล็กน้อยเพื่อให้ DOM อัปเดตตำแหน่งก่อนคำนวณ
        setTimeout(() => animateAttack(attackerPlayerId, targetPlayerId), 100);

        const isMyTurn = attackerPlayerId === currentPlayerId;
        const amIDefeated = players[currentPlayerId]?.status === 'defeated';
        gameElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        buttons.assassinate.style.display = isMyTurn && !amIDefeated ? 'block' : 'none';

        gameElements.turn.style.color = isMyTurn ? 'var(--success-color)' : 'var(--dark-color)';
        if (isMyTurn) {
            gameElements.turn.textContent += " (ตาของคุณ!)";
            playSound(sounds.yourTurn);
        }
        if (targetPlayerId === currentPlayerId) {
            gameElements.target.textContent = `คุณคือเป้าหมาย!`;
            gameElements.target.style.color = 'var(--danger-color)';
        } else {
            gameElements.target.style.color = 'var(--dark-color)';
        }


        gameElements.timer.style.display = 'block';
        turnTimer = setInterval(() => {
            const elapsed = (Date.now() - turnStartTime) / 1000;
            const remaining = Math.max(0, config.turnTime - elapsed);
            gameElements.timer.textContent = Math.ceil(remaining);
            if (remaining <= 0) { clearInterval(turnTimer); if (isMyTurn) handleTimeOut(attackerPlayerId); }
        }, 500);

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
                    playSound(sounds.win); // เล่นเสียงเมื่อทายถูก
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
                // เมื่อวนครบรอบผู้ทาย ให้เปลี่ยนเป้าหมาย
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
        // Check for Bulls (correct digit in correct position)
        for (let i = guessChars.length - 1; i >= 0; i--) {
            if (guessChars[i] === secretChars[i]) {
                bulls++;
                secretChars.splice(i, 1);
                guessChars.splice(i, 1);
            }
        }
        // Check for Cows (correct digit in wrong position)
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

    // --- UI Update Functions ---
    function updatePlayerList(roomData) {
        const { players, status, playerOrder, targetPlayerIndex, attackerTurnIndex } = roomData;
        const playerListEl = gameElements.playerList;
        // เคลียร์เฉพาะผู้เล่น แต่เก็บ container ของอนิเมชันไว้
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
                    const currentAttackerIndexInAttackers = attackerTurnIndex % attackers.length;
                    attackerPlayerId = attackers[currentAttackerIndexInAttackers];
                }
            }
        }

        // ใช้ playerOrder ถ้ามี เพื่อให้ลำดับคงที่
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
            const readyStatus = roomData.status === 'waiting' ? (player.isReady ? `<span style="color:var(--success-color);">พร้อมแล้ว</span>` : `<span>กำลังรอ...</span>`) : hpBar;

            let recentGuessHTML = '';
            if (player.lastGuess && (Date.now() - player.lastGuess.timestamp < 3000)) {
                recentGuessHTML = `<span class="recent-guess">${player.lastGuess.guess}</span>`;
            }

            item.innerHTML = `
                <div class="player-info">${player.name}</div>
                ${recentGuessHTML}
                <div style="margin-top: auto;">${readyStatus}</div>
            `;
            playerListEl.appendChild(item);
        });
    }


    function updatePersonalHistory(roomData) {
        const { players, guessHistory } = roomData;
        historyElements.body.innerHTML = '';
        if (!guessHistory || !players) return;

        const myGuesses = Object.values(guessHistory).filter(log => log.attackerId === currentPlayerId);

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
            table.innerHTML = `<thead><tr><th>เลขที่ทาย</th><th>ผล (Bulls/Cows)</th></tr></thead>`;
            const tbody = document.createElement('tbody');
            logs.sort((a, b) => b.timestamp - a.timestamp).forEach(log => { // เรียงใหม่ไปเก่า
                const row = document.createElement('tr');
                const hints = `<span class="hint-bull">${log.bulls}B</span> <span class="hint-cow">${log.cows}C</span>`;
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
        setTimeout(() => marquee.remove(), 5900); // ลบก่อน animation จบเล็กน้อย
    }

    // --- End Game Logic ---
    function endGame(roomData) {
        if (turnTimer) clearInterval(turnTimer);
        document.getElementById('attack-animation-container').innerHTML = ''; // หยุดอนิเมชัน

        if (roomData.winnerName !== "ไม่มีผู้ชนะ") {
            playSound(sounds.win);
        }

        const titles = assignTitles(roomData);

        showTitleCards(roomData, titles, () => {
            showSummaryPage(roomData, titles);
        });
    }

    function assignTitles(roomData) {
        const { players } = roomData;
        let titles = {};
        Object.entries(players).forEach(([id, player]) => {
            const stats = player.stats || { guesses: 0, assassinateFails: 0, timeOuts: 0 };
            if (player.name === roomData.winnerName && roomData.winnerName !== "ไม่มีผู้ชนะ") {
                titles[id] = { emoji: '👑', title: 'ผู้รอดชีวิตหนึ่งเดียว', desc: 'ยืนหนึ่งอย่างสมศักดิ์ศรี!' };
            } else if (stats.assassinateFails > 1) {
                titles[id] = { emoji: '🤡', title: 'มือสังหารจอมพลาดเป้า', desc: 'เกือบจะเท่แล้ว...ถ้าไม่พลาดเอง' };
            } else if (stats.timeOuts > 1) {
                titles[id] = { emoji: '🐌', title: 'นักคิดแห่งยุค', desc: 'คิดนานจนเพื่อนหลับหมดแล้ว' };
            } else if (stats.guesses === 0 && player.status === 'defeated') {
                titles[id] = { emoji: '👻', title: 'ผู้ไร้ตัวตน', desc: 'มาเล่นจริงๆ ใช่ไหม?' };
            } else {
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
            }, 4000);
        }
        showNextCard();
    }

    function showSummaryPage(roomData, titles) {
        summaryElements.winner.textContent = `ผู้ชนะคือ: ${roomData.winnerName}`;
        summaryElements.playerList.innerHTML = '';
        Object.entries(roomData.players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'player-item';
            const title = titles[id] ? `<span class="player-title">${titles[id].title}</span>` : '';
            item.innerHTML = `<div>${player.name}<br>${title}</div> <span>${player.name === roomData.winnerName ? 'ชนะ' : 'แพ้'}</span>`;
            summaryElements.playerList.appendChild(item);
        });
        navigateTo('summary');
    }

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
            if (currentInput.length < digitCount