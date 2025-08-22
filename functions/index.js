const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.processGuess = functions.database.ref("/rooms/{roomId}/gameState/guesses/{guessId}")
    .onCreate(async (snapshot, context) => {
        const guessData = snapshot.val();
        const { roomId } = context.params;
        const roomRef = admin.database().ref(`/rooms/${roomId}`);

        try {
            const roomSnapshot = await roomRef.once("value");
            const room = roomSnapshot.val();

            if (room.status !== "playing") {
                return console.log("Game is not in playing state.");
            }

            const { players, gameState, config } = room;
            const { turn, targetPlayerId } = gameState;
            const guesser = players[guessData.playerId];
            const target = players[targetPlayerId];

            // --- 1. Calculate Hints (Bulls & Cows) ---
            let bulls = 0;
            let cows = 0;
            const targetSecret = target.secretNumber.split('');
            const guessSecret = guessData.guess.split('');
            const targetCounts = {};
            const guessCounts = {};

            for (let i = 0; i < config.digitCount; i++) {
                if (targetSecret[i] === guessSecret[i]) {
                    bulls++;
                } else {
                    targetCounts[targetSecret[i]] = (targetCounts[targetSecret[i]] || 0) + 1;
                    guessCounts[guessSecret[i]] = (guessCounts[guessSecret[i]] || 0) + 1;
                }
            }
            for (const digit in guessCounts) {
                if (targetCounts[digit]) {
                    cows += Math.min(guessCounts[digit], targetCounts[digit]);
                }
            }

            // --- 2. Update History ---
            const historyRef = roomRef.child(`history/${guessData.playerId}_${targetPlayerId}`);
            await historyRef.child("guesserId").set(guessData.playerId);
            await historyRef.child("targetId").set(targetPlayerId);
            await historyRef.child("targetName").set(target.name);
            await historyRef.child(`guesses/${guessData.guess}`).set({ bulls, cows });

            // --- 3. Handle Consequences ---
            let newHp = guesser.hp;
            let targetNewHp = target.hp;
            let isTargetDefeated = false;
            let isGuesserDefeated = false;

            if (guessData.isAssassination) {
                if (bulls === config.digitCount) {
                    targetNewHp = 0; // Assassination success
                    isTargetDefeated = true;
                    players[guessData.playerId].stats.assassinations = (guesser.stats.assassinations || 0) + 1;
                } else {
                    newHp--; // Assassination fail
                    if (newHp <= 0) isGuesserDefeated = true;
                }
            } else {
                 if (bulls === config.digitCount) {
                    players[guessData.playerId].stats.correctGuesses = (guesser.stats.correctGuesses || 0) + 1;
                 }
            }
            
            players[guessData.playerId].hp = newHp;
            players[guessData.playerId].isDefeated = isGuesserDefeated;
            players[targetPlayerId].hp = targetNewHp;
            players[targetPlayerId].isDefeated = isTargetDefeated;
            players[guessData.playerId].stats.guessesMade = (guesser.stats.guessesMade || 0) + 1;


            // --- 4. Check for Winner ---
            const activePlayers = Object.values(players).filter(p => !p.isDefeated);
            if (activePlayers.length <= 1) {
                await roomRef.update({
                    status: "finished",
                    "gameState/winnerId": activePlayers[0] ? Object.keys(players).find(id => id === Object.keys(players).find(pId => players[pId] === activePlayers[0])) : null,
                });
                return console.log("Game Over.");
            }

            // --- 5. Determine Next Turn ---
            let nextGuesserIndex = (turn.guesserIndex + 1) % gameState.turnOrder.length;
            let nextTargetIndex = turn.targetIndex;

            // If everyone has guessed the current target
            if (gameState.turnOrder[nextGuesserIndex] === gameState.turnOrder[turn.targetIndex]) {
                nextTargetIndex = (turn.targetIndex + 1) % gameState.turnOrder.length;
                nextGuesserIndex = (nextTargetIndex + 1) % gameState.turnOrder.length;
            }
            
            // Skip defeated players
            while (players[gameState.turnOrder[nextTargetIndex]].isDefeated) {
                nextTargetIndex = (nextTargetIndex + 1) % gameState.turnOrder.length;
                nextGuesserIndex = (nextTargetIndex + 1) % gameState.turnOrder.length;
            }
            while (players[gameState.turnOrder[nextGuesserIndex]].isDefeated || nextGuesserIndex === nextTargetIndex) {
                 nextGuesserIndex = (nextGuesserIndex + 1) % gameState.turnOrder.length;
            }

            const nextTurn = {
                playerId: gameState.turnOrder[nextGuesserIndex],
                targetIndex: nextTargetIndex,
                guesserIndex: nextGuesserIndex,
            };

            await roomRef.update({
                players: players,
                "gameState/targetPlayerId": gameState.turnOrder[nextTargetIndex],
                "gameState/turn": nextTurn,
                "gameState/turnStartTime": admin.database.ServerValue.TIMESTAMP,
            });

            return console.log("Turn processed successfully.");
        } catch (error) {
            console.error("Error processing guess:", error);
            return null;
        }
    });
