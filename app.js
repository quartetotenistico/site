(function() {
    const db = window.db;
    const storage = window.storage;
    
    let players = [];
    let matches = [];
    let checkins = [];

    async function loadPlayers() {
        const q = query(collection(db, "players"), orderBy("name"));
        const snap = await getDocs(q);
        players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAllPlayerSelects();
        renderPlayersListAdmin();
        updateNextMatch();
    }

    async function loadMatches() {
        const q = query(collection(db, "matches"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateRankings();
        updateLosersRanking();
        updateHighlights();
    }

    async function loadCheckins() {
        const q = query(collection(db, "checkins"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        checkins = snap.docs.map(d => d.data());
        renderCheckins();
        updateNextMatch();
    }

    function renderAllPlayerSelects() {
        const selects = ["player1", "player2", "player3", "player4", "winner-select", "checkin-player-select", "delete-player-select"];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if(sel) {
                sel.innerHTML = '<option value="">Selecione</option>' + 
                    players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            }
        });
    }

    function renderPlayersListAdmin() {
        const div = document.getElementById("players-list-admin");
        if(div) {
            div.innerHTML = players.map(p => `
                <div class="player-item">
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${p.photoUrl ? `<img src="${p.photoUrl}" class="player-photo">` : `<i class="fas fa-user-circle" style="font-size:40px; color:#D96C1A;"></i>`}
                        <span>${p.name}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    async function saveMatch() {
        const type = document.getElementById("match-type").value;
        const p1 = document.getElementById("player1").value;
        const p2 = document.getElementById("player2").value;
        let winnerId = document.getElementById("winner-select").value;
        let playersArray = [p1, p2];
        let winnersArray = [winnerId];
        let losersArray = [];
        
        if(type === "duplas") {
            const p3 = document.getElementById("player3").value;
            const p4 = document.getElementById("player4").value;
            playersArray = [p1, p2, p3, p4];
            const timeA = [p1, p2];
            const timeB = [p3, p4];
            if(timeA.includes(winnerId)) {
                winnersArray = timeA;
                losersArray = timeB;
            } else {
                winnersArray = timeB;
                losersArray = timeA;
            }
        } else {
            losersArray = playersArray.filter(p => p !== winnerId);
        }
        
        const matchData = {
            type,
            players: playersArray,
            winners: winnersArray,
            losers: losersArray,
            date: new Date().toISOString(),
            timestamp: Date.now()
        };
        
        await addDoc(collection(db, "matches"), matchData);
        alert("🎾 Partida registrada!");
        loadMatches();
    }
    
    function updateRankings() {
        // Ranking Simples
        let wins = {};
        matches.forEach(m => {
            if(m.type === "simples") {
                m.winners.forEach(w => { wins[w] = (wins[w] || 0) + 1; });
            }
        });
        const sorted = Object.entries(wins).sort((a,b) => b[1] - a[1]);
        const rankingDiv = document.getElementById("ranking-simples");
        rankingDiv.innerHTML = sorted.map(([pid, w]) => {
            const player = players.find(p => p.id === pid);
            return `<div class="ranking-item"><span>${player?.name || "?"}</span><span class="rank-points">🏆 ${w} vitórias</span></div>`;
        }).join("");
        if(!sorted.length) rankingDiv.innerHTML = "<div class='ranking-item'>Nenhuma partida registrada</div>";
        
        // Ranking Duplas
        let duplaWins = {};
        matches.forEach(m => {
            if(m.type === "duplas" && m.winners.length === 2) {
                const key = [m.winners[0], m.winners[1]].sort().join("_");
                duplaWins[key] = (duplaWins[key] || 0) + 1;
            }
        });
        const sortedDuplas = Object.entries(duplaWins).sort((a,b) => b[1] - a[1]);
        const duplaDiv = document.getElementById("ranking-duplas");
        duplaDiv.innerHTML = sortedDuplas.map(([key, w]) => {
            const ids = key.split("_");
            const p1 = players.find(p => p.id === ids[0]);
            const p2 = players.find(p => p.id === ids[1]);
            return `<div class="ranking-item"><span>${p1?.name} / ${p2?.name}</span><span class="rank-points">🏆 ${w} títulos</span></div>`;
        }).join("");
        if(!sortedDuplas.length) duplaDiv.innerHTML = "<div class='ranking-item'>Nenhuma dupla registrada</div>";
    }

    function updateLosersRanking() {
        let losses = {};
        matches.forEach(m => {
            m.losers.forEach(l => { losses[l] = (losses[l] || 0) + 1; });
        });
        const sorted = Object.entries(losses).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const div = document.getElementById("losers-ranking");
        if(sorted.length === 0) {
            div.innerHTML = "<div class='ranking-item'>Nenhuma derrota registrada ainda</div>";
            return;
        }
        div.innerHTML = sorted.map(([pid, lossesCount]) => {
            const player = players.find(p => p.id === pid);
            return `<div class="ranking-item loser-trophy"><span>💀 ${player?.name || "?"}</span><span class="rank-points">🍂 ${lossesCount} derrota(s)</span></div>`;
        }).join("");
    }
    
    async function updateHighlights() {
        const q = query(collection(db, "highlights"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        if(!snap.empty) {
            const last = snap.docs[0].data();
            document.getElementById("highlights-img").src = last.url;
            document.getElementById("highlights-desc").innerHTML = last.desc || "🏆 Momento inesquecível";
        }
    }
    
    async function uploadPhotoAndHighlight(file) {
        if(!file) return;
        const storageRef = ref(storage, `highlights/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(db, "highlights"), {
            url: url,
            desc: "🎾 Momento épico do Quarteto Tenístico",
            timestamp: Date.now()
        });
        alert("✨ Foto destacada!");
        updateHighlights();
    }
    
    async function doCheckin(playerId) {
        if(!playerId) return;
        await addDoc(collection(db, "checkins"), {
            playerId: playerId,
            date: new Date().toISOString(),
            timestamp: Date.now()
        });
        alert("✅ Check-in confirmado!");
        loadCheckins();
    }
    
    async function renderCheckins() {
        const div = document.getElementById("checkin-list");
        const today = new Date().toDateString();
        const todayCheckins = checkins.filter(c => new Date(c.date).toDateString() === today);
        const names = todayCheckins.map(c => players.find(p => p.id === c.playerId)?.name || "?").filter(n => n);
        div.innerHTML = `<i class="fas fa-users"></i> Check-ins hoje: ${names.length ? names.join(", ") : "Nenhum ainda"}`;
    }

    async function updateNextMatch() {
        const todayCheckins = checkins.filter(c => new Date(c.date).toDateString() === new Date().toDateString());
        const checkedPlayers = todayCheckins.map(c => c.playerId);
        const availablePlayers = players.filter(p => checkedPlayers.includes(p.id));
        
        const nextDiv = document.getElementById("next-match-text");
        if(availablePlayers.length >= 2) {
            const p1 = availablePlayers[0]?.name || "?";
            const p2 = availablePlayers[1]?.name || "?";
            nextDiv.innerHTML = `🎾 <strong>PRÓXIMA PARTIDA</strong><br>${p1} 🆚 ${p2}<br><span style="font-size:0.7rem;">✅ ${availablePlayers.length} jogadores confirmados</span>`;
        } else {
            nextDiv.innerHTML = `⏳ Aguardando mais check-ins... (${availablePlayers.length}/2 jogadores)`;
        }
    }
    
    async function addPlayerWithPhoto(name, file) {
        if(!name.trim()) return;
        let photoUrl = null;
        if(file) {
            const storageRef = ref(storage, `players/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            photoUrl = await getDownloadURL(storageRef);
        }
        await addDoc(collection(db, "players"), { name: name.trim(), photoUrl: photoUrl });
        loadPlayers();
    }
    
    async function deletePlayer(playerId) {
        await deleteDoc(doc(db, "players", playerId));
        loadPlayers();
    }
    
    function setupTabs() {
        const btns = document.querySelectorAll(".menu-btn");
        const tabs = ["home-tab", "registro-tab", "rankings-tab", "admin-tab"];
        btns.forEach((btn, idx) => {
            btn.addEventListener("click", () => {
                btns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                tabs.forEach(t => document.getElementById(t).classList.add("hidden"));
                document.getElementById(tabs[idx]).classList.remove("hidden");
            });
        });
    }
    
    // Preview de foto do jogador
    document.getElementById("player-photo")?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById("photo-preview").innerHTML = `<img src="${ev.target.result}" class="photo-preview">`;
            };
            reader.readAsDataURL(file);
        }
    });
    
    document.addEventListener("DOMContentLoaded", async () => {
        setupTabs();
        await loadPlayers();
        await loadMatches();
        await loadCheckins();
        
        document.getElementById("save-match").addEventListener("click", saveMatch);
        document.getElementById("add-player").addEventListener("click", () => {
            const name = document.getElementById("new-player-name").value;
            const file = document.getElementById("player-photo").files[0];
            addPlayerWithPhoto(name, file);
        });
        document.getElementById("delete-player").addEventListener("click", () => deletePlayer(document.getElementById("delete-player-select").value));
        document.getElementById("do-checkin").addEventListener("click", () => doCheckin(document.getElementById("checkin-player-select").value));
        document.getElementById("upload-photo-btn").addEventListener("click", () => {
            const file = document.getElementById("match-photo").files[0];
            if(file) uploadPhotoAndHighlight(file);
            else alert("Selecione uma foto");
        });
        document.getElementById("match-type").addEventListener("change", (e) => {
            document.getElementById("duplas-fields").classList.toggle("hidden", e.target.value !== "duplas");
        });
    });
})();