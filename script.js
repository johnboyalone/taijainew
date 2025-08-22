document.addEventListener('DOMContentLoaded', () => {

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

    // --- Global State ---
    let currentPlayerId = null, playerName = '', currentRoomId = null, currentInput = '';
    let playerRef = null, roomRef = null, roomListener = null, turnTimer = null;
    let isChatOpen = false;
    let hasInteracted = false;
    let isBgmEnabled = localStorage.getItem('isBgmEnabled') !== 'false';
    let isSfxEnabled = localStorage.getItem('isSfxEnabled') !== 'false';

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

    function playSound(sound, forceBgm = false) {
        if (!hasInteracted) return;
        const isEffect = sound !== sounds.background;
        if ((isEffect && isSfxEnabled) || (!isEffect && isBgmEnabled)) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Audio play failed:", e));
        }
    }

    function updateSoundSettings() {
        settingsElements.toggleBgm.checked = isBgmEnabled;
        settingsElements.toggleSfx.checked = isSfxEnabled;
        if (isBgmEnabled && hasInteracted) {
            sounds.background.play().catch(e => console.log("BGM play failed:", e));
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
        chat: document.getElementById('chat-input')
    };
    const buttons = {
        goToPreLobby: document.getElementById('btn-go-to-pre-lobby'),
        goToCreate: document.getElementById('btn-go-to-create'),
        goToJoin: document.getElementById('btn-go-to-join'),
        createRoom: document.getElementById('btn-create-room'),
        leaveRoom: document.getElementById('btn-leave-room'),
        leaveRoomSetup: document.getElementById('btn-leave-room-setup'),
        readyUp: document.getElementById('btn-ready-up'),
        delete: document.getElementById('btn-delete'),
        guess: document.getElementById('btn-guess'),
        assassinate: document.getElementById('btn-assassinate'),
        chatSend: document.getElementById('chat-send-btn'),
        backToHome: document.getElementById('btn-back-to-home'),
        playAgain: document.getElementById('btn-play-again')
    };
    const gameElements = {
        setupSection: document.getElementById('setup-section'),
        waitingSection: document.getElementById('waiting-section'),
        gameplaySection: document.getElementById('gameplay-section'),
        playerListWaiting: document.getElementById('player-list-waiting'),
        playerListWaiting2: document.getElementById('player-list-waiting-2'),
        turn: document.getElementById('game-turn-indicator'),
        target: document.getElementById('game-target-indicator'),
        playerList: document.getElementById('player-list'),
        mySecretNumber: document.getElementById('my-secret-number-text'),
        timerBar: document.getElementById('timer-bar'),
        gameDisplay: document.getElementById('game-display'),
        keypad: document.getElementById('game-keypad')
    };
    const settingsElements = {
        openBtnHome: document.getElementById('btn-open-settings-home'),
        overlay: document.getElementById('settings-modal-overlay'),
        closeBtn: document.getElementById('settings-close-btn'),
        toggleBgm: document.getElementById('toggle-bgm'),
        toggleSfx: document.getElementById('toggle-sfx')
    };

    // --- Navigation ---
    function navigateTo(pageName) {
        Object.values(pages).forEach(p => p.style.display = 'none');
        if (pages[pageName]) {
            pages[pageName].style.display = 'block';
            if (pageName === 'game') {
                pages[pageName].style.display = 'flex';
            }
        }
    }

    function handleFirstInteraction() {
        if (hasInteracted) return;
        hasInteracted = true;
        updateSoundSettings();
    }

    // --- Lobby Logic ---
    function handleGoToPreLobby() {
        handleFirstInteraction();
        playSound(sounds.click);
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
        }).then(() => joinRoom(currentRoomId));
    }

    function joinRoom(roomId) {
        playSound(sounds.click);
        currentRoomId = roomId;
        roomRef = database.ref(`rooms/${currentRoomId}`);
        roomRef.once('value', snapshot => {
            const roomData = snapshot.val();
            if (!roomData) { alert('ไม่พบห้องนี้'); return; }
            if (Object.keys(roomData.players || {}).length >= roomData.config.maxPlayers) {
                alert('ขออภัย, ห้องนี้เต็มแล้ว'); return;
            }
            playerRef = database.ref(`rooms/${currentRoomId}/players/${currentPlayerId}`);
            playerRef.set({
                name: playerName,
                isReady: false,
                hp: 3,
                status: 'playing',
                stats: { guesses: 0, assassinateFails: 0, timeOuts: 0 }
            });
            playerRef.onDisconnect().remove();
            listenToRoomUpdates();
            navigateTo('game');
        });
    }

    function listenToRooms() {
        const roomListContainer = document.getElementById('room-list-container');
        database.ref('rooms').on('value', snapshot => {
            roomListContainer.innerHTML = '';
            const rooms = snapshot.val();
            let hasRooms = false;
            if (rooms) {
                Object.entries(rooms).forEach(([id, room]) => {
                    const playerCount = Object.keys(room.players || {}).length;
                    if (room.status === 'waiting' && playerCount < room.config.maxPlayers) {
                        hasRooms = true;
                        const item = document.createElement('div');
                        item.className = 'room-item';
                        item.textContent = `${room.name} (${playerCount}/${room.config.maxPlayers}) - ${room.config.digitCount} หลัก`;
                        item.onclick = () => joinRoom(id);
                        roomListContainer.appendChild(item);
                    }
                });
            }
            if (!hasRooms) {
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
                alert('ห้องถูกปิดแล้ว หรือคุณถูกเตะ');
                leaveRoom(true);
                return;
            }
            const roomData = snapshot.val();
            const myPlayer = roomData.players ? roomData.players[currentPlayerId] : null;

            if (!myPlayer && roomData.status !== 'finished') {
                return;
            }

            updatePlayerList(roomData);
            updateChat(roomData.chat);

            const defeatedOverlay = document.getElementById('defeated-overlay');
            if (myPlayer) {
                defeatedOverlay.style.display = myPlayer.status === 'defeated' ? 'flex' : 'none';
            }

            if (roomData.status === 'waiting') {
                gameElements.setupSection.style.display = 'block';
                gameElements.waitingSection.style.display = 'none';
                gameElements.gameplaySection.style.display = 'none';
                
                if (myPlayer?.isReady) {
                    gameElements.setupSection.style.display = 'none';
                    gameElements.waitingSection.style.display = 'block';
                }
                checkIfGameCanStart(roomData);

            } else if (roomData.status === 'playing') {
                gameElements.setupSection.style.display = 'none';
                gameElements.waitingSection.style.display = 'none';
                gameElements.gameplaySection.style.display = 'block';

                const activePlayers = Object.values(roomData.players).filter(p => p.status === 'playing');
                if (activePlayers.length <= 1 && roomData.status !== 'finished') {
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
    function animateAttack(attackerId, targetId) {
        const container = document.getElementById('attack-animation-container');
        const attackerEl = document.getElementById(`player-${attackerId}`);
        const targetEl = document.getElementById(`player-${targetId}`);
        container.innerHTML = '';

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
        
        const listsToUpdate = [];
        if (status === 'waiting') {
            listsToUpdate.push(gameElements.playerListWaiting, gameElements.playerListWaiting2);
        } else if (status === 'playing') {
            listsToUpdate.push(gameElements.playerList);
        }

        listsToUpdate.forEach(list => {
            if (list) list.innerHTML = '';
        });

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
            
            listsToUpdate.forEach(list => {
                if (list) list.appendChild(item.cloneNode(true));
            });
        });
    }
    function updatePersonalHistory(roomData) {
        const historyModalBody = document.getElementById('history-modal-body');
        historyModalBody.innerHTML = '';
        const { players, guessHistory } = roomData;
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
            logs.sort((a, b) => b.timestamp - a.timestamp).forEach(log => {
                const row = document.createElement('tr');
                const hints = `<span class="hint-bull">${log.bulls}</span>B <span class="hint-cow">${log.cows}</span>C`;
                row.innerHTML = `<td>${log.guess} ${log.isAssassination ? '💀' : ''}</td><td>${hints}</td>`;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            section.appendChild(table);
            historyModalBody.appendChild(section);
        });
    }

    function updateChat(chatData) {
        const chatMessagesContainer = document.getElementById('chat-messages');
        const chatUnreadIndicator = document.getElementById('chat-unread-indicator');
        if (!chatData) return;
        const messages = Object.values(chatData).sort((a, b) => a.timestamp - b.timestamp);
        const lastMessage = messages[messages.length - 1];

        if (!isChatOpen && lastMessage && chatUnreadIndicator) {
            chatUnreadIndicator.style.display = 'block';
        }

        chatMessagesContainer.innerHTML = '';
        messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'chat-message';
            item.classList.add(msg.senderId === currentPlayerId ? 'mine' : 'theirs');
            item.innerHTML = `<div class="sender">${msg.senderName}</div><div>${msg.text}</div>`;
            chatMessagesContainer.appendChild(item);
        });
        if (isChatOpen) {
            const chatModalBody = document.getElementById('chat-modal-body');
            chatModalBody.scrollTop = chatModalBody.scrollHeight;
        }
    }

    function endGame(roomData) {
        if (turnTimer) clearInterval(turnTimer);
        if (roomData.winnerName !== "ไม่มีผู้ชนะ") {
            playSound(sounds.win, true);
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
        const titleCardOverlay = document.getElementById('title-card-overlay');
        const titleCardEmoji = document.getElementById('title-card-emoji');
        const titleCardName = document.getElementById('title-card-name');
        const titleCardTitle = document.getElementById('title-card-title');
        const titleCardDesc = document.getElementById('title-card-desc');

        const playerIdsInOrder = roomData.playerOrder || Object.keys(roomData.players);
        let currentIndex = 0;

        function showNextCard() {
            if (currentIndex >= playerIdsInOrder.length) {
                titleCardOverlay.style.display = 'none';
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

            titleCardEmoji.textContent = titleData.emoji;
            titleCardName.textContent = playerData.name;
            titleCardTitle.textContent = titleData.title;
            titleCardDesc.textContent = titleData.desc;
            titleCardOverlay.style.display = 'flex';
            
            setTimeout(() => {
                currentIndex++;
                showNextCard();
            }, 3500);
        }
        showNextCard();
    }

    function showSummaryPage(roomData, titles) {
        const summaryWinner = document.getElementById('summary-winner');
        const summaryPlayerList = document.getElementById('summary-player-list');

        summaryWinner.textContent = `ผู้ชนะคือ: ${roomData.winnerName}`;
        summaryPlayerList.innerHTML = '';
        const playerIdsInOrder = roomData.playerOrder || Object.keys(roomData.players);

        playerIdsInOrder.forEach(id => {
            const player = roomData.players[id];
            if (!player) return;

            const isWinner = player.name === roomData.winnerName;
            const title = titles[id] ? titles[id].title : (isWinner ? 'ผู้ชนะ' : 'ผู้แพ้');

            const card = document.createElement('div');
            card.className = 'summary-player-card';
            if (isWinner) card.classList.add('winner');

            card.innerHTML = `
                <div class="summary-player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-title">${title}</div>
                </div>
                <div class="summary-player-status ${isWinner ? 'win' : 'lose'}">
                    ${isWinner ? 'ชนะ' : 'แพ้'}
                </div>
            `;
            summaryPlayerList.appendChild(card);
        });
        navigateTo('summary');
    }

    function leaveRoom(isKicked = false) {
        playSound(sounds.click);
        if (playerRef) playerRef.remove();
        if (roomRef && roomListener) roomRef.off('value', roomListener);
        if (turnTimer) clearInterval(turnTimer);
        playerRef = null; roomRef = null; roomListener = null; currentRoomId = null; currentInput = '';
        if (!isKicked) navigateTo('preLobby');
        else navigateTo('home');
    }

    function handleReadyUp() {
        playSound(sounds.click);
        if (!playerRef) return;
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            let secretNumber = '';
            const digits = '0123456789'.split('');
            for (let i = 0; i < digitCount; i++) {
                secretNumber += digits[Math.floor(Math.random() * 10)];
            }
            playerRef.update({ isReady: true, secretNumber: secretNumber });
        });
    }

    function handleKeypadClick(e) {
        if (!e.target.classList.contains('key') || e.target.id === 'btn-delete' || e.target.id === 'btn-guess') return;
        playSound(sounds.click);
        roomRef.child('config/digitCount').once('value', snapshot => {
            const digitCount = snapshot.val();
            if (gameElements.gameDisplay.textContent === '----') currentInput = '';
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
    buttons.goToPreLobby.addEventListener('click', handleGoToPreLobby);
    inputs.playerName.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGoToPreLobby(); });
    buttons.goToCreate.addEventListener('click', () => { playSound(sounds.click); navigateTo('lobbyCreate'); });
    buttons.goToJoin.addEventListener('click', handleGoToJoin);
    buttons.createRoom.addEventListener('click', createRoom);
    buttons.leaveRoom.addEventListener('click', () => leaveRoom());
    buttons.leaveRoomSetup.addEventListener('click', () => leaveRoom());
    buttons.readyUp.addEventListener('click', handleReadyUp);
    buttons.delete.addEventListener('click', handleDelete);
    buttons.guess.addEventListener('click', () => handleAction(false));
    buttons.assassinate.addEventListener('click', () => handleAction(true));
    buttons.backToHome.addEventListener('click', () => {
        playSound(sounds.click);
        sounds.background.pause();
        hasInteracted = false;
        leaveRoom(true);
    });
    buttons.playAgain.addEventListener('click', () => { playSound(sounds.click); navigateTo('preLobby'); });
    gameElements.keypad.addEventListener('click', handleKeypadClick);

    // Settings Modal
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

    // History & Chat Modals
    const historyModalOverlay = document.getElementById('history-modal-overlay');
    const historyToggleBtn = document.getElementById('history-toggle-btn');
    const historyCloseBtn = document.getElementById('history-close-btn');
    historyToggleBtn.addEventListener('click', () => { playSound(sounds.click); historyModalOverlay.style.display = 'flex'; });
    historyCloseBtn.addEventListener('click', () => { playSound(sounds.click); historyModalOverlay.style.display = 'none'; });
    historyModalOverlay.addEventListener('click', (e) => { if (e.target === historyModalOverlay) historyModalOverlay.style.display = 'none'; });

    const chatModalOverlay = document.getElementById('chat-modal-overlay');
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    chatToggleBtn.addEventListener('click', () => {
        playSound(sounds.click);
        chatModalOverlay.style.display = 'flex';
        document.getElementById('chat-unread-indicator').style.display = 'none';
        isChatOpen = true;
        setTimeout(() => { document.getElementById('chat-modal-body').scrollTop = document.getElementById('chat-modal-body').scrollHeight; }, 0);
    });
    chatCloseBtn.addEventListener('click', () => { playSound(sounds.click); chatModalOverlay.style.display = 'none'; isChatOpen = false; });
    chatModalOverlay.addEventListener('click', (e) => { if (e.target === chatModalOverlay) { chatModalOverlay.style.display = 'none'; isChatOpen = false; } });

    // --- Initial Load ---
    const savedPlayerName = sessionStorage.getItem('playerName');
    if (savedPlayerName) {
        inputs.playerName.value = savedPlayerName;
    }
    updateSoundSettings();
    navigateTo('home');
});
