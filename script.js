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
let isChatOpen = false, isBgmEnabled = true, isSfxEnabled = true;
let hasInteracted = false;
let isGameEnding = false;

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
        if (sound === sounds.background && !isBgmEnabled) return;
        if (sound !== sounds.background && !isSfxEnabled) return;
        sound.currentTime = 0;
        sound.play().catch(e => console.log("ไม่สามารถเล่นเสียงได้:", e));
    }

    // --- DOM Elements ---
    const pages = {
        home: document.getElementById('page-home'),
        preLobby: document.getElementById('page-pre-lobby'),
        lobbyCreate: document.getElementById('page-lobby-create'),
        lobbyJoin: document.getElementById('page-lobby-join'),
        lobbyWait: document.getElementById('page-lobby-wait'),
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
        leaveRoomFromLobby: document.getElementById('btn-leave-room-from-lobby'),
        leaveRoomFromGame: document.getElementById('btn-leave-room-from-game'),
        readyUp: document.getElementById('btn-ready-up'),
        delete: document.getElementById('btn-delete'),
        guess: document.getElementById('btn-guess'),
        assassinate: document.getElementById('btn-assassinate'),
        chatSend: document.getElementById('chat-send-btn'),
        backToHome: document.getElementById('btn-back-to-home'),
        playAgain: document.getElementById('btn-play-again')
    };
    const lobbyWaitElements = {
        roomName: document.getElementById('lobby-wait-room-name'),
        playerCount: document.getElementById('lobby-wait-player-count'),
        playerList: document.getElementById('lobby-wait-player-list'),
        setupSection: document.getElementById('lobby-wait-setup-section'),
        waitingSection: document.getElementById('lobby-wait-waiting-section'),
    };
    const gameElements = {
        turnInfoText: document.getElementById('turn-info-text'),
        playerList: document.getElementById('game-player-list'),
        mySecretNumber: document.getElementById('my-secret-number-display'),
        timerBar: document.getElementById('timer-bar'),
        gameDisplay: document.getElementById('game-display'),
        keypad: document.querySelector('.keypad'),
        arrowContainer: document.getElementById('arrow-animation-container')
    };
    const historyElements = {
        toggleBtn: document.getElementById('history-toggle-btn'),
        quickDisplay: document.getElementById('quick-history-display'),
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
        winnerInfo: document.getElementById('summary-winner-info'),
        winnerName: document.getElementById('summary-winner-name'),
        playerList: document.getElementById('summary-player-list'),
        winnerAnnouncementOverlay: document.getElementById('winner-announcement-overlay'),
        winnerAnnouncementName: document.getElementById('winner-announcement-name'),
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
        if (pages[pageName]) pages[pageName].style.display = 'flex';
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
        const roomData = {
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
        };
        newRoomRef.set(roomData).then(() => joinRoom(currentRoomId, roomName));
    }

    function joinRoom(roomId, roomName) {
        playSound(sounds.click);
        currentRoomId = roomId;
        roomRef = database.ref(`rooms/${currentRoomId}`);
        roomRef.child('players').once('value', snapshot => {
            roomRef.child('config').once('value', configSnapshot => {
                const config = configSnapshot.val();
                if (snapshot.numChildren() >= config.maxPlayers) {
                    alert('ขออภัย, ห้องนี้เต็มแล้ว');
                    return;
                }
                playerRef = database.ref(`rooms/${currentRoomId}/players/${currentPlayerId}`);
                const initialStats = { guesses: 0, assassinateFails: 0, timeOuts: 0, correctGuesses: 0, assassinateSuccess: 0 };
                playerRef.set({ name: playerName, isReady: false, hp: 3, status: 'playing', stats: initialStats });
                playerRef.onDisconnect().remove();
                lobbyWaitElements.roomName.textContent = `ห้อง: ${roomName}`;
                listenToRoomUpdates();
                navigateTo('lobbyWait');
            });
        });
    }

    function listenToRooms() {
        database.ref('rooms').on('value', snapshot => {
            const roomListContainer = document.getElementById('room-list-container');
            roomListContainer.innerHTML = '';
            const rooms = snapshot.val();
            if (rooms) {
                Object.entries(rooms).forEach(([id, room]) => {
                    const playerCount = Object.keys(room.players || {}).length;
                    if (room.status === 'waiting' && playerCount < room.config.maxPlayers) {
                        const item = document.createElement('div');
                        item.className = 'room-item';
                        item.innerHTML = `
                            <div class="room-item-name">${room.name}</div>
                            <div class="room-item-details">
                                <span>${playerCount}/${room.config.maxPlayers} คน</span>
                                <span>${room.config.digitCount} หลัก</span>
                            </div>
                        `;
                        item.onclick = () => joinRoom(id, room.name);
                        roomListContainer.appendChild(item);
                    }
                });
            }
            if (roomListContainer.innerHTML === '') {
                roomListContainer.innerHTML = '<p>ยังไม่มีห้องว่างในขณะนี้</p>';
            }
        });
    }

    // --- Game Logic ---
    function listenToRoomUpdates() {
        if (!roomRef) return;
        if (roomListener) roomRef.off('value', roomListener);

        roomListener = roomRef.on('value', snapshot => {
            if (!snapshot.exists()) {
                alert('ห้องถูกปิดแล้ว หรือคุณถูกตัดการเชื่อมต่อ');
                leaveRoom(true);
                return;
            }
            const roomData = snapshot.val();
            const myPlayer = roomData.players ? roomData.players[currentPlayerId] : null;

            updatePlayerList(roomData);
            updateChat(roomData.chat);
            if (myPlayer) {
                defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';
            }

            if (roomData.status === 'waiting') {
                isGameEnding = false;
                navigateTo('lobbyWait');
                updateLobbyWaitUI(roomData);
                checkIfGameCanStart(roomData);
            } else if (roomData.status === 'playing') {
                navigateTo('game');
                updateGameUI(roomData);
            } else if (roomData.status === 'finished') {
                if (!isGameEnding) {
                    isGameEnding = true;
                    fullEndGameSequence(roomData);
                }
            }
        });
    }

    function updateLobbyWaitUI(roomData) {
        const players = roomData.players || {};
        const playerCount = Object.keys(players).length;
        const maxPlayers = roomData.config.maxPlayers;
        lobbyWaitElements.playerCount.textContent = `กำลังรอผู้เล่น... (${playerCount}/${maxPlayers})`;

        const myPlayer = players[currentPlayerId];
        if (myPlayer) {
            lobbyWaitElements.setupSection.style.display = myPlayer.isReady ? 'none' : 'block';
            lobbyWaitElements.waitingSection.style.display = myPlayer.isReady ? 'block' : 'none';
        }
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
        const { playerOrder, players, targetPlayerIndex, attackerTurnIndex, config, turnStartTime, guessHistory } = roomData;
        const myPlayer = players[currentPlayerId];

        if (myPlayer && myPlayer.secretNumber) {
            gameElements.mySecretNumber.textContent = myPlayer.secretNumber;
        }

        const activePlayers = playerOrder.filter(id => players[id] && players[id].status === 'playing');
        if (activePlayers.length < 2) {
            const winner = activePlayers.length === 1 ? activePlayers[0] : null;
            if (winner) {
                roomRef.update({ status: 'finished', winnerId: winner });
            } else {
                roomRef.update({ status: 'finished', winnerId: null });
            }
            return;
        }

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

        gameElements.turnInfoText.textContent = isMyTurn ? `ถึงตาคุณแล้ว! (เป้าหมาย: ${targetPlayer.name})` : `ตาของ ${attackerPlayer.name} (เป้าหมาย: ${targetPlayer.name})`;
        gameElements.keypad.classList.toggle('disabled', !isMyTurn || amIDefeated);
        buttons.assassinate.style.display = isMyTurn && !amIDefeated ? 'block' : 'none';

        drawArrow(attackerPlayerId, targetPlayerId);
        updateQuickHistory(guessHistory, attackerPlayerId, targetPlayerId);

        if (turnTimer) clearInterval(turnTimer);
        turnTimer = setInterval(() => {
            const elapsed = (Date.now() - turnStartTime) / 1000;
            const remainingPercent = Math.max(0, 100 - (elapsed / config.turnTime * 100));
            gameElements.timerBar.style.width = `${remainingPercent}%`;
            if (remainingPercent <= 0) {
                clearInterval(turnTimer);
                if (isMyTurn) handleTimeOut(attackerPlayerId);
            }
        }, 100);

        updatePersonalHistory(roomData);
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
            const targetPlayer = players[targetPlayerId];

            const { bulls, cows } = calculateHints(currentInput, targetPlayer.secretNumber);
            const isCorrect = bulls === config.digitCount;

            let updates = {};
            const newHistoryKey = database.ref().push().key;
            updates[`/guessHistory/${newHistoryKey}`] = {
                attackerId: currentPlayerId,
                targetId: targetPlayerId,
                guess: currentInput,
                bulls,
                cows,
                isAssassination,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            updates[`/players/${currentPlayerId}/stats/guesses`] = (players[currentPlayerId].stats.guesses || 0) + 1;

            if (isAssassination) {
                if (isCorrect) {
                    updates[`/players/${targetPlayerId}/status`] = 'defeated';
                    updates[`/players/${targetPlayerId}/hp`] = 0;
                    updates[`/players/${currentPlayerId}/stats/assassinateSuccess`] = (players[currentPlayerId].stats.assassinateSuccess || 0) + 1;
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
                    updates[`/players/${currentPlayerId}/stats/correctGuesses`] = (players[currentPlayerId].stats.correctGuesses || 0) + 1;
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
        const { players, status } = roomData;
        const playerListContainer = status === 'waiting' ? lobbyWaitElements.playerList : gameElements.playerList;
        playerListContainer.innerHTML = '';
        if (!players) return;

        Object.entries(players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.dataset.playerId = id;

            if (status === 'playing') {
                if (player.status === 'defeated') item.classList.add('is-defeated');
            }

            const hpBar = `<div class="hp-bar">${[...Array(3)].map((_, i) => `<div class="hp-point ${i < player.hp ? '' : 'lost'}"></div>`).join('')}</div>`;
            const readyStatus = status === 'waiting' ? (player.isReady ? `<span style="color:var(--success-color);">พร้อม</span>` : `<span style="opacity:0.7;">รอ...</span>`) : hpBar;

            item.innerHTML = `
                <div class="player-info">${player.name}</div>
                <div class="player-status">${readyStatus}</div>
            `;
            
            playerListContainer.appendChild(item);
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
            table.innerHTML = `<thead><tr><th>เลขที่ทาย</th><th>ผล</th></tr></thead>`;
            const tbody = document.createElement('tbody');
            logs.slice().reverse().forEach(log => {
                const row = document.createElement('tr');
                const hints = `
                    <span class="hint-bull">🟢 ${log.bulls}</span>
                    <span class="hint-cow">🟡 ${log.cows}</span>
                `;
                row.innerHTML = `<td class="history-guess">${log.guess} ${log.isAssassination ? '💀' : ''}</td><td>${hints}</td>`;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            section.appendChild(table);
            historyElements.body.appendChild(section);
        });
    }

    function updateQuickHistory(guessHistory, attackerId, targetId) {
        historyElements.quickDisplay.innerHTML = '';
        if (!guessHistory || attackerId !== currentPlayerId) return;

        const relevantGuesses = Object.values(guessHistory)
            .filter(log => log.attackerId === attackerId && log.targetId === targetId)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);

        if (relevantGuesses.length > 0) {
            relevantGuesses.forEach(log => {
                const item = document.createElement('div');
                item.className = 'quick-history-item';
                item.innerHTML = `
                    <span class="qh-guess">${log.guess}</span>
                    <span class="qh-hints">
                        <span>🟢 ${log.bulls}</span>
                        <span>🟡 ${log.cows}</span>
                    </span>
                `;
                historyElements.quickDisplay.appendChild(item);
            });
        } else {
            historyElements.quickDisplay.innerHTML = '<span>ยังไม่มีการทาย</span>';
        }
    }

    function drawArrow(attackerId, targetId) {
        gameElements.arrowContainer.innerHTML = '';
        const attackerElem = document.querySelector(`.player-item[data-player-id="${attackerId}"]`);
        const targetElem = document.querySelector(`.player-item[data-player-id="${targetId}"]`);

        if (attackerElem && targetElem) {
            const attackerRect = attackerElem.getBoundingClientRect();
            const targetRect = targetElem.getBoundingClientRect();

            const startX = attackerRect.left + attackerRect.width / 2;
            const startY = attackerRect.top + attackerRect.height / 2;
            const endX = targetRect.left + targetRect.width / 2;
            const endY = targetRect.top + targetRect.height / 2;

            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.classList.add('arrow-svg');
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
            polygon.style.fill = 'var(--danger-color)';
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
        setTimeout(() => marquee.remove(), 6000);
    }

    // --- End Game Logic ---
    async function fullEndGameSequence(roomData) {
        if (turnTimer) clearInterval(turnTimer);
        navigateTo('game'); // Ensure game page is visible for overlays
        defeatedOverlay.style.display = 'none'; // Hide defeated overlay

        await showWinnerAnnouncement(roomData);
        const titles = assignTitles(roomData);
        await showTitleCards(roomData, titles);
        showSummaryPage(roomData, titles);
    }

    function showWinnerAnnouncement(roomData) {
        return new Promise(resolve => {
            const winnerPlayer = roomData.players[roomData.winnerId];
            if (winnerPlayer) {
                playSound(sounds.win);
                summaryElements.winnerAnnouncementName.textContent = winnerPlayer.name;
                summaryElements.winnerAnnouncementOverlay.classList.add('visible');
            } else {
                summaryElements.winnerAnnouncementName.textContent = "ไม่มีผู้ชนะ";
                summaryElements.winnerAnnouncementOverlay.classList.add('visible');
            }
            setTimeout(() => {
                summaryElements.winnerAnnouncementOverlay.classList.remove('visible');
                setTimeout(resolve, 500); // Wait for fade out
            }, 4000);
        });
    }

    function assignTitles(roomData) {
        const { players, winnerId } = roomData;
        let titles = {};
        const playerArray = Object.entries(players).map(([id, data]) => ({ id, ...data }));

        playerArray.forEach(({ id, stats, name }) => {
            stats = stats || { guesses: 0, assassinateFails: 0, timeOuts: 0, correctGuesses: 0, assassinateSuccess: 0 };
            let assigned = false;

            if (id === winnerId) {
                if (stats.assassinateSuccess > 0) {
                    titles[id] = { emoji: '👑', title: 'ราชาแห่งนักฆ่า', desc: 'สังหารศัตรูและคว้าชัยชนะมาครอง!' };
                } else if (stats.hp === 3) {
                    titles[id] = { emoji: '🛡️', title: 'เกราะทองคำ', desc: 'ไม่มีใครทำดาเมจคุณได้เลย...แม้แต่คนเดียว' };
                } else {
                    titles[id] = { emoji: '🏆', title: 'ผู้รอดชีวิตหนึ่งเดียว', desc: 'ยืนหนึ่งอย่างสมศักดิ์ศรี!' };
                }
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
            if (!assigned && stats.guesses === 0) {
                titles[id] = { emoji: '👻', title: 'ผู้ไร้ตัวตน', desc: 'มาเล่นจริงๆ ใช่ไหม?' };
                assigned = true;
            }
            if (!assigned && stats.correctGuesses > 2) {
                titles[id] = { emoji: '🧠', title: 'นักสืบอัจฉริยะ', desc: 'อ่านใจคนอื่นได้ราวกับตาเห็น' };
                assigned = true;
            }
            if (!assigned) {
                titles[id] = { emoji: '🪦', title: 'ผู้ล่วงลับ', desc: 'พยายามได้ดีมากแล้วเพื่อน' };
            }
        });
        return titles;
    }

    function showTitleCards(roomData, titles) {
        return new Promise(resolve => {
            const playerIdsInOrder = Object.keys(titles);
            let currentIndex = 0;

            function showNextCard() {
                if (currentIndex >= playerIdsInOrder.length) {
                    summaryElements.titleCardOverlay.classList.remove('visible');
                    setTimeout(resolve, 500);
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
                    summaryElements.titleCardOverlay.classList.remove('visible');
                    setTimeout(() => {
                        currentIndex++;
                        showNextCard();
                    }, 500);
                }, 4000);
            }
            showNextCard();
        });
    }

    function showSummaryPage(roomData, titles) {
        const winnerPlayer = roomData.players[roomData.winnerId];
        summaryElements.winnerName.textContent = winnerPlayer ? winnerPlayer.name : "ไม่มีผู้ชนะ";
        summaryElements.playerList.innerHTML = '';

        Object.entries(roomData.players).forEach(([id, player]) => {
            const item = document.createElement('div');
            item.className = 'summary-player-item';
            const title = titles[id] ? `<div class="summary-player-title">${titles[id].emoji} ${titles[id].title}</div>` : '';
            const resultClass = id === roomData.winnerId ? 'win' : 'lose';
            const resultText = id === roomData.winnerId ? 'ชนะ' : 'แพ้';

            item.innerHTML = `
                <div>
                    <div class="summary-player-name">${player.name}</div>
                    ${title}
                </div>
                <div class="summary-player-result ${resultClass}">${resultText}</div>
            `;
            summaryElements.playerList.appendChild(item);
        });
        navigateTo('summary');
    }

    // --- General Functions ---
    function leaveRoom(isDisconnected = false) {
        if (!isDisconnected) playSound(sounds.click);
        if (playerRef) playerRef.onDisconnect().cancel();
        if (playerRef) playerRef.remove();
        if (roomRef && roomListener) roomRef.off('value', roomListener);
        if (turnTimer) clearInterval(turnTimer);

        playerRef = null; roomRef = null; roomListener = null; currentRoomId = null; currentInput = '';
        isGameEnding = false;

        navigateTo('preLobby');
    }

    function handleReadyUp() {
        playSound(sounds.click);
        if (!playerRef) return;
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            let secretNumber = '';
            const usedDigits = new Set();
            while (secretNumber.length < digitCount) {
                const digit = Math.floor(Math.random() * 10).toString();
                if (!usedDigits.has(digit)) {
                    secretNumber += digit;
                    usedDigits.add(digit);
                }
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

    // --- Event Listeners ---
    buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
    inputs.playerName.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGoToPreLobby(); });
    buttons.goToCreate.addEventListener('click', () => { playSound(sounds.click); navigateTo('lobbyCreate'); });
    buttons.goToJoin.addEventListener('click', handleGoToJoin);
    buttons.createRoom.addEventListener('click', createRoom);
    buttons.leaveRoomFromLobby.addEventListener('click', () => leaveRoom());
    buttons.leaveRoomFromGame.addEventListener('click', () => leaveRoom());
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
    buttons.playAgain.addEventListener('click', () => {
        playSound(sounds.click);
        leaveRoom();
    });

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

    function updateSoundSettings() {
        isBgmEnabled = localStorage.getItem('isBgmEnabled') !== 'false';
        isSfxEnabled = localStorage.getItem('isSfxEnabled') !== 'false';
        document.getElementById('bgm-toggle').checked = isBgmEnabled;
        document.getElementById('sfx-toggle').checked = isSfxEnabled;
        if (hasInteracted) {
            isBgmEnabled ? sounds.background.play() : sounds.background.pause();
        }
    }
    document.getElementById('bgm-toggle').addEventListener('change', (e) => {
        isBgmEnabled = e.target.checked;
        localStorage.setItem('isBgmEnabled', isBgmEnabled);
        updateSoundSettings();
    });
    document.getElementById('sfx-toggle').addEventListener('change', (e) => {
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
