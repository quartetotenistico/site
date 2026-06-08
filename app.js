(function() {
    const db = window.db;
    const storage = window.storage;
    
    let players = [];
    let matches = [];
    let checkins = [];
    let losers = [];

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    // ========== CARREGAR DADOS ==========
    async function loadPlayers() {
        try {
            const q = query(collection(db, "players"), orderBy("name"));
            const snap = await getDocs(q);
            players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log("Jogadores carregados:", players.length);
            renderAllPlayerSelects();
            renderPlayersListAdmin();
            updateNextMatchDisplay();
            updateRankingTable();
        } catch (error) {
            console.error("Erro ao carregar jogadores:", error);
            showToast("Erro ao carregar jogadores");
        }
    }

    async function loadMatches() {
        try {
            const q = query(collection(db, "matches"), orderBy("date", "desc"));
            const snap = await getDocs(q);
            matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log("Partidas carregadas:", matches.length);
            updateRankingTable();
            updateRankingDuplas();
            updateHighlights();
            updateRecentMatches();
        } catch (error) {
            console.error("Erro ao carregar partidas:", error);
        }
    }

    async function loadCheckins() {
        try {
            const q = query(collection(db, "checkins"), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            checkins = snap.docs.map(d => d.data());
            renderCheckins();
            updateNextMatchDisplay();
        } catch (error) {
            console.error("Erro ao carregar checkins:", error);
        }
    }

    async function loadLosers() {
        try {
            const q = query(collection(db, "losers"), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            losers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderLosersRanking();
        } catch (error) {
            console.error("Erro ao carregar perdedores:", error);
        }
    }

    // ========== RENDERIZAÇÕES ==========
    function renderAllPlayerSelects() {
        const selects = ["checkin-player-select", "delete-player-select", "loser-select", "score-player1", "score-player2"];
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
        if(div && players.length > 0) {
            div.innerHTML = players.map(p => `
                <div style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #F0E0D0;">
                    <img src="${p.photoUrl || 'https://via.placeholder.com/40'}" style="width:40px;height:40px;border-radius:40px;object-fit:cover;">
                    <span style="flex:1; font-weight:500;">${p.name}</span>
                </div>
            `).join('');
        } else if(div) {
            div.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">Nenhum jogador cadastrado</div>';
        }
    }

    function renderLosersRanking() {
        const loserCount = {};
        losers.forEach(l => { loserCount[l.playerId] = (loserCount[l.playerId] || 0) + 1; });
        const sorted = Object.entries(loserCount).sort((a,b) => b[1] - a[1]).slice(0,5);
        const div = document.getElementById("losers-ranking");
        if(div) {
            div.innerHTML = `<div style="font-weight:700; margin-bottom:8px;">🏆 RANKING PERDEDORES 🏆</div>` + 
                (sorted.length ? sorted.map(([id, count]) => {
                    const player = players.find(p => p.id === id);
                    return `<div class="loser-item"><span>💀 ${player?.name || "?"}</span><span>🍂 ${count} vez(es)</span></div>`;
                }).join('') : "<div style='padding:10px; text-align:center;'>Nenhum perdedor registrado</div>");
        }
    }

    function renderCheckins() {
        const today = new Date().toDateString();
        const todayCheckins = checkins.filter(c => new Date(c.date).toDateString() === today);
        const names = todayCheckins.map(c => players.find(p => p.id === c.playerId)?.name).filter(n => n);
        const div = document.getElementById("checkin-list");
        if(div) {
            div.innerHTML = `<i class="fas fa-users"></i> Check-ins hoje: ${names.length ? names.join(", ") : "Nenhum"}`;
        }
    }

    function updateRecentMatches() {
        const div = document.getElementById("recent-matches");
        if(!div) return;
        const recent = matches.slice(0, 10);
        if(recent.length === 0) {
            div.innerHTML = "<div style='text-align:center; padding:20px;'>Nenhuma partida registrada</div>";
            return;
        }
        div.innerHTML = recent.map(m => {
            const winner = m.winners.map(w => players.find(p => p.id === w)?.name).join(" / ");
            const loser = m.losers.map(l => players.find(p => p.id === l)?.name).join(" / ");
            const date = new Date(m.date).toLocaleDateString();
            return `<div style="padding:12px; border-bottom:1px solid #F0E0D0;">
                        <div style="font-weight:700;">${winner} venceu ${loser}</div>
                        <div style="font-size:0.75rem; color:#D96C1A;">${m.result || "Placar não informado"} • ${date}</div>
                    </div>`;
        }).join('');
    }

    // ========== RANKINGS ==========
    function updateRankingTable() {
        const stats = {};
        players.forEach(p => { stats[p.id] = { jogos: 0, vitorias: 0, derrotas: 0 }; });
        
        matches.forEach(m => {
            m.winners?.forEach(w => { 
                if(stats[w]) {
                    stats[w].jogos += 1;
                    stats[w].vitorias += 1;
                }
            });
            m.losers?.forEach(l => { 
                if(stats[l]) {
                    stats[l].jogos += 1;
                    stats[l].derrotas += 1;
                }
            });
        });
        
        const sorted = Object.entries(stats).sort((a,b) => b[1].vitorias - a[1].vitorias);
        const tbody = document.getElementById("ranking-body");
        if(tbody) {
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
            }).join('');
            if(!sorted.length) tbody.innerHTML = "<tr><td colspan='6'>Nenhuma partida registrada</td></tr>";
        }
    }

    function updateRankingDuplas() {
        let duplaWins = {};
        matches.forEach(m => {
            if(m.type === "duplas" && m.winners?.length === 2) {
                const key = [m.winners[0], m.winners[1]].sort().join("_");
                duplaWins[key] = (duplaWins[key] || 0) + 1;
            }
        });
        const sorted = Object.entries(duplaWins).sort((a,b) => b[1] - a[1]);
        const div = document.getElementById("ranking-duplas");
        if(div) {
            div.innerHTML = sorted.map(([key, wins]) => {
                const ids = key.split("_");
                const p1 = players.find(p => p.id === ids[0]);
                const p2 = players.find(p => p.id === ids[1]);
                return `<div style="display:flex; justify-content:space-between; padding:12px; background:#FFF8F0; border-radius:40px; margin-bottom:8px;">
                            <span>${p1?.name || "?"} / ${p2?.name || "?"}</span>
                            <span style="color:#F47B20;">🏆 ${wins} títulos</span>
                        </div>`;
            }).join("") || "<div style='padding:20px; text-align:center;'>Nenhuma dupla registrada</div>";
        }
    }

    // ========== AÇÕES PRINCIPAIS ==========
    async function addPlayer(name, file) {
        if(!name || !name.trim()) {
            showToast("Digite o nome do jogador");
            return false;
        }
        try {
            let photoUrl = null;
            if(file) {
                const storageRef = ref(storage, `players/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                photoUrl = await getDownloadURL(storageRef);
            }
            await addDoc(collection(db, "players"), { 
                name: name.trim(), 
                photoUrl: photoUrl,
                createdAt: new Date().toISOString()
            });
            showToast(`✅ Jogador ${name} adicionado com sucesso!`);
            await loadPlayers();
            return true;
        } catch (error) {
            console.error("Erro ao adicionar jogador:", error);
            showToast("Erro ao adicionar jogador");
            return false;
        }
    }

    async function deletePlayer(playerId) {
        if(!playerId) {
            showToast("Selecione um jogador para remover");
            return;
        }
        try {
            await deleteDoc(doc(db, "players", playerId));
            showToast("Jogador removido com sucesso");
            await loadPlayers();
        } catch (error) {
            console.error("Erro ao remover jogador:", error);
            showToast("Erro ao remover jogador");
        }
    }

    async function registerLoser(playerId) {
        if(!playerId) {
            showToast("Selecione o perdedor da rodada");
            return;
        }
        try {
            await addDoc(collection(db, "losers"), {
                playerId: playerId,
                date: new Date().toISOString(),
                timestamp: Date.now()
            });
            showToast("💀 Perdedor hostilizado com sucesso!");
            await loadLosers();
        } catch (error) {
            console.error("Erro ao registrar perdedor:", error);
            showToast("Erro ao registrar perdedor");
        }
    }

    async function doCheckin(playerId) {
        if(!playerId) {
            showToast("Selecione um jogador para fazer check-in");
            return;
        }
        try {
            await addDoc(collection(db, "checkins"), {
                playerId: playerId,
                date: new Date().toISOString(),
                timestamp: Date.now()
            });
            showToast("✅ Check-in confirmado!");
            await loadCheckins();
        } catch (error) {
            console.error("Erro ao fazer check-in:", error);
            showToast("Erro ao fazer check-in");
        }
    }

    async function uploadPhoto(file) {
        if(!file) {
            showToast("Selecione uma foto primeiro");
            return;
        }
        try {
            const storageRef = ref(storage, `highlights/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            await addDoc(collection(db, "highlights"), {
                url: url,
                desc: "🎾 Momento épico do Quarteto Tenístico",
                timestamp: Date.now()
            });
            showToast("✨ Foto destacada como highlight!");
            await updateHighlights();
        } catch (error) {
            console.error("Erro ao enviar foto:", error);
            showToast("Erro ao enviar foto");
        }
    }

    async function updateHighlights() {
        try {
            const q = query(collection(db, "highlights"), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            const img = document.getElementById("highlights-img");
            const desc = document.getElementById("highlights-desc");
            if(!snap.empty && img && desc) {
                const last = snap.docs[0].data();
                img.src = last.url;
                desc.innerHTML = last.desc || "Momento inesquecível!";
            }
        } catch (error) {
            console.error("Erro ao carregar highlights:", error);
        }
    }

    // ========== SALVAR PARTIDA COM PLACAR (NOVA FUNÇÃO) ==========
    async function saveMatchWithScore() {
        const player1Id = document.getElementById("score-player1").value;
        const player2Id = document.getElementById("score-player2").value;
        
        if(!player1Id || !player2Id) {
            showToast("Selecione os dois jogadores");
            return;
        }
        if(player1Id === player2Id) {
            showToast("Selecione dois jogadores diferentes");
            return;
        }
        
        // Pegar os placares
        const s1p1 = parseInt(document.getElementById("set1-p1").value) || 0;
        const s1p2 = parseInt(document.getElementById("set1-p2").value) || 0;
        const s2p1 = parseInt(document.getElementById("set2-p1").value) || 0;
        const s2p2 = parseInt(document.getElementById("set2-p2").value) || 0;
        const s3p1 = parseInt(document.getElementById("set3-p1").value) || 0;
        const s3p2 = parseInt(document.getElementById("set3-p2").value) || 0;
        
        // Calcular vencedor
        let setsP1 = 0, setsP2 = 0;
        if(s1p1 > s1p2) setsP1++;
        else if(s1p2 > s1p1) setsP2++;
        if(s2p1 > s2p2) setsP1++;
        else if(s2p2 > s2p1) setsP2++;
        if(s3p1 > s3p2) setsP1++;
        else if(s3p2 > s3p1) setsP2++;
        
        let winnerId, loserId;
        if(setsP1 > setsP2) {
            winnerId = player1Id;
            loserId = player2Id;
        } else if(setsP2 > setsP1) {
            winnerId = player2Id;
            loserId = player1Id;
        } else {
            showToast("Empate! Verifique os placares");
            return;
        }
        
        // Formatar resultado
        const sets = [];
        if(s1p1 > 0 || s1p2 > 0) sets.push(`${s1p1}/${s1p2}`);
        if(s2p1 > 0 || s2p2 > 0) sets.push(`${s2p1}/${s2p2}`);
        if(s3p1 > 0 || s3p2 > 0) sets.push(`${s3p1}/${s3p2}`);
        const result = sets.join(" • ");
        
        try {
            await addDoc(collection(db, "matches"), {
                type: "simples",
                players: [player1Id, player2Id],
                winners: [winnerId],
                losers: [loserId],
                result: result,
                date: new Date().toISOString(),
                timestamp: Date.now()
            });
            
            showToast(`🎾 Partida registrada! Vencedor: ${players.find(p=>p.id===winnerId)?.name}`);
            
            // Limpar campos
            document.getElementById("set1-p1").value = "";
            document.getElementById("set1-p2").value = "";
            document.getElementById("set2-p1").value = "";
            document.getElementById("set2-p2").value = "";
            document.getElementById("set3-p1").value = "";
            document.getElementById("set3-p2").value = "";
            document.getElementById("score-player1").value = "";
            document.getElementById("score-player2").value = "";
            
            await loadMatches();
        } catch (error) {
            console.error("Erro ao salvar partida:", error);
            showToast("Erro ao salvar partida");
        }
    }

    // Calcular vencedor em tempo real
    function calculateWinnerPreview() {
        const s1p1 = parseInt(document.getElementById("set1-p1").value) || 0;
        const s1p2 = parseInt(document.getElementById("set1-p2").value) || 0;
        const s2p1 = parseInt(document.getElementById("set2-p1").value) || 0;
        const s2p2 = parseInt(document.getElementById("set2-p2").value) || 0;
        const s3p1 = parseInt(document.getElementById("set3-p1").value) || 0;
        const s3p2 = parseInt(document.getElementById("set3-p2").value) || 0;
        
        let setsP1 = 0, setsP2 = 0;
        if(s1p1 > s1p2) setsP1++;
        else if(s1p2 > s1p1) setsP2++;
        if(s2p1 > s2p2) setsP1++;
        else if(s2p2 > s2p1) setsP2++;
        if(s3p1 > s3p2) setsP1++;
        else if(s3p2 > s3p1) setsP2++;
        
        const winnerDiv = document.getElementById("winner-calc");
        if(winnerDiv) {
            if(setsP1 > setsP2) winnerDiv.innerHTML = "🏆 VENCEDOR: JOGADOR 1 🏆";
            else if(setsP2 > setsP1) winnerDiv.innerHTML = "🏆 VENCEDOR: JOGADOR 2 🏆";
            else winnerDiv.innerHTML = "⚖️ Aguardando placar válido...";
        }
    }

    async function updateNextMatchDisplay() {
        const today = new Date().toDateString();
        const todayCheckins = checkins.filter(c => new Date(c.date).toDateString() === today);
        const checkedIds = todayCheckins.map(c => c.playerId);
        const available = players.filter(p => checkedIds.includes(p.id));
        
        const container = document.getElementById("next-match-players-container");
        const statusDiv = document.getElementById("next-match-status");
        
        if(!container) return;
        
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
            if(statusDiv) statusDiv.innerHTML = `✅ Jogo confirmado! (${available.length} jogadores confirmados)`;
        } else {
            container.innerHTML = `
                <div class="next-player"><div class="next-player-photo"><i class="fas fa-question" style="font-size:30px; color:#F47B20;"></i></div><div class="next-player-name">Aguardando</div></div>
                <div class="vs-divider">VS</div>
                <div class="next-player"><div class="next-player-photo"><i class="fas fa-question" style="font-size:30px; color:#F47B20;"></i></div><div class="next-player-name">Aguardando</div></div>
            `;
            if(statusDiv) statusDiv.innerHTML = `⏳ Aguardando check-ins... (${available.length}/2 jogadores)`;
        }
    }

    // ========== MENU TABS ==========
    function setupTabs() {
        const btns = document.querySelectorAll(".menu-btn");
        const tabs = ["home-tab", "placar-tab", "rankings-tab", "admin-tab"];
        btns.forEach((btn, idx) => {
            btn.addEventListener("click", () => {
                btns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                tabs.forEach(t => {
                    const el = document.getElementById(t);
                    if(el) el.classList.add("hidden");
                });
                const activeTab = document.getElementById(tabs[idx]);
                if(activeTab) activeTab.classList.remove("hidden");
            });
        });
    }

    // ========== EVENT LISTENERS ==========
    function bindEvents() {
        const addBtn = document.getElementById("add-player-btn");
        if(addBtn) addBtn.onclick = () => {
            const name = document.getElementById("new-player-name").value;
            const file = document.getElementById("player-photo").files[0];
            addPlayer(name, file);
            document.getElementById("new-player-name").value = "";
            document.getElementById("player-photo").value = "";
            const preview = document.getElementById("photo-preview");
            if(preview) preview.innerHTML = "";
        };
        
        const deleteBtn = document.getElementById("delete-player-btn");
        if(deleteBtn) deleteBtn.onclick = () => deletePlayer(document.getElementById("delete-player-select").value);
        
        const loserBtn = document.getElementById("register-loser");
        if(loserBtn) loserBtn.onclick = () => registerLoser(document.getElementById("loser-select").value);
        
        const checkinBtn = document.getElementById("do-checkin");
        if(checkinBtn) checkinBtn.onclick = () => doCheckin(document.getElementById("checkin-player-select").value);
        
        const uploadBtn = document.getElementById("upload-photo-btn");
        if(uploadBtn) uploadBtn.onclick = () => uploadPhoto(document.getElementById("match-photo").files[0]);
        
        const saveScoreBtn = document.getElementById("save-score-match");
        if(saveScoreBtn) saveScoreBtn.onclick = saveMatchWithScore;
        
        // Preview de foto do jogador
        const photoInput = document.getElementById("player-photo");
        if(photoInput) {
            photoInput.addEventListener("change", (e) => {
                if(e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const preview = document.getElementById("photo-preview");
                        if(preview) preview.innerHTML = `<img src="${ev.target.result}" style="width:60px;height:60px;border-radius:40px;object-fit:cover;">`;
                    };
                    reader.readAsDataURL(e.target.files[0]);
                }
            });
        }
        
        // Calcular vencedor em tempo real
        const scoreInputs = ["set1-p1", "set1-p2", "set2-p1", "set2-p2", "set3-p1", "set3-p2"];
        scoreInputs.forEach(id => {
            const input = document.getElementById(id);
            if(input) input.addEventListener("input", calculateWinnerPreview);
        });
    }

    // ========== INIT ==========
    document.addEventListener("DOMContentLoaded", async () => {
        console.log("Iniciando aplicação...");
        setupTabs();
        bindEvents();
        await loadPlayers();
        await loadMatches();
        await loadCheckins();
        await loadLosers();
        console.log("Aplicação inicializada com sucesso!");
    });
})();
