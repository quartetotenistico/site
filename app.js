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
        updateNextMatchDisplay();
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
        updateNextMatchDisplay();
    }

    function renderAllPlayerSelects() {
        const selects = ["player1","player2","player3","player4","winner-select","checkin-player-select","delete-player-select"];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if(sel) sel.innerHTML = '<option value="">Selecione</option>' + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        });
    }

    function renderPlayersListAdmin() {
        const div = document.getElementById("players-list-admin");
        if(div) div.innerHTML = players.map(p => `<div class="player-item"><div style="display:flex; gap:10px; align-items:center;">${p.photoUrl ? `<img src="${p.photoUrl}" class="player-photo-sm">` : `<i class="fas fa-user-circle" style="font-size:32px;"></i>`}<span>${p.name}</span></div></div>`).join('');
    }

    async function saveMatch() {
        const type = document.getElementById("match-type").value;
        const p1 = document.getElementById("player1").value;
        const p2 = document.getElementById("player2").value;
        let winnerId = document.getElementById("winner-select").value;
        let playersArray = [p1,p2];
        let winnersArray = [winnerId];
        let losersArray = [];
        
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
        
        await addDoc(collection(db,"matches"), { type, players: playersArray, winners: winnersArray, losers: losersArray, date: new Date().toISOString(), timestamp: Date.now() });
        alert("Partida registrada!");
        loadMatches();
    }
    
    function updateRankings() {
        let wins = {};
        matches.forEach(m => { if(m.type==="simples") m.winners.forEach(w=>wins[w]=(wins[w]||0)+1); });
        const div = document.getElementById("ranking-simples");
        div.innerHTML = Object.entries(wins).sort((a,b)=>b[1]-a[1]).map(([pid,w])=>`<div class="ranking-item"><span>${players.find(p=>p.id===pid)?.name||"?"}</span><span class="rank-points">🏆 ${w} vitórias</span></div>`).join("") || "<div class='ranking-item'>Nenhuma partida</div>";
        
        let duplaWins = {};
        matches.forEach(m => { if(m.type==="duplas" && m.winners.length===2) { const key = [m.winners[0],m.winners[1]].sort().join("_"); duplaWins[key]=(duplaWins[key]||0)+1; } });
        const duplaDiv = document.getElementById("ranking-duplas");
        duplaDiv.innerHTML = Object.entries(duplaWins).sort((a,b)=>b[1]-a[1]).map(([key,w])=>{ const ids=key.split("_"); return `<div class="ranking-item"><span>${players.find(p=>p.id===ids[0])?.name} / ${players.find(p=>p.id===ids[1])?.name}</span><span class="rank-points">🏆 ${w} títulos</span></div>`; }).join("") || "<div class='ranking-item'>Nenhuma dupla</div>";
    }

    function updateLosersRanking() {
        let losses = {};
        matches.forEach(m => m.losers.forEach(l=>losses[l]=(losses[l]||0)+1));
        const div = document.getElementById("losers-ranking");
        const topLosers = Object.entries(losses).sort((a,b)=>b[1]-a[1]).slice(0,5);
        div.innerHTML = topLosers.map(([pid,loss])=>`<div class="ranking-item loser-item"><span>💀 ${players.find(p=>p.id===pid)?.name||"?"}</span><span class="rank-points">🍂 ${loss} derrota(s)</span></div>`).join("") || "<div class='ranking-item'>Ninguém perdeu ainda</div>";
    }
    
    async function updateHighlights() {
        const snap = await getDocs(query(collection(db,"highlights"), orderBy("timestamp","desc")));
        if(!snap.empty) { const last=snap.docs[0].data(); document.getElementById("highlights-img").src=last.url; document.getElementById("highlights-desc").innerHTML=last.desc; }
    }
    
    async function uploadPhoto(file) {
        if(!file) return;
        const ref = ref(storage, `highlights/${Date.now()}_${file.name}`);
        await uploadBytes(ref, file);
        await addDoc(collection(db,"highlights"), { url: await getDownloadURL(ref), desc: "🎾 Momento épico", timestamp: Date.now() });
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
                    ${p1.photoUrl ? `<img src="${p1.photoUrl}" class="next-player-photo">` : `<div class="next-player-photo" style="background:#D96C1A20; display:flex; align-items:center; justify-content:center;"><i class="fas fa-user-circle" style="font-size:50px; color:#D96C1A;"></i></div>`}
                    <div class="next-player-name">${p1.name}</div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="next-player">
                    ${p2.photoUrl ? `<img src="${p2.photoUrl}" class="next-player-photo">` : `<div class="next-player-photo" style="background:#D96C1A20; display:flex; align-items:center; justify-content:center;"><i class="fas fa-user-circle" style="font-size:50px; color:#D96C1A;"></i></div>`}
                    <div class="next-player-name">${p2.name}</div>
                </div>
            `;
            statusDiv.innerHTML = `✅ Jogo confirmado! (${available.length} jogadores check-in)`;
        } else {
            container.innerHTML = `
                <div class="next-player"><div class="next-player-photo"><i class="fas fa-question" style="font-size:30px;"></i></div><div class="next-player-name">Aguardando</div></div>
                <div class="vs-divider">VS</div>
                <div class="next-player"><div class="next-player-photo"><i class="fas fa-question" style="font-size:30px;"></i></div><div class="next-player-name">Aguardando</div></div>
            `;
            statusDiv.innerHTML = `⏳ Aguardando mais check-ins... (${available.length}/2 jogadores)`;
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
        document.getElementById("save-match").onclick = saveMatch;
        document.getElementById("add-player").onclick = () => addPlayerWithPhoto(document.getElementById("new-player-name").value, document.getElementById("player-photo").files[0]);
        document.getElementById("delete-player").onclick = () => deletePlayer(document.getElementById("delete-player-select").value);
        document.getElementById("do-checkin").onclick = () => doCheckin(document.getElementById("checkin-player-select").value);
        document.getElementById("upload-photo-btn").onclick = () => uploadPhoto(document.getElementById("match-photo").files[0]);
        document.getElementById("match-type").onchange = (e) => document.getElementById("duplas-fields").classList.toggle("hidden", e.target.value !== "duplas");
    });
})();
