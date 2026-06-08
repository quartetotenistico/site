(function() {
    const db = window.db;
    const storage = window.storage;
    
    let players = [];
    let matches = [];
    let checkins = [];
    let losers = [];

    async function loadPlayers() {
        const q = query(collection(db, "players"), orderBy("name"));
        const snap = await getDocs(q);
        players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAllPlayerSelects();
        renderPlayersListAdmin();
        updateNextMatchDisplay();
        updateRankingTable();
    }

    async function loadMatches() {
        const q = query(collection(db, "matches"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateRankingTable();
        updateRankingDuplas();
        updateHighlights();
        loadLosers();
    }

    async function loadCheckins() {
        const q = query(collection(db, "checkins"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        checkins = snap.docs.map(d => d.data());
        renderCheckins();
        updateNextMatchDisplay();
    }

    async function loadLosers() {
        const q = query(collection(db, "losers"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        losers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLosersRanking();
    }

    function renderAllPlayerSelects() {
        const selects = ["player1","player2","player3","player4","winner-select","checkin-player-select","delete-player-select","loser-select"];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if(sel) sel.innerHTML = '<option value="">Selecione</option>' + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        });
    }

    function renderPlayersListAdmin() {
        const div = document.getElementById("players-list-admin");
        if(div) div.innerHTML = players.map(p => `<div style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid #F0E0D0;"><img src="${p.photoUrl || 'https://via.placeholder.com/32'}" style="width:32px;height:32px;border-radius:32px;"><span>${p.name}</span></div>`).join('');
    }

    function renderLosersRanking() {
        // Conta quantas vezes cada jogador foi hostilizado como perdedor da rodada
        const loserCount = {};
        losers.forEach(l => { loserCount[l.playerId] = (loserCount[l.playerId] || 0) + 1; });
        const sorted = Object.entries(loserCount).sort((a,b) => b[1] - a[1]).slice(0,5);
        const div = document.getElementById("losers-ranking");
        div.innerHTML = `<div style="font-weight:700; margin-bottom:8px;">🏆 RANKING PERDEDORES 🏆</div>` + 
            sorted.map(([id, count]) => `<div class="ranking-item loser-item" style="display:flex; justify-content:space-between; padding:8px; background:#FFF0E8; border-radius:40px; margin-bottom:5px;"><span>💀 ${players.find(p=>p.id===id)?.name || "?"}</span><span>🍂 ${count} vez(es)</span></div>`).join("") || "<div>Nenhum perdedor registrado</div>";
    }

    async function registerLoser(playerId) {
        if(!playerId) return;
        await addDoc(collection(db, "losers"), {
            playerId: playerId,
            date: new Date().toISOString(),
            timestamp: Date.now()
        });
        alert("💀 Perdedor hostilizado com sucesso!");
        loadLosers();
    }

    async function saveMatch() {
        const type = document.getElementById("match-type").value;
        const p1 = document.getElementById("player1").value;
        const p2 = document.getElementById("player2").value;
        let winnerId = document.getElementById("winner-select").value;
        let playersArray = [p1,p2];
        let winnersArray = [winnerId];
        let losersArray = [];
        
        // Resultados
        const set1 = document.getElementById("set1").value;
        const set2 = document.getElementById("set2").value;
        const set3 = document.getElementById("set3").value;
        const result = `${set1} ${set2} ${set3}`.trim();
        
        if(type === "duplas") {
            const p3 = document.getElementById("player3").value;
            const p4 = document.getElementById("player4").value;
            playersArray = [p1,p2,p3,p4];
            const timeA = [p1,p2];
            const timeB = [p3,p4];
            if(timeA.includes(winnerId)) { winnersArray = timeA; losersArray = timeB; }
            else { winnersArray = timeB; losersArray = timeA; }
        } else {
            losersArray = playersArray.filter(p => p !== winnerId);
        }
        
        await addDoc(collection(db,"matches"), { 
            type, 
            players: playersArray, 
            winners: winnersArray, 
            losers: losersArray,
            result: result,
            date: new Date().toISOString(), 
            timestamp: Date.now() 
        });
        alert("Partida registrada!");
        loadMatches();
    }
    
    function updateRankingTable() {
        const stats = {};
        players.forEach(p => { stats[p.id] = { jogos: 0, vitorias: 0, derrotas: 0 }; });
        
        matches.forEach(m => {
            m.winners.forEach(w => { 
                stats[w].jogos += 1;
                stats[w].vitorias += 1;
            });
            m.losers.forEach(l => { 
                stats[l].jogos += 1;
                stats[l].derrotas += 1;
            });
        });
        
        const sorted = Object.entries(stats).sort((a,b) => b[1].vitorias - a[1].vitorias);
        const tbody = document.getElementById("ranking-body");
        tbody.innerHTML = sorted.map(([id, s], idx) => {
            const player = players.find(p => p.id === id);
            const percent = s.jogos > 0 ? ((s.vitorias / s.jogos) * 100).toFixed(0) : 0;
            return `<tr>
                <td class="rank-pos">${idx+1}º</td>
                <td><div class="player-cell"><img src="${player?.photoUrl || 'https://via.placeholder.com/32'}" class="player-photo-sm"><span>${player?.name || "?"}</span></div></td>
                <td>${s.jogos}</td>
                <td style="color:#2E7D32;">${s.vitorias}</td>
                <td style="color:#D96C1A;">${s.derrotas}</td>
                <td>${percent}%</td>
            </tr>`;
        }).join("");
        if(!sorted.length) tbody.innerHTML = "<tr><td colspan='6'>Nenhuma partida registrada</td></tr>";
    }

    function updateRankingDuplas() {
        let duplaWins = {};
        matches.forEach(m => {
            if(m.type === "duplas" && m.winners.length === 2) {
                const key = [m.winners[0], m.winners[1]].sort().join("_");
                duplaWins[key] = (duplaWins[key] || 0) + 1;
            }
        });
        const sorted = Object.entries(duplaWins).sort((a,b) => b[1] - a[1]);
        const div = document.getElementById("ranking-duplas");
        div.innerHTML = sorted.map(([key, wins]) => {
            const ids = key.split("_");
            const p1 = players.find(p=>p.id===ids[0]);
            const p2 = players.find(p=>p.id===ids[1]);
            return `<div class="ranking-item" style="display:flex; justify-content:space-between; padding:12px; background:#FFF8F0; border-radius:40px; margin-bottom:8px;"><span>${p1?.name} / ${p2?.name}</span><span>🏆 ${wins} títulos</span></div>`;
        }).join("") || "<div>Nenhuma dupla registrada</div>";
    }
    
    async function updateHighlights() {
        const snap = await getDocs(query(collection(db,"highlights"), orderBy("timestamp","desc")));
        if(!snap.empty) { 
            const last = snap.docs[0].data(); 
            document.getElementById("highlights-img").src = last.url; 
            document.getElementById("highlights-desc").innerHTML = last.desc || "Momento épico!";
        }
    }
    
    async function uploadPhoto(file) {
        if(!file) return;
        const refFile = ref(storage, `highlights/${Date.now()}_${file.name}`);
        await uploadBytes(refFile, file);
        await addDoc(collection(db,"highlights"), { url: await getDownloadURL(refFile), desc: "🎾 Momento do Quarteto Tenístico", timestamp: Date.now() });
        alert("Foto destacada!");
        updateHighlights();
    }
    
    async function doCheckin(playerId) {
        if(!playerId) return;
        await addDoc(collection(db,"checkins"), { playerId, date: new Date().toISOString(), timestamp: Date.now() });
        alert("Check-in confirmado!");
        loadCheckins();
    }
    
    async function renderCheckins() {
        const today = new Date().toDateString();
        const todayCheckins = checkins.filter(c => new Date(c.date).toDateString() === today);
        const names = todayCheckins.map(c => players.find(p=>p.id===c.playerId)?.name).filter(n=>n);
        document.getElementById("checkin-list").innerHTML = `<i class="fas fa-users"></i> Check-ins hoje: ${names.length ? names.join(", ") : "Nenhum"}`;
    }

    async function updateNextMatchDisplay() {
        const todayCheckins = checkins.filter(c => new Date(c.date).toDateString() === new Date().toDateString());
        const checkedIds = todayCheckins.map(c => c.playerId);
        const available = players.filter(p => checkedIds.includes(p.id));
        const container = document.getElementById("next-match-players-container");
        const statusDiv = document.getElementById("next-match-status");
        
        if(available.length >= 2) {
            const p1 = available[0], p2 = available[1];
            container.innerHTML = `
                <div class="next-player">
                    ${p1.photoUrl ? `<img src="${p1.photoUrl}" class="next-player-photo">` : `<div class="next-player-photo" style="background:#F0E0D0; display:flex; align-items:center; justify-content:center;"><i class="fas fa-user-circle" style="font-size:50px; color:#F47B20;"></i></div>`}
                    <div class="next-player-name">${p1.name}</div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="next-player">
                    ${p2.photoUrl ? `<img src="${p2.photoUrl}" class="next-player-photo">` : `<div class="next-player-photo" style="background:#F0E0D0; display:flex; align-items:center; justify-content:center;"><i class="fas fa-user-circle" style="font-size:50px; color:#F47B20;"></i></div>`}
                    <div class="next-player-name">${p2.name}</div>
                </div>
            `;
            statusDiv.innerHTML = `✅ Jogo confirmado! (${available.length} jogadores check-in)`;
        } else {
            container.innerHTML = `
                <div class="next-player"><div class="next-player-photo"><i class="fas fa-question" style="font-size:30px; color:#F47B20;"></i></div><div class="next-player-name">Aguardando</div></div>
                <div class="vs-divider">VS</div>
                <div class="next-player"><div class="next-player-photo"><i class="fas fa-question" style="font-size:30px; color:#F47B20;"></i></div><div class="next-player-name">Aguardando</div></div>
            `;
            statusDiv.innerHTML = `⏳ Aguardando check-ins... (${available.length}/2 jogadores)`;
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
        await addDoc(collection(db,"players"), { name: name.trim(), photoUrl });
        loadPlayers();
    }
    
    async function deletePlayer(id) { await deleteDoc(doc(db,"players",id)); loadPlayers(); }
    
    function setupTabs() {
        const btns = document.querySelectorAll(".menu-btn");
        const tabs = ["home-tab","registro-tab","rankings-tab","admin-tab"];
        btns.forEach((btn,idx) => btn.addEventListener("click",()=>{ btns.forEach(b=>b.classList.remove("active")); btn.classList.add("active"); tabs.forEach(t=>document.getElementById(t).classList.add("hidden")); document.getElementById(tabs[idx]).classList.remove("hidden"); }));
    }
    
    document.getElementById("player-photo")?.addEventListener("change", (e) => { if(e.target.files[0]) { const reader=new FileReader(); reader.onload=ev=>document.getElementById("photo-preview").innerHTML=`<img src="${ev.target.result}" style="width:50px;height:50px;border-radius:40px;">`; reader.readAsDataURL(e.target.files[0]); } });
    
    document.addEventListener("DOMContentLoaded", async () => {
        setupTabs();
        await loadPlayers();
        await loadMatches();
        await loadCheckins();
        await loadLosers();
        
        document.getElementById("save-match").onclick = saveMatch;
        document.getElementById("add-player").onclick = () => addPlayerWithPhoto(document.getElementById("new-player-name").value, document.getElementById("player-photo").files[0]);
        document.getElementById("delete-player").onclick = () => deletePlayer(document.getElementById("delete-player-select").value);
        document.getElementById("do-checkin").onclick = () => doCheckin(document.getElementById("checkin-player-select").value);
        document.getElementById("upload-photo-btn").onclick = () => uploadPhoto(document.getElementById("match-photo").files[0]);
        document.getElementById("register-loser").onclick = () => registerLoser(document.getElementById("loser-select").value);
        document.getElementById("match-type").onchange = (e) => document.getElementById("duplas-fields").classList.toggle("hidden", e.target.value !== "duplas");
    });
})();
